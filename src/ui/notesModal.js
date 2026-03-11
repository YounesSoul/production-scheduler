/* ═══════════════════════════════════════════════════
   ORDER NOTES & ATTACHMENTS MODAL
   ═══════════════════════════════════════════════════ */

import store from '../data/store.js';

let currentOrderId = null;
let modalEl = null;
let textareaEl = null;
let galleryEl = null;
let autosaveTimer = null;

export function openNotesModal(orderId, orderLabel) {
    currentOrderId = orderId;

    // Create modal if not already in DOM
    if (!document.getElementById('notes-modal')) {
        _buildModal();
    }

    modalEl = document.getElementById('notes-modal');

    // Set title
    modalEl.querySelector('.notes-modal-title').textContent = `📝 Notes — ${orderLabel}`;

    // Load saved data
    const saved = store.getOrderNote(orderId);
    textareaEl = modalEl.querySelector('#notes-textarea');
    galleryEl = modalEl.querySelector('#notes-gallery');

    textareaEl.value = saved.text || '';
    _renderGallery(saved.attachments || []);

    modalEl.classList.remove('hidden');
    textareaEl.focus();
}

function _buildModal() {
    const modal = document.createElement('div');
    modal.id = 'notes-modal';
    modal.className = 'notes-modal-overlay hidden';
    modal.innerHTML = `
    <div class="notes-modal-panel">
      <div class="notes-modal-header">
        <span class="notes-modal-title"></span>
        <button class="notes-modal-close btn-icon">✕</button>
      </div>

      <div class="notes-modal-body">
        <!-- Text notes -->
        <label class="notes-label">💬 Notes</label>
        <textarea id="notes-textarea" class="notes-textarea" placeholder="Write your notes here — auto-saved as you type…" rows="6"></textarea>

        <!-- Attachments -->
        <label class="notes-label" style="margin-top:16px">📎 Attachments</label>
        <div class="notes-dropzone" id="notes-dropzone">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p>Drag & drop files here, or <label class="notes-browse-label" for="notes-file-input">browse</label></p>
          <input type="file" id="notes-file-input" class="notes-file-input" multiple accept="image/*,.pdf,.doc,.docx,.xlsx,.csv"/>
        </div>
        <div class="notes-gallery" id="notes-gallery"></div>
      </div>
    </div>`;

    document.body.appendChild(modal);

    // Close handlers
    modal.querySelector('.notes-modal-close').addEventListener('click', _closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) _closeModal(); });

    // Autosave textarea
    const textarea = modal.querySelector('#notes-textarea');
    textarea.addEventListener('input', () => {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
            store.setOrderNoteText(currentOrderId, textarea.value);
        }, 600);
    });

    // File input change
    modal.querySelector('#notes-file-input').addEventListener('change', e => {
        _handleFiles(Array.from(e.target.files));
        e.target.value = '';
    });

    // Drag & drop
    const dropzone = modal.querySelector('#notes-dropzone');
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        _handleFiles(Array.from(e.dataTransfer.files));
    });
}

function _handleFiles(files) {
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
            const attachment = {
                name: file.name,
                type: file.type,
                size: file.size,
                dataUrl: e.target.result,
            };
            store.addOrderAttachment(currentOrderId, attachment);
            const saved = store.getOrderNote(currentOrderId);
            _renderGallery(saved.attachments || []);
        };
        reader.readAsDataURL(file);
    });
}

function _renderGallery(attachments) {
    if (!galleryEl) return;
    if (attachments.length === 0) {
        galleryEl.innerHTML = '<p class="notes-gallery-empty">No attachments yet.</p>';
        return;
    }
    galleryEl.innerHTML = attachments.map((att, idx) => {
        const isImage = att.type && att.type.startsWith('image/');
        const thumb = isImage
            ? `<img src="${att.dataUrl}" alt="${att.name}" class="notes-thumb-img"/>`
            : `<div class="notes-thumb-file">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>${att.name.slice(0, 14)}${att.name.length > 14 ? '…' : ''}</span>
               </div>`;
        return `
        <div class="notes-thumb" data-idx="${idx}">
          ${thumb}
          <div class="notes-thumb-actions">
            <a href="${att.dataUrl}" download="${att.name}" class="notes-thumb-btn" title="Download">⬇</a>
            <button class="notes-thumb-del" data-idx="${idx}" title="Delete">✕</button>
          </div>
        </div>`;
    }).join('');

    // Delete buttons
    galleryEl.querySelectorAll('.notes-thumb-del').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            store.removeOrderAttachment(currentOrderId, idx);
            const saved = store.getOrderNote(currentOrderId);
            _renderGallery(saved.attachments || []);
        });
    });
}

function _closeModal() {
    // Flush any pending autosave immediately
    if (currentOrderId && textareaEl) {
        store.setOrderNoteText(currentOrderId, textareaEl.value);
    }
    modalEl?.classList.add('hidden');
    currentOrderId = null;
}
