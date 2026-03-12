/* ═══════════════════════════════════════════════════
   MAIN — Entry point, wires everything together
   ═══════════════════════════════════════════════════ */

import './styles/main.css';
import store from './data/store.js';
import { supabase, getSession } from './data/supabase.js';
import { importOrdersFromExcel, exportToExcel, exportGanttTable } from './data/excel.js';
import { runScheduler, detectPieceType, calcProductionDays } from './scheduler/engine.js';
import { computeAnalytics } from './scheduler/analytics.js';
import { renderOrdersTable } from './ui/ordersTable.js';
import { renderScheduleTable } from './ui/planningTable.js';
import { renderGanttChart, ganttZoomIn, ganttZoomOut, ganttScrollToToday, downloadGanttAsPng } from './ui/ganttChart.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderAiChatWidget } from './ui/aiChat.js';
import { renderPostitBoard } from './ui/postitBoard.js';
import { renderAuthPage } from './ui/authPage.js';
import { initWorkspaceUI } from './ui/workspace.js';
import { openProfilePanel, getUserInitials } from './ui/profile.js';

// ── i18n Static Translations
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = store.t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = store.t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = store.t(key);
    });
}

// ── Initialize (async because Supabase load is async)
async function init() {
    const hash = window.location.hash;

    // Handle specific error hashes
    if (hash.includes('error=')) {
        const params = new URLSearchParams(hash.replace('#', ''));
        const desc = params.get('error_description') || 'The link is invalid or has expired.';
        history.replaceState(null, '', window.location.pathname); // clean URL
        renderAuthPage(decodeURIComponent(desc.replace(/\+/g, ' ')));
        return;
    }

    // Let Supabase extract the session first BEFORE we clear the URL hash.
    const session = await getSession();

    if (hash.includes('access_token=')) {
        // Only clean the URL *after* getSession has processed the tokens
        history.replaceState(null, '', window.location.pathname);
    }

    if (!session) {
        renderAuthPage();
        return;
    }

    // --- PROCESS INVITATIONS ---
    if (hash.includes('invite=')) {
        const inviteMatch = hash.match(/#invite=([a-zA-Z0-9-]+)/);
        const inviteId = inviteMatch ? inviteMatch[1] : null;

        if (inviteId) {
            try {
                // Fetch the invitation
                const { data: inv, error: invErr } = await supabase.from('invitations').select('*').eq('id', inviteId).single();

                if (inv && inv.status === 'pending') {
                    // Add user to the project collaborators
                    const { error: collabErr } = await supabase.from('collaborators').insert({
                        project_id: inv.project_id,
                        user_id: session.user.id,
                        role: inv.role
                    });

                    // Error code 23505 means they are already a member
                    if (!collabErr || collabErr.code === '23505') {
                        // Mark invite as accepted
                        await supabase.from('invitations').update({ status: 'accepted' }).eq('id', inviteId);

                        // Set local storage so the store selects this new project
                        localStorage.setItem('current_project_id', inv.project_id);
                        if (!collabErr) alert('Successfully joined the project!');
                    } else {
                        console.error('Error joining project:', collabErr);
                        alert('Could not join project: ' + collabErr.message);
                    }
                } else if (invErr) {
                    console.error('Invitation lookup error:', invErr);
                } else {
                    alert('This invitation is no longer valid or has already been accepted.');
                }
            } catch (err) {
                console.error('Invite processing error:', err);
                alert('Failed to process invitation.');
            }
        }
        // Clean up the URL
        history.replaceState(null, '', window.location.pathname);
    }

    await startApp();
}

async function startApp() {
    // Show loading state
    document.body.classList.add('loading');

    await store.load();

    // Set rate input to stored value
    const rateInput = document.getElementById('rate-input');
    if (rateInput) rateInput.value = store.piecesPerDay;

    // Set up language toggle
    const langToggle = document.getElementById('lang-toggle');
    if (langToggle) {
        langToggle.value = store.language;
        langToggle.addEventListener('change', (e) => {
            store.setLanguage(e.target.value);
        });
    }

    // Wire Header Avatar → opens profile panel
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) {
        // Set initials from user email
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.email) {
            headerAvatar.textContent = getUserInitials(userData.user.email);
        }
        headerAvatar.addEventListener('click', () => openProfilePanel());
    }

    // Render all views
    applyTranslations();
    initWorkspaceUI();
    renderAll();
    renderAiChatWidget();

    // Subscribe to store changes
    store.subscribe(() => {
        applyTranslations();
        renderAll();
        if (rateInput) rateInput.value = store.piecesPerDay;
    });

    // Remove loading state
    document.body.classList.remove('loading');
    console.log('App initialized');
}

// ── Render all views
function renderAll() {
    renderOrdersTable();
    renderScheduleTable();
    renderGanttChart();
    renderDashboard();
    renderPostitBoard();

    // Show visibility manager only for admins/planners/managers
    const visBtn = document.getElementById('btn-visibility-manager');
    if (visBtn) {
        if (store.currentRole !== 'viewer') visBtn.classList.remove('hidden');
        else visBtn.classList.add('hidden');
    }
}

// ── Auth state listener
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.reload(); // Hard reload to clear all memory and states
    } else if (event === 'SIGNED_IN') {
        // If OAuth completes slightly after initial render, or if logging in same-tab
        const authRoot = document.getElementById('auth-root');
        if (authRoot) {
            // Remove the login screen and start the app natively
            authRoot.remove();
            startApp();
        }
    }
});

init();


// ── Tab Navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

// ── Production rate control
const rateInput = document.getElementById('rate-input');
rateInput.addEventListener('change', () => {
    const val = parseInt(rateInput.value, 10);
    if (!val || val < 50 || val > 2000) {
        rateInput.value = store.piecesPerDay;
        return;
    }
    store.piecesPerDay = val;
    // Recalculate durations for all orders
    store.orders.forEach(o => {
        if (o.quantity) {
            o.duration = Math.ceil(o.quantity / val);
        }
    });
    store.save();
    store.notify();
});

// ── Add Order Modal
const modal = document.getElementById('order-modal');
const form = document.getElementById('order-form');

document.getElementById('btn-add-order').addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Add Order';
    document.getElementById('form-edit-index').value = '-1';
    form.reset();
    // Set default dates
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    document.getElementById('form-arrival').value = today;
    document.getElementById('form-delivery').value = nextWeek;
    document.getElementById('form-duration').value = '5';
    modal.classList.remove('hidden');
});

document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
document.getElementById('form-cancel').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const model = document.getElementById('form-model').value.trim();
    const quantity = parseInt(document.getElementById('form-quantity').value) || 0;
    const order = {
        id: document.getElementById('form-id').value.trim(),
        client: document.getElementById('form-client').value.trim(),
        model,
        pieceType: detectPieceType(model),
        quantity,
        arrivalDate: document.getElementById('form-arrival').value,
        deliveryDate: document.getElementById('form-delivery').value,
        duration: calcProductionDays(quantity),
        priority: document.getElementById('form-priority').value,
        lockedChain: document.getElementById('form-lock').value,
    };

    const editIdx = parseInt(document.getElementById('form-edit-index').value);
    if (editIdx >= 0) {
        store.updateOrder(editIdx, order);
        showToast(store.t('toastUpdated'));
    } else {
        store.addOrder(order);
        showToast(store.t('toastAdded'));
    }
    modal.classList.add('hidden');
});

// ── Clear All Orders (uses custom modal instead of native confirm to avoid blocking dialog)
document.getElementById('btn-clear-orders').addEventListener('click', () => {
    const modal = document.getElementById('delete-modal');
    if (!modal) return;

    const msg = document.getElementById('delete-modal-msg');
    if (msg) msg.textContent = store.t('confirmClearAllText');
    const btnConfirm = document.getElementById('delete-confirm');
    const btnCancel = document.getElementById('delete-cancel');
    const btnClose = document.getElementById('delete-modal-close');

    const cleanup = () => {
        modal.classList.add('hidden');
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        // Restore original message
        if (msg) msg.textContent = 'Are you sure you want to delete this order?';
    };

    const onConfirm = () => {
        store.clearAll();
        showToast(store.t('toastCleared'));
        cleanup();
    };

    const onCancel = () => {
        cleanup();
    };

    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    btnClose.addEventListener('click', onCancel);
    modal.classList.remove('hidden');
});

// ── Run Scheduler
document.getElementById('btn-reschedule').addEventListener('click', () => {
    if (store.orders.length === 0) {
        showToast(store.t('noOrders'));
        return;
    }
    const result = runScheduler(store.orders);
    store.setSchedule(result.schedule);

    if (result.unscheduled.length > 0) {
        showToast(`${result.unscheduled.length} order(s) could not be scheduled`);
    } else {
        showToast(`${result.schedule.length} orders scheduled successfully`);
    }

    // Switch to schedule tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="schedule"]').classList.add('active');
    document.getElementById('tab-schedule').classList.add('active');
});

// ── Import Excel (with project creation step)
const fileInput = document.getElementById('file-input');
let _pendingImportOrders = null;
let _pendingImportFileName = '';

document.getElementById('btn-import').addEventListener('click', () => fileInput.click());

async function handleImportFile(file) {
    if (!file) return;
    try {
        const buffer = await file.arrayBuffer();
        const orders = importOrdersFromExcel(buffer);
        if (orders.length === 0) {
            showToast('No orders found in the file');
            return;
        }
        // Store parsed orders and show project-name modal
        _pendingImportOrders = orders;
        _pendingImportFileName = file.name;

        const modal = document.getElementById('import-project-modal');
        const nameInput = document.getElementById('import-project-name');
        const fileInfo = document.getElementById('import-file-info');

        // Pre-fill with a sensible default based on filename
        const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, '').replace(/[_-]/g, ' ');
        nameInput.value = baseName;
        fileInfo.textContent = `File: ${file.name} · ${orders.length} order(s) found`;

        modal.classList.remove('hidden');
        nameInput.focus();
        nameInput.select();
    } catch (err) {
        showToast('Failed to import file: ' + err.message);
        console.error(err);
    }
    fileInput.value = '';
}

fileInput.addEventListener('change', (e) => handleImportFile(e.target.files[0]));

// ── Import Project Modal handlers
const importProjectModal = document.getElementById('import-project-modal');
const importProjectConfirm = document.getElementById('import-project-confirm');
const importProjectCancel = document.getElementById('import-project-cancel');
const importProjectClose = document.getElementById('import-project-close');

function closeImportModal() {
    importProjectModal.classList.add('hidden');
    _pendingImportOrders = null;
    _pendingImportFileName = '';
}

importProjectCancel.addEventListener('click', closeImportModal);
importProjectClose.addEventListener('click', closeImportModal);
importProjectModal.addEventListener('click', (e) => { if (e.target === importProjectModal) closeImportModal(); });

importProjectConfirm.addEventListener('click', async () => {
    const nameInput = document.getElementById('import-project-name');
    const projectName = nameInput.value.trim();
    if (!projectName) {
        nameInput.style.borderColor = 'var(--danger)';
        nameInput.focus();
        return;
    }

    if (!_pendingImportOrders || _pendingImportOrders.length === 0) {
        closeImportModal();
        return;
    }

    // Disable button while working
    const oldText = importProjectConfirm.textContent;
    importProjectConfirm.textContent = 'Creating...';
    importProjectConfirm.disabled = true;

    try {
        // 1. Create new project
        await store.createProject(projectName);

        // 2. Load orders into the new project
        store.setOrders(_pendingImportOrders);

        showToast(`Imported ${_pendingImportOrders.length} orders into "${projectName}"`);
        closeImportModal();
    } catch (err) {
        showToast('Failed to create project: ' + err.message);
        console.error(err);
    } finally {
        importProjectConfirm.textContent = oldText;
        importProjectConfirm.disabled = false;
    }
});

// ── Drop zone
const dropZone = document.getElementById('drop-zone');

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    handleImportFile(file);
});
dropZone.addEventListener('click', () => fileInput.click());

// ── Visibility Manager Modal
const visModal = document.getElementById('visibility-modal');
if (visModal) {
    document.getElementById('btn-visibility-manager').addEventListener('click', () => {
        visModal.classList.remove('hidden');
    });

    const closeVis = () => {
        visModal.classList.add('hidden');
        document.getElementById('visibility-client-input').value = '';
        document.getElementById('visibility-month-input').value = '';
    };

    document.getElementById('visibility-modal-close').addEventListener('click', closeVis);
    document.getElementById('visibility-modal-done').addEventListener('click', closeVis);
    visModal.addEventListener('click', (e) => { if (e.target === visModal) closeVis(); });

    // Client hide/show
    document.getElementById('btn-hide-client').addEventListener('click', () => {
        const client = document.getElementById('visibility-client-input').value;
        if (client) {
            store.setClientHidden(client, true);
            showToast(`Hidden orders for client: ${client}`);
        }
    });

    document.getElementById('btn-show-client').addEventListener('click', () => {
        const client = document.getElementById('visibility-client-input').value;
        if (client) {
            store.setClientHidden(client, false);
            showToast(`Showing orders for client: ${client}`);
        }
    });

    // Month hide/show
    document.getElementById('btn-hide-month').addEventListener('click', () => {
        const month = document.getElementById('visibility-month-input').value;
        if (month) {
            store.setMonthHidden(month, true);
            showToast(`Hidden orders for month: ${month}`);
        }
    });

    document.getElementById('btn-show-month').addEventListener('click', () => {
        const month = document.getElementById('visibility-month-input').value;
        if (month) {
            store.setMonthHidden(month, false);
            showToast(`Showing orders for month: ${month}`);
        }
    });
}

// ── Export Excel
document.getElementById('btn-export').addEventListener('click', () => {
    if (store.orders.length === 0) {
        showToast(store.t('noOrders'));
        return;
    }
    const analytics = computeAnalytics(store.orders, store.schedule);
    exportToExcel(store.orders, store.schedule, analytics);
    showToast(store.t('toastExported'));
});



// ── Gantt controls
document.getElementById('gantt-zoom-in').addEventListener('click', ganttZoomIn);
document.getElementById('gantt-zoom-out').addEventListener('click', ganttZoomOut);

// ── Download Gantt Table button
document.getElementById('btn-download-gantt-table').addEventListener('click', () => {
    if (store.schedule.length === 0) {
        showToast(store.t('noSchedule'));
        return;
    }
    exportGanttTable(store.orders, store.schedule);
    showToast(store.t('toastExported'));
});
document.getElementById('gantt-today').addEventListener('click', ganttScrollToToday);

// ── Download Gantt Chart as PNG
document.getElementById('btn-download-chart').addEventListener('click', () => {
    if (store.schedule.length === 0) {
        showToast('⚠ ' + store.t('noSchedule'));
        return;
    }
    downloadGanttAsPng();
});

// ── Toast notification
function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Keyboard shortcut
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        modal.classList.add('hidden');
    }
});
