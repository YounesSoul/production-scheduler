/* ═══════════════════════════════════════════════════
   ORDERS TABLE UI
   ═══════════════════════════════════════════════════ */

import store from '../data/store.js';
import { detectPieceType } from '../scheduler/engine.js';
import { openNotesModal } from './notesModal.js';

const CHAIN_OPTIONS = ['', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CH8'];

const PRIORITY_CYCLE = ['normal', 'high', 'urgent'];

function priorityBadge(p, idx) {
  const cls = p === 'urgent' ? 'badge-danger' : p === 'high' ? 'badge-warning' : 'badge-priority-normal';
  return `<span class="badge ${cls} btn-priority" data-idx="${idx}" title="Change priority">${store.t(p === 'urgent' ? 'priorityUrgent' : p === 'high' ? 'priorityHigh' : 'priorityNormal')}</span>`;
}

export function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  const empty = document.getElementById('orders-empty');
  const orders = store.orders;

  if (orders.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = orders.map((o, i) => `
    <tr>
      <td><strong>${esc(o.id)}</strong></td>
      <td>${esc(o.client)}</td>
      <td>${esc(o.model)}</td>
      <td><span class="badge badge-info">${esc(o.pieceType || detectPieceType(o.model))}</span></td>
      <td>${(o.quantity || 0).toLocaleString()}</td>
      <td>${o.arrivalDate || '—'}</td>
      <td>${o.deliveryDate || '—'}</td>
      <td>${o.duration}</td>
      <td>${priorityBadge(o.priority, i)}</td>
      <td>${o.lockedChain ? `<span class="badge badge-info">${o.lockedChain}</span>` : '—'}</td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" data-idx="${i}" title="${store.t('edit')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-notes" data-idx="${i}" title="Notes & Attachments">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>${_hasNotes(o.id) ? '<span class="notes-indicator"></span>' : ''}
          </button>
          <button class="btn-del" data-idx="${i}" title="${store.t('delete')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Attach handlers
  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.idx)));
  });
  tbody.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const order = store.orders[idx];
      if (!order) return;
      const modal = document.getElementById('delete-modal');
      document.getElementById('delete-modal-msg').textContent =
        `${store.t('confirmDeleteText')} ("${order.id}" - ${order.model})`;
      modal.classList.remove('hidden');
      // Wire up confirm/cancel
      const confirmBtn = document.getElementById('delete-confirm');
      const cancelBtn = document.getElementById('delete-cancel');
      const closeBtn = document.getElementById('delete-modal-close');
      const close = () => modal.classList.add('hidden');
      const doDelete = () => { close(); store.deleteOrder(idx); };
      confirmBtn.onclick = doDelete;
      cancelBtn.onclick = close;
      closeBtn.onclick = close;
    });
  });

  // Clickable priority badges
  tbody.querySelectorAll('.btn-priority').forEach(badge => {
    badge.addEventListener('click', () => {
      const idx = parseInt(badge.dataset.idx);
      const order = store.orders[idx];
      if (!order) return;
      const current = order.priority || 'normal';
      const nextIdx = (PRIORITY_CYCLE.indexOf(current) + 1) % PRIORITY_CYCLE.length;
      order.priority = PRIORITY_CYCLE[nextIdx];
      store.save();
      store.notify();
    });
  });
  // Wire up Notes buttons
  tbody.querySelectorAll('.btn-notes').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const order = store.orders[idx];
      if (!order) return;
      openNotesModal(order.id, `${order.id} — ${order.model}`);
    });
  });
}

function openEditModal(index) {
  const order = store.orders[index];
  if (!order) return;

  document.getElementById('modal-title').textContent = store.t('editOrderTitle');
  document.getElementById('form-edit-index').value = index;
  document.getElementById('form-id').value = order.id;
  document.getElementById('form-client').value = order.client;
  document.getElementById('form-model').value = order.model;
  document.getElementById('form-quantity').value = order.quantity;
  document.getElementById('form-arrival').value = order.arrivalDate;
  document.getElementById('form-delivery').value = order.deliveryDate;
  document.getElementById('form-duration').value = order.duration;
  document.getElementById('form-priority').value = order.priority || 'normal';
  document.getElementById('form-lock').value = order.lockedChain || '';

  document.getElementById('order-modal').classList.remove('hidden');
}

function _hasNotes(orderId) {
  const note = store.getOrderNote(orderId);
  return note.text.trim().length > 0 || note.attachments.length > 0;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
