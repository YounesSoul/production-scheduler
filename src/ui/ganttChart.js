/* ═══════════════════════════════════════════════════
   GANTT CHART — Interactive calendar visualization
   with drag & drop + chain splitting support
   ═══════════════════════════════════════════════════ */

import store from '../data/store.js';
import { CHAIN_NAMES, getEligibleChains, detectPieceType } from '../scheduler/engine.js';
import html2canvas from 'html2canvas';

// Model → Color mapping (consistent palette)
const MODEL_COLORS = [
    '#6c5ce7', '#0abde3', '#00d68f', '#f0a500', '#ff6b6b',
    '#fd79a8', '#a29bfe', '#55efc4', '#ffeaa7', '#fab1a0',
    '#74b9ff', '#e17055', '#00cec9', '#fdcb6e', '#b2bec3',
];

let modelColorMap = {};
let cellWidth = 36;
let tooltip = null;
let activeContextMenu = null;

function getModelColor(model) {
    if (!modelColorMap[model]) {
        const idx = Object.keys(modelColorMap).length % MODEL_COLORS.length;
        modelColorMap[model] = MODEL_COLORS[idx];
    }
    return modelColorMap[model];
}

function toDate(str) {
    return new Date(str + 'T00:00:00');
}

function fmtShort(d) {
    return `${d.getDate()}/${d.getMonth() + 1}`;
}

function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diffDays(a, b) {
    return Math.round((b - a) / 86400000);
}

function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function addWorkingDays(date, n) {
    const d = new Date(date);
    let remaining = n;
    while (remaining > 0) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0) remaining--;
    }
    return d;
}

function dayClass(d) {
    if (d.getDay() === 0) return ' sunday';
    if (d.getDay() === 6) return ' saturday';
    return '';
}

// ── Toast helper
function showToast(msg, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Overlap checker: would placing an order at [startDate, endDate] on chain collide?
//    excludeIds: order IDs to ignore (the two being swapped)
function checkOverlap(chain, startDate, endDate, ...excludeIds) {
    const newStart = toDate(startDate);
    const newEnd = toDate(endDate);

    return store.schedule.some(s => {
        if (s.chain !== chain) return false;
        if (excludeIds.includes(s.orderId)) return false;

        const existStart = toDate(s.startDate);
        const existEnd = toDate(s.endDate);

        // Overlap: newStart < existEnd AND newEnd > existStart
        return newStart < existEnd && newEnd > existStart;
    });
}

// ═══════════════════════════════════════════════════
// CONTEXT MENU
// ═══════════════════════════════════════════════════

function closeContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
}

function showContextMenu(e, bar) {
    if (store.currentRole !== 'admin' && store.currentRole !== 'planner') return;

    e.preventDefault();
    closeContextMenu();
    hideTooltip();

    const orderId = bar.dataset.orderId;
    const schedEntry = store.schedule.find(s => s.orderId === orderId);
    if (!schedEntry) return;

    const menu = document.createElement('div');
    menu.className = 'gantt-context-menu';

    const isSplit = !!schedEntry.splitGroup;

    if (isSplit) {
        // Unsplit option
        const unsplitItem = document.createElement('div');
        unsplitItem.className = 'ctx-menu-item';
        unsplitItem.innerHTML = `<span class="ctx-icon">⊕</span> Unsplit chain`;
        unsplitItem.addEventListener('click', () => {
            store.unsplitChain(orderId);
            showToast(`✓ Chain unsplit — ${orderId} restored to full capacity`);
            closeContextMenu();
        });
        menu.appendChild(unsplitItem);
    }

    if (schedEntry.parallelGroup) {
        // Unparallelize option
        const unparallelItem = document.createElement('div');
        unparallelItem.className = 'ctx-menu-item';
        unparallelItem.innerHTML = `<span class="ctx-icon">🔀</span> Unparallelize (Merge back into 1 chain)`;
        unparallelItem.addEventListener('click', () => {
            const success = store.unparallelizeOrder(orderId);
            if (success) {
                showToast(`✓ Parallelization removed — order restored to single chain`);
            } else {
                showToast(`⚠ Could not unparallelize`, 'error');
            }
            closeContextMenu();
        });
        menu.appendChild(unparallelItem);
    }

    if (!isSplit && !schedEntry.parallelGroup) {
        // Parallelize option (if not already chopped in half)
        if (!schedEntry.parallelGroup && schedEntry.duration > 1) {
            const parallelItem = document.createElement('div');
            parallelItem.className = 'ctx-menu-item';
            parallelItem.innerHTML = `<span class="ctx-icon">➗</span> Parallelize (Divide into 2 chains)`;
            parallelItem.addEventListener('click', () => {
                const success = store.parallelizeOrder(orderId);
                if (success) {
                    showToast(`✓ Order divided! Half moved to another chain.`);
                } else {
                    showToast(`⚠ Could not divide order`, 'error');
                }
                closeContextMenu();
                // Rerender to show the new split block
                import('./ganttChart.js').then(m => m.renderGanttChart());
            });
            menu.appendChild(parallelItem);

            const sepTop = document.createElement('div');
            sepTop.className = 'ctx-menu-sep';
            menu.appendChild(sepTop);
        }

        // Split with… submenu
        // Find eligible orders: same chain, not already split
        const sameChainOrders = store.schedule.filter(s =>
            s.chain === schedEntry.chain &&
            s.orderId !== orderId &&
            !s.splitGroup
        );

        if (sameChainOrders.length > 0) {
            const header = document.createElement('div');
            header.className = 'ctx-menu-header';
            header.textContent = 'Split chain with…';
            menu.appendChild(header);

            sameChainOrders.forEach(s => {
                const order = store.orders.find(o => o.id === s.orderId) || {};
                const item = document.createElement('div');
                item.className = 'ctx-menu-item';
                item.innerHTML = `<span class="ctx-icon">✂</span> ${order.model || s.orderId} <span class="ctx-qty">(${(order.quantity || 0).toLocaleString()} pcs)</span>`;
                item.addEventListener('click', () => {
                    store.splitChain(orderId, s.orderId);
                    showToast(`✓ Chain split — ${orderId} & ${s.orderId} running in parallel`);
                    closeContextMenu();
                });
                menu.appendChild(item);
            });
        }

        // Also offer to pull in unscheduled or orders from other chains
        const otherOrders = store.schedule.filter(s =>
            s.chain !== schedEntry.chain &&
            !s.splitGroup
        );

        if (otherOrders.length > 0) {
            const sep = document.createElement('div');
            sep.className = 'ctx-menu-sep';
            menu.appendChild(sep);

            const header2 = document.createElement('div');
            header2.className = 'ctx-menu-header';
            header2.textContent = 'Move here & split with…';
            menu.appendChild(header2);

            // Show first 8 eligible orders from other chains
            const eligible = otherOrders.filter(s => {
                const order = store.orders.find(o => o.id === s.orderId);
                if (!order) return true;
                const chains = getEligibleChains(order);
                const targetIdx = CHAIN_NAMES.indexOf(schedEntry.chain);
                return chains.includes(targetIdx);
            }).slice(0, 8);

            eligible.forEach(s => {
                const order = store.orders.find(o => o.id === s.orderId) || {};
                const item = document.createElement('div');
                item.className = 'ctx-menu-item';
                item.innerHTML = `<span class="ctx-icon">↗</span> ${order.model || s.orderId} <span class="ctx-sub">(from ${s.chain})</span> <span class="ctx-qty">(${(order.quantity || 0).toLocaleString()})</span>`;
                item.addEventListener('click', () => {
                    // Move s to same chain first, then split
                    s.chain = schedEntry.chain;
                    store.splitChain(orderId, s.orderId);
                    showToast(`✓ ${s.orderId} moved to ${schedEntry.chain} & split with ${orderId}`);
                    closeContextMenu();
                });
                menu.appendChild(item);
            });
        }

        // If menu is empty (no candidates)
        if (menu.children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ctx-menu-empty';
            empty.textContent = 'No eligible orders to split with';
            menu.appendChild(empty);
        }
    }

    // ── Swap with… section (always shown)
    const allOtherOrders = store.schedule.filter(s =>
        s.orderId !== orderId && !s.splitGroup
    );

    if (allOtherOrders.length > 0 && !isSplit) {
        const sep = document.createElement('div');
        sep.className = 'ctx-menu-sep';
        menu.appendChild(sep);

        const swapHeader = document.createElement('div');
        swapHeader.className = 'ctx-menu-header';
        swapHeader.textContent = 'Swap with…';
        menu.appendChild(swapHeader);

        // Show orders grouped: same chain first, then others (max 10)
        const sameChainSwap = allOtherOrders.filter(s => s.chain === schedEntry.chain);
        const otherChainSwap = allOtherOrders.filter(s => s.chain !== schedEntry.chain);
        const swapCandidates = [...sameChainSwap, ...otherChainSwap].slice(0, 10);

        swapCandidates.forEach(s => {
            const order = store.orders.find(o => o.id === s.orderId) || {};
            const currentOrder = store.orders.find(o => o.id === orderId) || {};

            // Check both directions are valid
            const targetChainIdx = CHAIN_NAMES.indexOf(s.chain);
            const sourceChainIdx = CHAIN_NAMES.indexOf(schedEntry.chain);

            const currentEligible = getEligibleChains(currentOrder);
            const targetEligible = getEligibleChains(order);

            const canSwap = currentEligible.includes(targetChainIdx) && targetEligible.includes(sourceChainIdx);

            const item = document.createElement('div');

            // Check overlap in both directions
            const wouldOverlapA = checkOverlap(s.chain, s.startDate, s.endDate, orderId, s.orderId);
            const wouldOverlapB = checkOverlap(schedEntry.chain, schedEntry.startDate, schedEntry.endDate, s.orderId, orderId);

            const canSwapFinal = canSwap && !wouldOverlapA && !wouldOverlapB;
            if (!canSwapFinal) return; // Hide unavailable options entirely

            item.className = 'ctx-menu-item';

            const chainLabel = s.chain !== schedEntry.chain ? `<span class="ctx-sub">(${s.chain})</span>` : '';
            item.innerHTML = `<span class="ctx-icon">⇄</span> ${order.model || s.orderId} ${chainLabel} <span class="ctx-qty">(${(order.quantity || 0).toLocaleString()})</span>`;

            if (canSwapFinal) {
                item.addEventListener('click', () => {
                    // Swap chain, startDate, endDate, duration
                    const tempChain = schedEntry.chain;
                    const tempStart = schedEntry.startDate;
                    const tempEnd = schedEntry.endDate;
                    const tempDur = schedEntry.duration;

                    schedEntry.chain = s.chain;
                    schedEntry.startDate = s.startDate;
                    schedEntry.endDate = s.endDate;
                    schedEntry.duration = s.duration;

                    s.chain = tempChain;
                    s.startDate = tempStart;
                    s.endDate = tempEnd;
                    s.duration = tempDur;

                    // Recalculate statuses
                    [schedEntry, s].forEach(entry => {
                        const o = store.orders.find(x => x.id === entry.orderId);
                        if (o && o.deliveryDate) {
                            const end = toDate(entry.endDate);
                            const del = toDate(o.deliveryDate);
                            if (end > del) entry.status = 'Late';
                            else if (diffDays(end, del) <= 1) entry.status = 'Risk';
                            else entry.status = 'On Time';
                        }
                    });

                    store.save();
                    store.notify();
                    showToast(`✓ Swapped ${orderId} ⇄ ${s.orderId}`);
                    closeContextMenu();
                });
            } else {
                item.title = !canSwap ? 'Chain constraints prevent this swap' : 'Swap would cause overlapping orders';
            }

            menu.appendChild(item);
        });
    }

    // Position menu at mouse
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    document.body.appendChild(menu);
    activeContextMenu = menu;

    // Adjust if off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (e.clientX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (e.clientY - rect.height) + 'px';
    }

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu, { once: true });
    }, 10);
}

// ═══════════════════════════════════════════════════
// DRAG & DROP SYSTEM
// ═══════════════════════════════════════════════════

function initDrag(bar, e) {
    if (store.currentRole !== 'admin' && store.currentRole !== 'planner') return;

    e.preventDefault();
    hideTooltip();

    const container = document.getElementById('gantt-container');
    const wrapper = container.querySelector('.gantt-wrapper');
    const rows = wrapper.querySelectorAll('.gantt-row');

    const orderId = bar.dataset.orderId;
    const schedEntry = store.schedule.find(s => s.orderId === orderId);
    if (!schedEntry) return;

    const rowCells = bar.closest('.gantt-row-cells');
    const barRect = bar.getBoundingClientRect();

    const currentChainIdx = CHAIN_NAMES.indexOf(schedEntry.chain);

    const ghost = bar.cloneNode(true);
    ghost.classList.add('gantt-bar-ghost');
    wrapper.appendChild(ghost);

    bar.classList.add('dragging-source');

    const wrapperRect = wrapper.getBoundingClientRect();
    const initX = barRect.left - wrapperRect.left;
    const initY = barRect.top - wrapperRect.top;
    const mouseStartX = e.clientX;
    const mouseStartY = e.clientY;

    ghost.style.position = 'absolute';
    ghost.style.left = initX + 'px';
    ghost.style.top = initY + 'px';
    ghost.style.width = barRect.width + 'px';
    ghost.style.height = barRect.height + 'px';
    ghost.style.zIndex = '100';
    ghost.style.opacity = '0.85';
    ghost.style.pointerEvents = 'none';
    ghost.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
    ghost.style.cursor = 'grabbing';

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    let highlightedRow = null;

    function onMouseMove(ev) {
        const dx = ev.clientX - mouseStartX;
        const dy = ev.clientY - mouseStartY;

        ghost.style.left = (initX + dx) + 'px';
        ghost.style.top = (initY + dy) + 'px';

        let hoveredRow = null;
        rows.forEach(row => {
            const rect = row.getBoundingClientRect();
            if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
                hoveredRow = row;
            }
            row.classList.remove('drop-target');
        });
        if (hoveredRow && hoveredRow !== highlightedRow) {
            hoveredRow.classList.add('drop-target');
            highlightedRow = hoveredRow;
        }
    }

    function onMouseUp(ev) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        ghost.remove();
        bar.classList.remove('dragging-source');
        rows.forEach(row => row.classList.remove('drop-target'));

        const dx = ev.clientX - mouseStartX;
        const dy = ev.clientY - mouseStartY;

        let newChainIdx = currentChainIdx;
        rows.forEach((row, idx) => {
            const rect = row.getBoundingClientRect();
            if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
                newChainIdx = idx;
            }
        });

        const dayOffset = Math.round(dx / cellWidth);
        if (dayOffset === 0 && newChainIdx === currentChainIdx) return;

        const oldStart = toDate(schedEntry.startDate);
        let newStart = addDays(oldStart, dayOffset);
        if (newStart.getDay() === 0) newStart = addDays(newStart, 1);

        const newChain = CHAIN_NAMES[newChainIdx];

        const order = store.orders.find(o => o.id === orderId);
        if (order) {
            const eligible = getEligibleChains(order);
            if (!eligible.includes(newChainIdx)) {
                const chainList = eligible.map(i => CHAIN_NAMES[i]).join(', ');
                showToast(`⚠ ${order.client || ''} ${order.pieceType || detectPieceType(order.model) || ''} → only allowed on ${chainList}`, 'error');
                renderGanttChart();
                return;
            }
        }

        const duration = schedEntry.duration || diffDays(toDate(schedEntry.startDate), toDate(schedEntry.endDate));
        const newEnd = addWorkingDays(newStart, duration);

        // Check for overlaps on the target chain
        if (checkOverlap(newChain, fmtDate(newStart), fmtDate(newEnd), orderId)) {
            // ── Try to SWAP with the overlapped bar instead of blocking
            const overlapped = store.schedule.filter(s => {
                if (s.chain !== newChain) return false;
                if (s.orderId === orderId) return false;
                const eStart = toDate(s.startDate);
                const eEnd = toDate(s.endDate);
                return toDate(fmtDate(newStart)) < eEnd && toDate(fmtDate(newEnd)) > eStart;
            });

            // Only swap if exactly one bar is overlapped
            if (overlapped.length === 1) {
                const target = overlapped[0];
                const targetOrder = store.orders.find(o => o.id === target.orderId);

                // Check chain constraints both ways
                const draggedOrder = store.orders.find(o => o.id === orderId);
                const sourceChainIdx = CHAIN_NAMES.indexOf(schedEntry.chain);
                const targetChainIdx = CHAIN_NAMES.indexOf(target.chain);

                const draggedEligible = draggedOrder ? getEligibleChains(draggedOrder) : Array.from({ length: 8 }, (_, i) => i);
                const targetEligible = targetOrder ? getEligibleChains(targetOrder) : Array.from({ length: 8 }, (_, i) => i);

                const canSwapChains = draggedEligible.includes(targetChainIdx) && targetEligible.includes(sourceChainIdx);

                if (!canSwapChains) {
                    showToast(`⚠ Can't swap — chain constraints prevent it`, 'error');
                    renderGanttChart();
                    return;
                }

                // Check for overlaps with OTHER bars after swap
                const wouldOverlapA = checkOverlap(target.chain, target.startDate, target.endDate, orderId, target.orderId);
                const wouldOverlapB = checkOverlap(schedEntry.chain, schedEntry.startDate, schedEntry.endDate, target.orderId, orderId);

                if (wouldOverlapA || wouldOverlapB) {
                    showToast(`⚠ Can't swap — would overlap with other orders`, 'error');
                    renderGanttChart();
                    return;
                }

                // Perform the swap
                const tempChain = schedEntry.chain;
                const tempStart = schedEntry.startDate;
                const tempEnd = schedEntry.endDate;
                const tempDur = schedEntry.duration;

                schedEntry.chain = target.chain;
                schedEntry.startDate = target.startDate;
                schedEntry.endDate = target.endDate;
                schedEntry.duration = target.duration;

                target.chain = tempChain;
                target.startDate = tempStart;
                target.endDate = tempEnd;
                target.duration = tempDur;

                // Recalculate statuses for both
                [schedEntry, target].forEach(entry => {
                    const o = store.orders.find(x => x.id === entry.orderId);
                    if (o && o.deliveryDate) {
                        const end = toDate(entry.endDate);
                        const del = toDate(o.deliveryDate);
                        if (end > del) entry.status = 'Late';
                        else if (diffDays(end, del) <= 1) entry.status = 'Risk';
                        else entry.status = 'On Time';
                    }
                });

                store.save();
                store.notify();
                showToast(`✓ Swapped ${orderId} ⇄ ${target.orderId}`);
                return;
            }

            // Multiple overlaps or can't swap — block
            showToast(`⚠ Can't drop here — overlaps with another order on ${newChain}`, 'error');
            renderGanttChart();
            return;
        }

        const delivery = order ? toDate(order.deliveryDate) : null;
        let status = 'On Time';
        if (delivery && newEnd > delivery) status = 'Late';
        else if (delivery && diffDays(newEnd, delivery) <= 1) status = 'Risk';

        const schedIdx = store.schedule.findIndex(s => s.orderId === orderId);
        if (schedIdx >= 0) {
            store.schedule[schedIdx] = {
                ...store.schedule[schedIdx],
                chain: newChain,
                startDate: fmtDate(newStart),
                endDate: fmtDate(newEnd),
                status,
            };
            store.save();
            store.notify();

            const chainLabel = newChainIdx !== currentChainIdx ? ` → ${newChain}` : '';
            showToast(`✓ ${orderId} moved to ${fmtDate(newStart)}${chainLabel}`);
        }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

// ═══════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════

export function renderGanttChart() {
    const container = document.getElementById('gantt-container');
    const legend = document.getElementById('gantt-legend');
    const schedule = store.schedule;
    const orders = store.orders;

    if (!container || !legend) return;

    if (schedule.length === 0) {
        container.innerHTML = `<div id="gantt-empty" class="empty-state" style="display:flex;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/>
                <line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>
            </svg>
            <p>${store.t('noSchedule')}</p>
        </div>`;
        legend.innerHTML = '';
        return;
    }

    modelColorMap = {};
    orders.forEach(o => getModelColor(o.model));

    const allStarts = schedule.map(s => toDate(s.startDate));
    const allEnds = schedule.map(s => toDate(s.endDate));
    const minDate = addDays(new Date(Math.min(...allStarts)), -1);
    const maxDate = addDays(new Date(Math.max(...allEnds)), 2);
    const totalDays = diffDays(minDate, maxDate);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const labelWidth = 90;
    let html = `<div class="gantt-wrapper" style="--cell-width: ${cellWidth}px; width: ${labelWidth + totalDays * cellWidth}px;">`;

    // ── Month grouping header row
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    html += `<div class="gantt-month-header">`;
    html += `<div class="gantt-label-col"></div>`;
    html += `<div class="gantt-dates">`;
    let currentMonth = -1;
    let monthStartIdx = 0;
    const monthSpans = [];
    for (let d = 0; d < totalDays; d++) {
        const date = addDays(minDate, d);
        const m = date.getMonth();
        const y = date.getFullYear();
        const key = y * 12 + m;
        if (key !== currentMonth) {
            if (currentMonth !== -1) {
                monthSpans.push({ start: monthStartIdx, count: d - monthStartIdx, month: currentMonth });
            }
            currentMonth = key;
            monthStartIdx = d;
        }
    }
    monthSpans.push({ start: monthStartIdx, count: totalDays - monthStartIdx, month: currentMonth });
    monthSpans.forEach(span => {
        const m = span.month % 12;
        const y = Math.floor(span.month / 12);
        html += `<div class="gantt-month-cell" style="min-width: ${span.count * cellWidth}px; max-width: ${span.count * cellWidth}px;">${MONTH_NAMES[m]} ${y}</div>`;
    });
    html += `</div></div>`;

    // ── Day header
    html += `<div class="gantt-header">`;
    html += `<div class="gantt-label-col">CHAIN</div>`;
    html += `<div class="gantt-dates">`;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let d = 0; d < totalDays; d++) {
        const date = addDays(minDate, d);
        const cls = dayClass(date);
        const isToday = date.getTime() === today.getTime() ? ' today' : '';
        html += `<div class="gantt-date-cell${cls}${isToday}">
      <span class="day-name">${dayNames[date.getDay()]}</span>
      <span class="day-num">${fmtShort(date)}</span>
    </div>`;
    }
    html += `</div></div>`;

    // ── Chain rows
    CHAIN_NAMES.forEach(chain => {
        const chainSchedule = schedule.filter(s => s.chain === chain);

        html += `<div class="gantt-row" data-chain="${chain}">`;
        html += `<div class="gantt-row-label">${chain}</div>`;
        html += `<div class="gantt-row-cells">`;

        for (let d = 0; d < totalDays; d++) {
            const date = addDays(minDate, d);
            const cls = dayClass(date);
            html += `<div class="gantt-cell${cls}"></div>`;
        }

        // Bars — handle split positioning
        chainSchedule.forEach(s => {
            const order = orders.find(o => o.id === s.orderId) || {};
            const start = toDate(s.startDate);
            const end = toDate(s.endDate);
            const left = diffDays(minDate, start) * cellWidth;
            const width = diffDays(start, end) * cellWidth - 2;
            const color = getModelColor(order.model || 'Unknown');

            // Status dot class
            const statusCls = s.status === 'Late' ? 'late' : s.status === 'Risk' ? 'risk' : 'on-time';
            const statusDot = `<span class="bar-status-dot ${statusCls}"></span>`;
            const modelLabel = order.model || s.orderId;
            const label = width > 70 ? `${statusDot}${modelLabel}` : width > 40 ? `${statusDot}${s.orderId.slice(-4)}` : statusDot;

            // Split positioning
            const isSplit = !!s.splitGroup;
            let barHeight = 34;
            let barTop = 8;
            let splitClass = '';

            if (isSplit) {
                barHeight = 16;
                if (s.splitPosition === 'top') {
                    barTop = 2;
                    splitClass = ' split-top';
                } else {
                    barTop = 28;
                    splitClass = ' split-bottom';
                }
            }

            const splitIcon = isSplit ? '✂ ' : '';

            html += `<div class="gantt-bar${splitClass}" 
        style="left: ${left}px; width: ${Math.max(width, 22)}px; background: ${color}; height: ${barHeight}px; top: ${barTop}px;"
        data-order-id="${s.orderId}"
        data-model="${order.model || ''}"
        data-client="${order.client || ''}"
        data-start="${s.startDate}"
        data-end="${s.endDate}"
        data-status="${s.status}"
        data-chain="${s.chain}"
        data-qty="${order.quantity || 0}"
        data-split="${isSplit ? 'true' : 'false'}"
        draggable="false"
      >${splitIcon}${label}</div>`;
        });

        html += `</div></div>`;
    });

    // Today line
    const todayOffset = diffDays(minDate, today);
    if (todayOffset >= 0 && todayOffset < totalDays) {
        const todayLeft = labelWidth + todayOffset * cellWidth;
        html += `<div class="gantt-today-line" style="left: ${todayLeft}px;"></div>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    // Attach event handlers
    container.querySelectorAll('.gantt-bar').forEach(bar => {
        bar.addEventListener('mouseenter', (e) => showTooltip(e, bar));
        bar.addEventListener('mousemove', (e) => moveTooltip(e));
        bar.addEventListener('mouseleave', () => hideTooltip());

        // Right-click context menu
        bar.addEventListener('contextmenu', (e) => showContextMenu(e, bar));

        // Drag
        bar.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            initDrag(bar, e);
        });

        bar.style.cursor = 'grab';
    });

    // Legend
    legend.innerHTML = Object.entries(modelColorMap).map(([model, color]) =>
        `<div class="legend-item">
      <div class="legend-swatch" style="background: ${color};"></div>
      ${model}
    </div>`
    ).join('');
}

function showTooltip(e, bar) {
    if (document.body.style.cursor === 'grabbing') return;
    hideTooltip();
    tooltip = document.createElement('div');
    tooltip.className = 'gantt-tooltip';
    const isSplit = bar.dataset.split === 'true';
    const statusText = store.t('status' + (bar.dataset.status ? bar.dataset.status.replace(' ', '') : ''));
    const statusColor = bar.dataset.status === 'Late' ? '#f87171' : bar.dataset.status === 'Risk' ? '#fbbf24' : '#34d399';
    tooltip.innerHTML = `
    <strong>${bar.dataset.orderId} — ${bar.dataset.model}</strong>
    <div class="tooltip-row">
      <span class="tooltip-label">${store.t('client')}</span>
      <span class="tooltip-value">${bar.dataset.client}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">Chain</span>
      <span class="tooltip-value">${bar.dataset.chain}${isSplit ? ' <span style="color: var(--warning);">✂ SPLIT</span>' : ''}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">${store.t('schedule')}</span>
      <span class="tooltip-value">${bar.dataset.start} → ${bar.dataset.end}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">${store.t('quantity')}</span>
      <span class="tooltip-value">${parseInt(bar.dataset.qty).toLocaleString()} pcs</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">${store.t('status')}</span>
      <span class="tooltip-value" style="color: ${statusColor};">● ${statusText}</span>
    </div>
    <div style="margin-top: 6px; opacity: 0.5; font-size: 0.6rem; text-align: center;">Drag to move · Right-click for options</div>
  `;
    document.body.appendChild(tooltip);
    moveTooltip(e);
}

function moveTooltip(e) {
    if (!tooltip) return;
    tooltip.style.top = (e.clientY + 15) + 'px';
    tooltip.style.left = (e.clientX + 15) + 'px';
}

function hideTooltip() {
    if (tooltip) {
        tooltip.remove();
        tooltip = null;
    }
}

export function ganttZoomIn() {
    cellWidth = Math.min(cellWidth + 8, 80);
    renderGanttChart();
}

export function ganttZoomOut() {
    cellWidth = Math.max(cellWidth - 8, 16);
    renderGanttChart();
}

export function ganttScrollToToday() {
    const container = document.getElementById('gantt-container');
    const todayLine = container.querySelector('.gantt-today-line');
    if (todayLine) {
        const left = parseInt(todayLine.style.left) - container.clientWidth / 2;
        container.scrollTo({ left: Math.max(left, 0), behavior: 'smooth' });
    }
}

// ═══════════════════════════════════════════════════
// DOWNLOAD AS PNG
// ═══════════════════════════════════════════════════

export async function downloadGanttAsPng() {
    const container = document.getElementById('gantt-container');
    const btn = document.getElementById('btn-download-chart');
    if (!container) return;

    // Show loading state
    if (btn) btn.classList.add('downloading');

    try {
        // Save original styles
        const origOverflow = container.style.overflow;
        const origMaxH = container.style.maxHeight;
        const origW = container.style.width;
        const origH = container.style.height;

        // Get the wrapper (full chart width)
        const wrapper = container.querySelector('.gantt-wrapper');
        const fullWidth = wrapper ? wrapper.scrollWidth : container.scrollWidth;
        const fullHeight = wrapper ? wrapper.scrollHeight : container.scrollHeight;

        // Temporarily expand to show full chart
        container.style.overflow = 'visible';
        container.style.maxHeight = 'none';
        container.style.width = fullWidth + 'px';
        container.style.height = fullHeight + 'px';

        // Wait for repaint
        await new Promise(r => setTimeout(r, 100));

        const canvas = await html2canvas(container, {
            backgroundColor: '#060910',
            scale: 2,
            useCORS: true,
            logging: false,
            width: fullWidth,
            height: fullHeight,
            windowWidth: fullWidth,
            windowHeight: fullHeight,
        });

        // Restore original styles
        container.style.overflow = origOverflow;
        container.style.maxHeight = origMaxH;
        container.style.width = origW;
        container.style.height = origH;

        // Trigger download
        const link = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        link.download = `Gantt_Chart_${dateStr}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        showToast('✓ Gantt chart downloaded as PNG', 'info');
    } catch (err) {
        console.error('Download failed:', err);
        showToast('⚠ Failed to download chart', 'error');
    } finally {
        if (btn) btn.classList.remove('downloading');
    }
}
