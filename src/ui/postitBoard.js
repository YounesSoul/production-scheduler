/* ═══════════════════════════════════════════════════
   MODEL POST-IT BOARD
   ═══════════════════════════════════════════════════ */

import store from '../data/store.js';

const POSTIT_COLORS = [
    { label: 'Yellow', value: '#fef08a' },
    { label: 'Mint', value: '#86efac' },
    { label: 'Sky', value: '#7dd3fc' },
    { label: 'Peach', value: '#fca5a5' },
    { label: 'Lavender', value: '#c4b5fd' },
];

let currentModel = null;

export function renderPostitBoard() {
    const container = document.getElementById('tab-notes');
    if (!container) return;

    // Gather unique models
    const models = [...new Set(store.orders.map(o => o.model).filter(Boolean))].sort();

    // Default to first model
    if (!currentModel && models.length > 0) currentModel = models[0];

    container.innerHTML = `
    <div class="postit-board-wrapper">
      <div class="postit-board-header">
        <div class="postit-model-selector-wrapper">
          <label class="postit-selector-label">🧵 Model</label>
          <select id="postit-model-select" class="postit-model-select">
            ${models.length === 0
            ? '<option value="">No models loaded yet</option>'
            : models.map(m => `<option value="${esc(m)}" ${m === currentModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>
        <button id="postit-add-btn" class="btn btn-accent postit-add-btn" ${models.length === 0 ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Note
        </button>
      </div>

      <div class="postit-grid" id="postit-grid">
        ${_renderNotes(currentModel)}
      </div>
    </div>`;

    // Model selector
    const select = container.querySelector('#postit-model-select');
    select?.addEventListener('change', () => {
        currentModel = select.value;
        container.querySelector('#postit-grid').innerHTML = _renderNotes(currentModel);
        _attachNoteHandlers(container, currentModel);
    });

    // Add note button 
    container.querySelector('#postit-add-btn')?.addEventListener('click', () => {
        if (!currentModel) return;
        store.addPostit(currentModel, POSTIT_COLORS[0].value);
        container.querySelector('#postit-grid').innerHTML = _renderNotes(currentModel);
        _attachNoteHandlers(container, currentModel);
        // Scroll to last note and focus
        const grid = container.querySelector('#postit-grid');
        const cards = grid.querySelectorAll('.postit-card');
        if (cards.length > 0) {
            const last = cards[cards.length - 1];
            last.scrollIntoView({ behavior: 'smooth', block: 'end' });
            last.querySelector('textarea')?.focus();
        }
    });

    _attachNoteHandlers(container, currentModel);
}

function _renderNotes(modelName) {
    if (!modelName) return `<div class="postit-empty"><span>📋</span><p>Import orders to start adding model notes.</p></div>`;

    const notes = store.getPostits(modelName);
    if (notes.length === 0) {
        return `<div class="postit-empty"><span>🗒️</span><p>No post-it notes for <strong>${esc(modelName)}</strong> yet.<br>Click <strong>Add Note</strong> to get started!</p></div>`;
    }

    return notes.map(note => {
        const colorDots = POSTIT_COLORS.map(c =>
            `<button class="postit-color-dot${c.value === note.color ? ' active' : ''}" 
                     data-color="${c.value}" 
                     style="background:${c.value}" 
                     title="${c.label}"></button>`
        ).join('');

        return `
        <div class="postit-card${note.pinned ? ' pinned' : ''}" 
             data-id="${note.id}"
             style="background: ${note.color}; --postit-color: ${note.color};">
          <div class="postit-card-topbar">
            <div class="postit-colors">${colorDots}</div>
            <div class="postit-card-actions">
              <button class="postit-pin-btn${note.pinned ? ' active' : ''}" data-id="${note.id}" title="${note.pinned ? 'Unpin' : 'Pin to top'}">
                📌
              </button>
              <button class="postit-del-btn" data-id="${note.id}" title="Delete note">✕</button>
            </div>
          </div>
          <textarea class="postit-textarea" data-id="${note.id}" placeholder="Write your note here…" spellcheck="true">${esc(note.text)}</textarea>
          ${note.pinned ? '<div class="postit-pinned-badge">📌 Pinned</div>' : ''}
        </div>`;
    }).join('');
}

function _attachNoteHandlers(container, modelName) {
    if (!modelName) return;

    // Text autosave
    container.querySelectorAll('.postit-textarea').forEach(ta => {
        let timer;
        ta.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                store.updatePostit(modelName, ta.dataset.id, { text: ta.value });
            }, 500);
        });
    });

    // Color pickers
    container.querySelectorAll('.postit-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const card = dot.closest('.postit-card');
            const id = card.dataset.id;
            const color = dot.dataset.color;
            store.updatePostit(modelName, id, { color });
            card.style.background = color;
            card.style.setProperty('--postit-color', color);
            card.querySelectorAll('.postit-color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
        });
    });

    // Pin buttons
    container.querySelectorAll('.postit-pin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const notes = store.modelPostits[modelName] || [];
            const note = notes.find(n => n.id === id);
            if (!note) return;
            store.updatePostit(modelName, id, { pinned: !note.pinned });
            container.querySelector('#postit-grid').innerHTML = _renderNotes(modelName);
            _attachNoteHandlers(container, modelName);
        });
    });

    // Delete buttons
    container.querySelectorAll('.postit-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            btn.closest('.postit-card').classList.add('postit-card-exit');
            setTimeout(() => {
                store.deletePostit(modelName, id);
                container.querySelector('#postit-grid').innerHTML = _renderNotes(modelName);
                _attachNoteHandlers(container, modelName);
            }, 280);
        });
    });
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}
