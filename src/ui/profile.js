/* ═══════════════════════════════════════════════════
   PROFILE PANEL — Premium user profile overlay
   ═══════════════════════════════════════════════════ */

import { supabase } from '../data/supabase.js';
import store from '../data/store.js';

// ── Helpers ──
function t(key) { return store.t(key); }

function getInitials(email) {
    if (!email) return '?';
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return email.substring(0, 2).toUpperCase();
}

function getPasswordStrength(pwd) {
    if (!pwd) return { level: 0, label: '' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return { level: 1, label: 'weak', key: 'profileStrengthWeak' };
    if (score === 2) return { level: 2, label: 'fair', key: 'profileStrengthFair' };
    if (score === 3) return { level: 3, label: 'good', key: 'profileStrengthGood' };
    return { level: 4, label: 'strong', key: 'profileStrengthStrong' };
}

// SVG icon helpers (matching the app's feather-style icons)
const ICONS = {
    user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    globe: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    monitor: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    layout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
};

// ── Notification preferences (persisted in localStorage) ──
const NOTIF_PREFS_KEY = 'profile_notif_prefs';
function loadNotifPrefs() {
    try {
        return JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY)) || {
            overload: true, deadline: true, schedule: true, collaboration: false
        };
    } catch { return { overload: true, deadline: true, schedule: true, collaboration: false }; }
}
function saveNotifPrefs(prefs) {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
}

// ══════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════

export async function openProfilePanel() {
    // Remove any existing profile overlay
    const existing = document.querySelector('.profile-overlay');
    if (existing) existing.remove();

    // Get user from Supabase
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;

    const email = user.email || '';
    const initials = getInitials(email);
    const role = store.currentRole || 'viewer';
    const createdAt = user.created_at ? new Date(user.created_at).toLocaleDateString(store.language === 'fr' ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

    const notifPrefs = loadNotifPrefs();

    // ── Build HTML ──
    const overlay = document.createElement('div');
    overlay.className = 'profile-overlay';
    overlay.innerHTML = `
    <div class="profile-container">
        <!-- Sidebar -->
        <aside class="profile-sidebar">
            <div class="profile-sidebar-header">
                <div class="profile-avatar">${initials}</div>
                <div class="profile-sidebar-info">
                    <h3>${email.split('@')[0]}</h3>
                    <p>${email}</p>
                </div>
            </div>
            <nav class="profile-nav">
                <button class="profile-tab-btn active" data-profile-tab="general">
                    ${ICONS.user} <span>${t('profileGeneral')}</span>
                </button>
                <button class="profile-tab-btn" data-profile-tab="preferences">
                    ${ICONS.settings} <span>${t('profilePreferences')}</span>
                </button>
                <button class="profile-tab-btn" data-profile-tab="security">
                    ${ICONS.shield} <span>${t('profileSecurity')}</span>
                </button>
                <button class="profile-tab-btn" data-profile-tab="notifications">
                    ${ICONS.bell} <span>${t('profileNotifications')}</span>
                </button>
            </nav>
            <button class="profile-signout-btn" id="profile-signout">
                ${ICONS.logout} <span>${t('profileSignOut')}</span>
            </button>
        </aside>

        <!-- Content -->
        <div class="profile-content">
            <div class="profile-content-header">
                <h2>${t('profileTitle')}</h2>
                <button class="profile-close-btn" id="profile-close">&times;</button>
            </div>

            <!-- ═══ GENERAL TAB ═══ -->
            <div class="profile-panel active" data-profile-panel="general">
                <div class="profile-general-header">
                    <div class="profile-avatar-lg">${initials}</div>
                    <h3>${email.split('@')[0]}</h3>
                    <p>${email}</p>
                </div>

                <div class="profile-card">
                    <div class="profile-card-title">
                        ${ICONS.mail} ${t('profileGeneral')}
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">${t('profileEmail')}</div>
                        <div class="profile-info-value">
                            ${email}
                            <span class="profile-badge profile-badge-verified">${ICONS.check} ${t('profileVerified')}</span>
                        </div>
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">${t('profileRole')}</div>
                        <div class="profile-info-value">
                            <span class="profile-badge profile-badge-role">${role}</span>
                        </div>
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">${t('profileMemberSince')}</div>
                        <div class="profile-info-value">${createdAt}</div>
                    </div>
                </div>
            </div>

            <!-- ═══ PREFERENCES TAB ═══ -->
            <div class="profile-panel" data-profile-panel="preferences">
                <div class="profile-card">
                    <div class="profile-card-title">
                        ${ICONS.globe} ${t('profileLanguage')}
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">
                            ${t('profileLanguage')}
                            <small>${t('profileLanguageDesc')}</small>
                        </div>
                        <select class="profile-select" id="profile-lang">
                            <option value="en" ${store.language === 'en' ? 'selected' : ''}>English</option>
                            <option value="fr" ${store.language === 'fr' ? 'selected' : ''}>Français</option>
                        </select>
                    </div>
                </div>

                <div class="profile-card">
                    <div class="profile-card-title">
                        ${ICONS.monitor} ${t('profileTheme')}
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">
                            ${t('profileTheme')}
                            <small>${t('profileThemeDesc')}</small>
                        </div>
                        <select class="profile-select" id="profile-theme">
                            <option value="dark" selected>${t('profileThemeDark')}</option>
                            <option value="light" disabled>${t('profileThemeLight')} (Coming soon)</option>
                            <option value="system" disabled>${t('profileThemeSystem')} (Coming soon)</option>
                        </select>
                    </div>
                </div>

                <div class="profile-card">
                    <div class="profile-card-title">
                        ${ICONS.layout} ${t('profileDefaultView')}
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">
                            ${t('profileDefaultView')}
                            <small>${t('profileDefaultViewDesc')}</small>
                        </div>
                        <select class="profile-select" id="profile-default-view">
                            <option value="orders" ${localStorage.getItem('profile_default_view') === 'orders' || !localStorage.getItem('profile_default_view') ? 'selected' : ''}>Orders</option>
                            <option value="schedule" ${localStorage.getItem('profile_default_view') === 'schedule' ? 'selected' : ''}>Schedule</option>
                            <option value="gantt" ${localStorage.getItem('profile_default_view') === 'gantt' ? 'selected' : ''}>Gantt</option>
                            <option value="dashboard" ${localStorage.getItem('profile_default_view') === 'dashboard' ? 'selected' : ''}>Dashboard</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- ═══ SECURITY TAB ═══ -->
            <div class="profile-panel" data-profile-panel="security">
                <div class="profile-card">
                    <div class="profile-card-title">
                        ${ICONS.lock} ${t('profileChangePassword')}
                    </div>
                    <form id="profile-password-form">
                        <div class="profile-form-group">
                            <label>${t('profileNewPassword')}</label>
                            <input type="password" class="profile-input" id="profile-new-pwd" placeholder="••••••••" autocomplete="new-password">
                            <div class="profile-strength-meter" id="pwd-strength-meter">
                                <div class="profile-strength-bar" data-bar="1"></div>
                                <div class="profile-strength-bar" data-bar="2"></div>
                                <div class="profile-strength-bar" data-bar="3"></div>
                                <div class="profile-strength-bar" data-bar="4"></div>
                            </div>
                            <div class="profile-strength-label" id="pwd-strength-label"></div>
                        </div>
                        <div class="profile-form-group">
                            <label>${t('profileConfirmPassword')}</label>
                            <input type="password" class="profile-input" id="profile-confirm-pwd" placeholder="••••••••" autocomplete="new-password">
                        </div>
                        <button type="submit" class="profile-btn-primary" id="profile-update-pwd-btn" disabled>
                            ${ICONS.shield} ${t('profileUpdatePassword')}
                        </button>
                    </form>
                </div>
            </div>

            <!-- ═══ NOTIFICATIONS TAB ═══ -->
            <div class="profile-panel" data-profile-panel="notifications">
                <div class="profile-card">
                    <div class="profile-card-title">
                        ${ICONS.bell} ${t('profileNotifications')}
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">
                            ${t('profileNotifOverload')}
                            <small>${t('profileNotifOverloadDesc')}</small>
                        </div>
                        <label class="profile-toggle">
                            <input type="checkbox" data-notif="overload" ${notifPrefs.overload ? 'checked' : ''}>
                            <span class="profile-toggle-slider"></span>
                        </label>
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">
                            ${t('profileNotifDeadline')}
                            <small>${t('profileNotifDeadlineDesc')}</small>
                        </div>
                        <label class="profile-toggle">
                            <input type="checkbox" data-notif="deadline" ${notifPrefs.deadline ? 'checked' : ''}>
                            <span class="profile-toggle-slider"></span>
                        </label>
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">
                            ${t('profileNotifSchedule')}
                            <small>${t('profileNotifScheduleDesc')}</small>
                        </div>
                        <label class="profile-toggle">
                            <input type="checkbox" data-notif="schedule" ${notifPrefs.schedule ? 'checked' : ''}>
                            <span class="profile-toggle-slider"></span>
                        </label>
                    </div>
                    <div class="profile-info-row">
                        <div class="profile-info-label">
                            ${t('profileNotifCollaboration')}
                            <small>${t('profileNotifCollaborationDesc')}</small>
                        </div>
                        <label class="profile-toggle">
                            <input type="checkbox" data-notif="collaboration" ${notifPrefs.collaboration ? 'checked' : ''}>
                            <span class="profile-toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    // ── Tab Switching ──
    overlay.querySelectorAll('.profile-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
            overlay.querySelectorAll('.profile-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.dataset.profileTab;
            overlay.querySelector(`[data-profile-panel="${tabId}"]`).classList.add('active');

            // Update header title
            const titles = {
                general: t('profileGeneral'),
                preferences: t('profilePreferences'),
                security: t('profileSecurity'),
                notifications: t('profileNotifications'),
            };
            overlay.querySelector('.profile-content-header h2').textContent = titles[tabId] || t('profileTitle');
        });
    });

    // ── Close ──
    const closeProfile = () => overlay.remove();

    overlay.querySelector('#profile-close').addEventListener('click', closeProfile);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeProfile();
    });
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape' && document.querySelector('.profile-overlay')) {
            closeProfile();
            document.removeEventListener('keydown', escHandler);
        }
    });

    // ── Sign Out ──
    overlay.querySelector('#profile-signout').addEventListener('click', async () => {
        await supabase.auth.signOut();
    });

    // ── Language Selector ──
    overlay.querySelector('#profile-lang').addEventListener('change', (e) => {
        store.setLanguage(e.target.value);
        // Also update the header lang dropdown to keep in sync
        const headerLang = document.getElementById('lang-toggle');
        if (headerLang) headerLang.value = e.target.value;
        showProfileToast(t('profileSaved'));
        // Re-open profile to reflect new language
        closeProfile();
        setTimeout(() => openProfilePanel(), 150);
    });

    // ── Default View ──
    overlay.querySelector('#profile-default-view').addEventListener('change', (e) => {
        localStorage.setItem('profile_default_view', e.target.value);
        showProfileToast(t('profileSaved'));
    });

    // ── Password Strength Meter ──
    const newPwdInput = overlay.querySelector('#profile-new-pwd');
    const confirmPwdInput = overlay.querySelector('#profile-confirm-pwd');
    const updatePwdBtn = overlay.querySelector('#profile-update-pwd-btn');

    function refreshStrengthMeter() {
        const pwd = newPwdInput.value;
        const strength = getPasswordStrength(pwd);
        const bars = overlay.querySelectorAll('.profile-strength-bar');
        const label = overlay.querySelector('#pwd-strength-label');

        bars.forEach((bar, i) => {
            bar.className = 'profile-strength-bar';
            if (i < strength.level) {
                bar.classList.add('active', strength.label);
            }
        });

        if (pwd) {
            label.textContent = t(strength.key);
            label.className = `profile-strength-label ${strength.label}`;
        } else {
            label.textContent = '';
            label.className = 'profile-strength-label';
        }

        // Enable button only if both fields are filled and match and >= 8 chars
        updatePwdBtn.disabled = !(pwd.length >= 8 && confirmPwdInput.value && pwd === confirmPwdInput.value);
    }

    newPwdInput.addEventListener('input', refreshStrengthMeter);
    confirmPwdInput.addEventListener('input', refreshStrengthMeter);

    // ── Password Update ──
    overlay.querySelector('#profile-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPwd = newPwdInput.value;
        const confirmPwd = confirmPwdInput.value;

        if (newPwd.length < 8) {
            showProfileToast(t('profilePasswordTooShort'), 'error');
            return;
        }
        if (newPwd !== confirmPwd) {
            showProfileToast(t('profilePasswordMismatch'), 'error');
            return;
        }

        updatePwdBtn.disabled = true;
        updatePwdBtn.textContent = '...';

        const { error } = await supabase.auth.updateUser({ password: newPwd });

        if (error) {
            showProfileToast(error.message, 'error');
        } else {
            showProfileToast(t('profilePasswordUpdated'));
            newPwdInput.value = '';
            confirmPwdInput.value = '';
            refreshStrengthMeter();
        }

        updatePwdBtn.innerHTML = `${ICONS.shield} ${t('profileUpdatePassword')}`;
        updatePwdBtn.disabled = true;
    });

    // ── Notification Toggles ──
    overlay.querySelectorAll('[data-notif]').forEach(input => {
        input.addEventListener('change', () => {
            const prefs = loadNotifPrefs();
            prefs[input.dataset.notif] = input.checked;
            saveNotifPrefs(prefs);
            showProfileToast(t('profileSaved'));
        });
    });
}

// ── Private: toast inside profile context ──
function showProfileToast(msg, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    if (type === 'error') {
        toast.style.background = 'rgba(248, 113, 113, 0.15)';
        toast.style.borderColor = 'rgba(248, 113, 113, 0.3)';
        toast.style.color = '#ff7b72';
    }
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Public: get initials for the header avatar ──
export function getUserInitials(email) {
    return getInitials(email);
}
