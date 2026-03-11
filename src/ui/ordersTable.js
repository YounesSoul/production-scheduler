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
          <button class="btn-edit" data-idx="${i}">${store.t('edit')}</button>
          <button class="btn-notes" data-idx="${i}" title="Notes &amp; Attachments">
            📝${_hasNotes(o.id) ? '<span class="notes-indicator"></span>' : ''}
          </button>
          <button class="btn-del" data-idx="${i}">${store.t('delete')}</button>
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
