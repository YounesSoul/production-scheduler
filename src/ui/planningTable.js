/* ═══════════════════════════════════════════════════
   PLANNING TABLE UI
   ═══════════════════════════════════════════════════ */

import store from '../data/store.js';

function statusBadge(status) {
    const cls = status === 'On Time' ? 'badge-success'
        : status === 'Risk' ? 'badge-warning'
            : 'badge-danger';
    const key = 'status' + status.replace(' ', '');
    return `<span class="badge ${cls}">${store.t(key)}</span>`;
}

export function renderScheduleTable() {
    const tbody = document.getElementById('schedule-tbody');
    const empty = document.getElementById('schedule-empty');
    const info = document.getElementById('schedule-info');
    const schedule = store.schedule;
    const orders = store.orders;

    if (schedule.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        info.textContent = '';
        return;
    }

    empty.style.display = 'none';

    const onTime = schedule.filter(s => s.status === 'On Time').length;
    const risk = schedule.filter(s => s.status === 'Risk').length;
    const late = schedule.filter(s => s.status === 'Late').length;
    const scheduledWord = store.language === 'fr' ? 'planifiées' : 'scheduled';
    info.textContent = `${schedule.length} ${scheduledWord} · ${onTime} ${store.t('ordersOnTime')} · ${risk} ${store.t('atRiskShort')} · ${late} ${store.t('lateShort')}`;

    tbody.innerHTML = schedule.map(s => {
        const order = orders.find(o => o.id === s.orderId) || {};
        const splitBadge = s.splitGroup ? ' <span class="badge badge-warning" style="font-size:0.6rem;">✂ SPLIT</span>' : '';
        return `
      <tr>
        <td><span class="badge badge-info">${s.chain}</span>${splitBadge}</td>
        <td><strong>${esc(s.orderId)}</strong></td>
        <td>${esc(order.client || '')}</td>
        <td>${esc(order.model || '')}</td>
        <td><span class="badge badge-info">${esc(s.pieceType || order.pieceType || 'Autre')}</span></td>
        <td>${(order.quantity || 0).toLocaleString()}</td>
        <td>${s.startDate}</td>
        <td>${s.endDate}</td>
        <td>${s.duration} ${store.t('days')}</td>
        <td>${statusBadge(s.status)}</td>
      </tr>
    `;
    }).join('');
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}
