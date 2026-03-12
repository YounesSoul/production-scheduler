import store from '../data/store.js';
import { supabase } from '../data/supabase.js';

let isInitialized = false;

export function initWorkspaceUI() {
    if (isInitialized) return;
    isInitialized = true;

    const projectSelect = document.getElementById('project-select');
    const btnEditProject = document.getElementById('btn-edit-project');
    const btnManageMembers = document.getElementById('btn-manage-members');
    const membersModal = document.getElementById('members-modal');
    const membersClose = document.getElementById('members-close');
    const membersList = document.getElementById('members-list');
    const inviteForm = document.getElementById('invite-form');
    const inviteStatus = document.getElementById('invite-status');

    initNotifications(); // Hook up real-time notifications

    // 1. Subscribe to store changes to update dropdown and permissions
    const updateWorkspaceUI = () => {
        if (!projectSelect) return;

        if (store.projects.length > 0) {
            projectSelect.style.display = 'block';

            // Rebuild options if they changed amount OR name
            let needsRebuild = projectSelect.options.length !== store.projects.length;
            if (!needsRebuild) {
                for (let i = 0; i < store.projects.length; i++) {
                    if (projectSelect.options[i].textContent !== store.projects[i].name) {
                        needsRebuild = true;
                        break;
                    }
                }
            }

            if (needsRebuild) {
                projectSelect.innerHTML = '';
                store.projects.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    projectSelect.appendChild(opt);
                });
            }

            // Set value without triggering change event
            if (projectSelect.value !== store.currentProjectId) {
                projectSelect.value = store.currentProjectId;
            }
        } else {
            projectSelect.style.display = 'none';
        }

        // Role-based UI updates
        const isPlannerOrAdmin = ['admin', 'planner'].includes(store.currentRole);

        // Toggle class on body to allow CSS to hide strictly editing elements (like table actions)
        document.body.classList.toggle('role-readonly', !isPlannerOrAdmin);

        const writeElements = [
            document.getElementById('btn-add-order'),
            document.getElementById('btn-clear-orders'),
            document.getElementById('btn-import'),
            document.getElementById('btn-reschedule'),
            document.getElementById('btn-visibility-manager'),
            document.getElementById('drop-zone')
        ];

        writeElements.forEach(el => {
            if (el) {
                el.style.display = isPlannerOrAdmin ? '' : 'none';
            }
        });

        if (store.currentRole === 'admin') {
            if (btnManageMembers) btnManageMembers.style.display = 'inline-flex';
            if (btnEditProject) btnEditProject.style.display = 'inline-flex';
        } else if (store.projects.length > 0) {
            if (btnManageMembers) btnManageMembers.style.display = 'inline-flex'; // Non-admins can SEE members, just maybe not manage
            if (btnEditProject) btnEditProject.style.display = 'none';
        } else {
            if (btnManageMembers) btnManageMembers.style.display = 'none';
            if (btnEditProject) btnEditProject.style.display = 'none';
        }
    };

    store.subscribe(updateWorkspaceUI);
    updateWorkspaceUI(); // Call immediately for initial state


    // 2. Change Project Event
    if (projectSelect) {
        projectSelect.addEventListener('change', async (e) => {
            const newId = e.target.value;
            if (newId) {
                await store.changeProject(newId);
            }
        });
    }

    // Rename Project Event
    if (btnEditProject) {
        btnEditProject.addEventListener('click', async () => {
            if (!projectSelect) return;
            const currentName = projectSelect.options[projectSelect.selectedIndex]?.textContent || '';
            const newName = prompt('Enter new project name:', currentName);

            if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
                const oldText = btnEditProject.innerHTML;
                btnEditProject.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin:2px"></span>';

                try {
                    await store.renameProject(newName.trim());
                } catch (err) {
                    alert('Failed to rename project: ' + err.message);
                } finally {
                    btnEditProject.innerHTML = oldText;
                }
            }
        });
    }

    // 3. Manage Members Flow
    if (btnManageMembers && membersModal) {
        btnManageMembers.addEventListener('click', async () => {
            membersModal.classList.remove('hidden');
            await loadMembers(membersList);
        });

        membersClose.addEventListener('click', () => {
            membersModal.classList.add('hidden');
            if (inviteStatus) inviteStatus.textContent = '';
        });
    }

    // 4. Invite Form Submit
    if (inviteForm) {
        inviteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('invite-email').value;
            const role = document.getElementById('invite-role').value;

            if (!email) return;

            const btnSubmit = document.getElementById('btn-send-invite');
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Sending...';
            inviteStatus.textContent = '';
            inviteStatus.style.color = 'var(--text-secondary)';

            try {
                const { data: userData } = await supabase.auth.getUser();
                const inviterId = userData?.user?.id;

                // Let's get the inviter's name and project name for the email
                const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', inviterId).single();
                const inviterName = profile?.full_name || profile?.email || 'A user';
                const project = store.projects.find(p => p.id === store.currentProjectId);
                const projectName = project ? project.name : 'A project';

                // Insert into invitations table
                // Expiration is 7 days from now
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);

                const { data: invData, error: dbErr } = await supabase.from('invitations').insert({
                    project_id: store.currentProjectId,
                    inviter_id: inviterId,
                    invitee_email: email,
                    role: role,
                    expires_at: expiresAt.toISOString(),
                    status: 'pending'
                }).select('id').single();

                if (dbErr) throw dbErr;

                // Trigger Edge Function to send email
                const inviteLink = `${window.location.origin}/#invite=${invData.id}`;

                const { data: fnData, error: fnErr } = await supabase.functions.invoke('resend-invite', {
                    headers: {
                        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                    },
                    body: {
                        email,
                        role,
                        projectName,
                        inviterName,
                        inviteLink
                    }
                });

                if (fnErr) {
                    console.error("Raw fnErr:", fnErr);
                    let actualErrorMsg = fnErr.message;

                    // Supabase JS sometimes hides the true JSON body of a 400 error inside the context
                    try {
                        if (fnErr.context) {
                            const errBody = await fnErr.context.json();
                            actualErrorMsg = errBody.error || errBody.message || actualErrorMsg;
                        }
                    } catch (e) {
                        // Ignore parse parsing errors
                    }
                    throw new Error(`Edge Function: ${actualErrorMsg}`);
                }

                inviteStatus.textContent = `Invitation sent to ${email}!`;
                inviteStatus.style.color = 'var(--success, #10b981)';
                inviteForm.reset();

            } catch (err) {
                console.error("Invite error:", err);
                inviteStatus.textContent = `Error: ${err.message}`;
                inviteStatus.style.color = 'var(--danger, #ef4444)';
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Invite';
            }
        });
    }
}

async function loadMembers(listEl) {
    listEl.innerHTML = '<p style="color:var(--text-secondary); font-size: 0.9rem;">Loading members...</p>';
    try {
        const { data, error } = await supabase
            .from('collaborators')
            .select(`
        role,
        joined_at,
        profiles ( email, full_name, avatar_url )
      `)
            .eq('project_id', store.currentProjectId);

        if (error) throw error;

        listEl.innerHTML = '';
        data.forEach(m => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.justifyContent = 'space-between';
            li.style.padding = '0.5rem';
            li.style.background = 'var(--bg-secondary)';
            li.style.borderRadius = 'var(--radius)';

            const name = m.profiles?.full_name || m.profiles?.email || 'Unknown User';
            const roleBadgeColor = m.role === 'admin' ? 'var(--primary)' : 'var(--text-secondary)';

            li.innerHTML = `
        <div style="display:flex; align-items:center; gap: 0.75rem;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #e2e8f0; display:flex; align-items:center; justify-content:center; font-weight:600; color:#64748b; font-size: 0.75rem;">
            ${name.charAt(0).toUpperCase()}
          </div>
          <span style="font-weight: 500; font-size: 0.9rem;">${name}</span>
        </div>
        <span style="font-size: 0.75rem; font-weight: 600; color: ${roleBadgeColor}; text-transform: uppercase;">${m.role}</span>
      `;
            listEl.appendChild(li);
        });
    } catch (err) {
        listEl.innerHTML = `<p style="color:var(--danger)">Failed to load: ${err.message}</p>`;
    }
}

// ── NOTIFICATIONS ───────────────────────────────────────
let notifChannel = null;

async function initNotifications() {
    const btnNotif = document.getElementById('btn-notifications');
    const notifDropdown = document.getElementById('notif-dropdown');
    const badge = document.getElementById('notif-badge');
    const notifList = document.getElementById('notif-list');
    const btnReadAll = document.getElementById('btn-read-all');
    if (!btnNotif) return;

    // Toggle Dropdown
    btnNotif.addEventListener('click', () => {
        notifDropdown.classList.toggle('hidden');
    });

    // Close when click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.notification-container')) {
            notifDropdown.classList.add('hidden');
        }
    });

    try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) return;

        // Fetch initial unread notifications
        const fetchNotifs = async () => {
            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .eq('is_read', false)
                .order('created_at', { ascending: false })
                .limit(10);

            renderNotifs(data || []);
        };

        const renderNotifs = (data) => {
            if (data.length === 0) {
                badge.classList.add('hidden');
                notifList.innerHTML = '<div style="padding:10px;text-align:center;">No new notifications</div>';
                return;
            }
            badge.textContent = data.length > 9 ? '9+' : data.length;
            badge.classList.remove('hidden');

            notifList.innerHTML = data.map(n => `
                <div style="padding:10px; border-bottom:1px solid var(--border-light); cursor:pointer;" class="notif-item" data-id="${n.id}">
                    <div style="font-weight:500; color:var(--text-primary); margin-bottom:4px;">${n.type.replace('_', ' ').toUpperCase()}</div>
                    <div>${n.content}</div>
                    <div style="font-size:9px; color:var(--text-muted); margin-top:4px;">${new Date(n.created_at).toLocaleString()}</div>
                </div>
            `).join('');

            // Mark individual read
            notifList.querySelectorAll('.notif-item').forEach(el => {
                el.addEventListener('click', async () => {
                    await supabase.from('notifications').update({ is_read: true }).eq('id', el.dataset.id);
                    fetchNotifs();
                });
            });
        };

        await fetchNotifs();

        // Mark all read
        if (btnReadAll) {
            btnReadAll.addEventListener('click', async () => {
                await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
                fetchNotifs();
                notifDropdown.classList.add('hidden');
            });
        }

        // Realtime Subscription
        if (notifChannel) supabase.removeChannel(notifChannel);
        notifChannel = supabase.channel('user-notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => {
                fetchNotifs();

                // Show generic toast
                const toast = document.createElement('div');
                toast.className = 'toast toast-info';
                toast.textContent = `🔔 ${payload.new.content}`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 4000);
            })
            .subscribe();

    } catch (e) {
        console.warn("Notifications init failed", e);
    }
}
