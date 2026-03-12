/* ═══════════════════════════════════════════════════
   SCHEDULING ENGINE
   Assigns orders to 9 production chains with
   capacity, brand, and piece-type constraints
   ═══════════════════════════════════════════════════ */

import store from '../data/store.js';

const NUM_CHAINS = 8;
const CHAIN_NAMES = Array.from({ length: NUM_CHAINS }, (_, i) => `CH${i + 1}`);

// Production capacity — now reads from store (default 630)
function getPiecesPerDay() { return store.piecesPerDay || 630; }
const PIECES_PER_HOUR = 70;

// ── Piece type detection from model name
const PIECE_TYPE_MAP = [
    { keywords: ['pant', 'trouser'], type: 'Pantalon' },
    { keywords: ['robe'], type: 'Robe' },
    { keywords: ['chemise'], type: 'Chemise' },
    { keywords: ['short'], type: 'Short' },
    { keywords: ['jupe'], type: 'Jupe' },
    { keywords: ['veste'], type: 'Veste' },
    { keywords: ['manteau'], type: 'Manteau' },
    { keywords: ['pull'], type: 'Pull' },
    { keywords: ['t-shirt', 'tshirt', 'tee'], type: 'T-Shirt' },
    { keywords: ['polo'], type: 'Polo' },
];

function detectPieceType(model) {
    if (!model) return 'Autre';
    const lower = model.toLowerCase().trim();
    // Check the first word primarily
    const firstWord = lower.split(/\s+/)[0];
    for (const entry of PIECE_TYPE_MAP) {
        for (const kw of entry.keywords) {
            if (firstWord.startsWith(kw)) return entry.type;
        }
    }
    // Also check full string as fallback
    for (const entry of PIECE_TYPE_MAP) {
        for (const kw of entry.keywords) {
            if (lower.includes(kw)) return entry.type;
        }
    }
    return 'Autre';
}

// ── Chain eligibility rules
// Brand constraints (checked against client name)
const BRAND_CHAIN_MAP = {
    'maxmara': [0, 1],       // CH1, CH2
    'max mara': [0, 1],
    'cehp': [0, 1],          // CH1, CH2
};

// Piece type constraints
const PIECE_TYPE_CHAIN_MAP = {
    'Pantalon': [0, 1, 5, 6],   // CH1, CH2, CH6, CH7
    'Robe': [0, 1, 5, 6],       // CH1, CH2, CH6, CH7
};

function getEligibleChains(order) {
    const client = (order.client || '').toLowerCase().trim();
    const pieceType = order.pieceType || detectPieceType(order.model);

    // Brand constraints take priority (MaxMara/CEHP → CH1, CH2)
    for (const [brand, chains] of Object.entries(BRAND_CHAIN_MAP)) {
        if (client.includes(brand)) {
            return chains;
        }
    }

    // Piece type constraints
    if (PIECE_TYPE_CHAIN_MAP[pieceType]) {
        return PIECE_TYPE_CHAIN_MAP[pieceType];
    }

    // Default: prefer CH3-CH8 first (reserve CH1/CH2 for brand clients)
    return Array.from({ length: NUM_CHAINS - 2 }, (_, i) => i + 2); // [2,3,4,5,6,7]
}

// Fallback chains including CH1/CH2 — used when preferred chains are all full
function getAllChains() {
    return Array.from({ length: NUM_CHAINS }, (_, i) => i); // [0,1,2,3,4,5,6,7]
}

// ── Calculate production duration from quantity
function calcProductionDays(quantity) {
    if (!quantity || quantity <= 0) return 1;
    return Math.ceil(quantity / getPiecesPerDay());
}

// ── Utilities
function toDate(str) {
    if (!str) return null;
    const d = new Date(str + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
}

// Add N working days (skipping Sundays)
function addWorkingDays(date, n) {
    const d = new Date(date);
    let remaining = n;
    while (remaining > 0) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0) { // 0 = Sunday
            remaining--;
        }
    }
    return d;
}

// Simple calendar day addition (for non-scheduling uses)
function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

// Skip to next workday if date falls on Sunday
function skipToWorkday(date) {
    const d = new Date(date);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Sunday → Monday
    return d;
}

// Count working days between two dates (excluding Sundays)
function diffWorkingDays(a, b) {
    let count = 0;
    const d = new Date(a);
    while (d < b) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0) count++;
    }
    return count;
}

function diffDays(a, b) {
    return Math.round((b - a) / (86400000));
}

function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Recalculate duration based on a 6-day workweek (85% of calendar days)
function calcDuration(arrivalStr, deliveryStr) {
    if (!arrivalStr || !deliveryStr) return 5;
    try {
        const a = new Date(arrivalStr + 'T00:00:00');
        const b = new Date(deliveryStr + 'T00:00:00');
        if (isNaN(a.getTime()) || isNaN(b.getTime())) return 5;
        const diffDays = Math.round((b - a) / 86400000);
        return Math.max(1, Math.round(diffDays * (6 / 7)));
    } catch {
        return 5;
    }
}

// ── Sort orders by priority rules
function sortOrders(orders) {
    const priorityWeight = { urgent: 0, high: 1, normal: 2 };
    return [...orders].sort((a, b) => {
        // 1. Arrival date (fabric availability is the primary constraint)
        if (a.arrivalDate !== b.arrivalDate) return a.arrivalDate < b.arrivalDate ? -1 : 1;
        // 2. Priority (urgent first, on the same day)
        const pa = priorityWeight[a.priority] ?? 2;
        const pb = priorityWeight[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        // 3. Earliest delivery date
        if (a.deliveryDate !== b.deliveryDate) return a.deliveryDate < b.deliveryDate ? -1 : 1;
        // 4. Larger quantity first (harder to fit)
        return (b.quantity || 0) - (a.quantity || 0);
    });
}

// ── Find the earliest available start date on a chain (skips Sundays)
function getEarliestStart(chainSlots, arrivalDate, duration) {
    let arrival = toDate(arrivalDate);
    if (!arrival) return null;
    arrival = skipToWorkday(arrival);

    // If no slots, start at arrival
    if (chainSlots.length === 0) {
        return arrival;
    }

    // Sort existing slots by start date
    const sorted = [...chainSlots].sort((a, b) => a.start - b.start);

    // Try before the first slot
    if (arrival < sorted[0].start) {
        const endIfStartEarly = addWorkingDays(arrival, duration);
        if (endIfStartEarly <= sorted[0].start) {
            return arrival;
        }
    }

    // Try gaps between existing slots
    for (let i = 0; i < sorted.length; i++) {
        const gapStart = skipToWorkday(sorted[i].end);
        const candidateStart = gapStart > arrival ? gapStart : arrival;
        const candidateEnd = addWorkingDays(candidateStart, duration);

        if (i + 1 < sorted.length) {
            if (candidateEnd <= sorted[i + 1].start) {
                return candidateStart;
            }
        } else {
            // After the last slot
            return candidateStart;
        }
    }

    return arrival;
}

// ── Check if a slot fits without overlap (using working days)
function slotFits(chainSlots, start, duration) {
    const end = addWorkingDays(start, duration);
    return !chainSlots.some(slot =>
        start < slot.end && end > slot.start
    );
}

// ── Main scheduling algorithm
export function runScheduler(orders) {
    // Chain availability: array of 9 arrays of { start, end, orderId }
    const chains = CHAIN_NAMES.map(() => []);
    const schedule = [];
    const unscheduled = [];

    // Pre-compute production duration and piece type for each order
    const enrichedOrders = orders.map(order => {
        return {
            ...order,
            pieceType: order.pieceType || detectPieceType(order.model),
            productionDays: calcProductionDays(order.quantity),
        };
    });

    // 1. Separate locked and unlocked orders
    const locked = [];
    const unlocked = [];
    enrichedOrders.forEach(order => {
        if (order.lockedChain && CHAIN_NAMES.includes(order.lockedChain)) {
            locked.push(order);
        } else {
            unlocked.push(order);
        }
    });

    // 2. Schedule locked orders first
    sortOrders(locked).forEach(order => {
        const chainIdx = CHAIN_NAMES.indexOf(order.lockedChain);
        const arrival = toDate(order.arrivalDate);
        const delivery = toDate(order.deliveryDate);
        if (!arrival) return;

        const duration = order.productionDays;
        const start = getEarliestStart(chains[chainIdx], order.arrivalDate, duration);
        if (!start) { unscheduled.push(order.id); return; }

        const end = addWorkingDays(start, duration);
        chains[chainIdx].push({ start, end, orderId: order.id });

        let status = 'On Time';
        if (delivery && end > delivery) status = 'Late';
        else if (delivery && diffDays(end, delivery) <= 1) status = 'Risk';

        schedule.push({
            orderId: order.id,
            chain: order.lockedChain,
            startDate: fmtDate(start),
            endDate: fmtDate(end),
            duration,
            status,
            pieceType: order.pieceType,
            isHidden: order.isHidden || false,
        });
    });

    // 3. Schedule unlocked orders
    sortOrders(unlocked).forEach(order => {
        const arrival = toDate(order.arrivalDate);
        if (!arrival) {
            unscheduled.push(order.id);
            return;
        }
        const delivery = toDate(order.deliveryDate);
        const duration = order.productionDays;

        // Get eligible chains for this order
        const eligibleChains = getEligibleChains(order);

        // Function to find the best single chain for a given duration
        // Strongly prefers chains where the order starts immediately after
        // the last one ends (no idle gap on the chain — critical for textiles)
        const findBestSingleChain = (dur, chainList) => {
            let bChain = -1;
            let bStart = null;
            let bChainIdleGap = Infinity; // idle gap ON the chain (want 0)
            let bIsLate = false;
            let bestBusy = Infinity;

            for (const c of chainList) {
                const start = getEarliestStart(chains[c], order.arrivalDate, dur);
                if (!start) continue;

                if (!slotFits(chains[c], start, dur)) continue;

                const end = addWorkingDays(start, dur);
                const isLate = delivery ? end > delivery : false;

                // Calculate the idle gap on this chain: days between the 
                // last order's end date and this order's start date.
                // A gap of 0 means perfectly back-to-back (ideal).
                let chainIdleGap = 0;
                if (chains[c].length > 0) {
                    const lastEnd = chains[c].reduce((latest, slot) =>
                        slot.end > latest ? slot.end : latest, chains[c][0].end);
                    chainIdleGap = Math.max(0, diffDays(lastEnd, start));
                } else {
                    // Empty chain — treat as a large gap so we prefer filling
                    // already-busy chains first (keeps utilization tight)
                    chainIdleGap = 1000;
                }

                const totalBusy = chains[c].reduce((sum, s) => sum + diffDays(s.start, s.end), 0);

                if (bChain === -1) {
                    bChain = c; bStart = start; bIsLate = isLate; bestBusy = totalBusy; bChainIdleGap = chainIdleGap;
                } else {
                    // Priority 1: prefer on-time over late
                    if (bIsLate && !isLate) {
                        bChain = c; bStart = start; bIsLate = isLate; bestBusy = totalBusy; bChainIdleGap = chainIdleGap;
                    } else if (bIsLate === isLate) {
                        // Priority 2: prefer the smallest idle gap (keeps orders tightly packed back-to-back)
                        if (chainIdleGap < bChainIdleGap) {
                            bChain = c; bStart = start; bestBusy = totalBusy; bChainIdleGap = chainIdleGap;
                        }
                        // Priority 3: If gaps are the same, prefer starting earlier (maximizes machine utilization immediately)
                        else if (chainIdleGap === bChainIdleGap) {
                            if (start < bStart) {
                                bChain = c; bStart = start; bestBusy = totalBusy; bChainIdleGap = chainIdleGap;
                            }
                            // Priority 4: load balance the least busy chain if they start on the exact same day
                            else if (start.getTime() === bStart.getTime() && totalBusy < bestBusy) {
                                bChain = c; bStart = start; bestBusy = totalBusy; bChainIdleGap = chainIdleGap;
                            }
                        }
                    }
                }
            }
            return { chain: bChain, start: bStart, isLate: bIsLate };
        };

        // 1. Try preferred chains first
        let best = findBestSingleChain(duration, eligibleChains);

        // 2. If late or unschedulable on preferred chains, try ALL chains as overflow
        //    (only for non-brand orders — brand orders already have their designated chains)
        const isBrandOrder = Object.keys(BRAND_CHAIN_MAP).some(b =>
            (order.client || '').toLowerCase().includes(b));
        if ((best.isLate || best.chain === -1) && !isBrandOrder) {
            const overflowBest = findBestSingleChain(duration, getAllChains());
            if (overflowBest.chain !== -1 && (!overflowBest.isLate || best.chain === -1)) {
                best = overflowBest;
            }
        }

        // 3. If late on a single chain, try splitting into 2 or 3 chains
        let isSplit = false;
        let splits = [];

        // For splits, use all available chains (overflow allowed for non-brand)
        const splitChains = isBrandOrder ? eligibleChains : getAllChains();

        if (best.isLate && splitChains.length >= 2 && duration > 2) {
            // Try 2 split
            const splitQty2 = Math.ceil(order.quantity / 2);
            const dur2 = calcProductionDays(splitQty2);

            // Collect all eligible chains with their best start times for dur2
            const chainOptions2 = splitChains.map(c => {
                const s = getEarliestStart(chains[c], order.arrivalDate, dur2);
                const fit = s && slotFits(chains[c], s, dur2);
                const e = fit ? addWorkingDays(s, dur2) : null;
                const late = (e && delivery) ? e > delivery : false;
                return { c, s, e, late, fit };
            }).filter(opt => opt.fit);

            if (chainOptions2.length >= 2) {
                // We pick the 2 chains that allow the earliest finish
                // Apply a large 10-year penalty to fallback chains so eligible ones are strictly preferred
                chainOptions2.sort((a, b) => {
                    const penaltyA = eligibleChains.includes(a.c) ? 0 : 3650 * 86400000;
                    const penaltyB = eligibleChains.includes(b.c) ? 0 : 3650 * 86400000;
                    return (a.e.getTime() + penaltyA) - (b.e.getTime() + penaltyB);
                });
                splits = [
                    { chain: chainOptions2[0].c, start: chainOptions2[0].s, dur: dur2, qty: splitQty2 },
                    { chain: chainOptions2[1].c, start: chainOptions2[1].s, dur: dur2, qty: order.quantity - splitQty2 }
                ];
                isSplit = true;
            } else if (splitChains.length >= 3 && duration > 3) {
                // Try 3 split as a last resort
                const splitQty3 = Math.ceil(order.quantity / 3);
                const dur3 = calcProductionDays(splitQty3);

                const chainOptions3 = splitChains.map(c => {
                    const s = getEarliestStart(chains[c], order.arrivalDate, dur3);
                    const fit = s && slotFits(chains[c], s, dur3);
                    const e = fit ? addWorkingDays(s, dur3) : null;
                    const late = (e && delivery) ? e > delivery : false;
                    return { c, s, e, late, fit };
                }).filter(opt => opt.fit);

                if (chainOptions3.length >= 3) {
                    chainOptions3.sort((a, b) => {
                        const penaltyA = eligibleChains.includes(a.c) ? 0 : 3650 * 86400000;
                        const penaltyB = eligibleChains.includes(b.c) ? 0 : 3650 * 86400000;
                        return (a.e.getTime() + penaltyA) - (b.e.getTime() + penaltyB);
                    });
                    splits = [
                        { chain: chainOptions3[0].c, start: chainOptions3[0].s, dur: dur3, qty: splitQty3 },
                        { chain: chainOptions3[1].c, start: chainOptions3[1].s, dur: dur3, qty: splitQty3 },
                        { chain: chainOptions3[2].c, start: chainOptions3[2].s, dur: dur3, qty: order.quantity - (splitQty3 * 2) }
                    ];
                    isSplit = true;
                }
            }
        }

        if (isSplit) {
            splits.forEach((split, index) => {
                const end = addWorkingDays(split.start, split.dur);
                chains[split.chain].push({ start: split.start, end, orderId: order.id });

                let status = 'On Time';
                if (delivery && end > delivery) status = 'Late';
                else if (delivery && diffDays(end, delivery) <= 1) status = 'Risk';

                schedule.push({
                    orderId: order.id,
                    chain: CHAIN_NAMES[split.chain],
                    startDate: fmtDate(split.start),
                    endDate: fmtDate(end),
                    duration: split.dur,
                    status,
                    pieceType: order.pieceType,
                    splitPart: index + 1,
                    totalSplits: splits.length,
                    isHidden: order.isHidden || false,
                });
            });
        } else {
            // Check if we found ANY chain at all
            if (best.chain === -1) {
                unscheduled.push(order.id);
                return;
            }

            const end = addWorkingDays(best.start, duration);
            chains[best.chain].push({ start: best.start, end, orderId: order.id });

            let status = 'On Time';
            if (delivery && end > delivery) status = 'Late';
            else if (delivery && diffDays(end, delivery) <= 1) status = 'Risk';

            schedule.push({
                orderId: order.id,
                chain: CHAIN_NAMES[best.chain],
                startDate: fmtDate(best.start),
                endDate: fmtDate(end),
                duration,
                status,
                pieceType: order.pieceType,
                isHidden: order.isHidden || false,
            });
        }
    });

    // 4. Left-compaction pass: remove artificial scheduling gaps
    // by sliding orders as far left as their arrivalDate allows.
    chains.forEach((chainSlots, chainIdx) => {
        chainSlots.sort((a, b) => a.start - b.start);
        for (let i = 0; i < chainSlots.length; i++) {
            const slot = chainSlots[i];
            const order = enrichedOrders.find(o => o.id === slot.orderId);
            if (!order) continue;

            const arrival = skipToWorkday(toDate(order.arrivalDate));
            const prevEnd = i === 0 ? arrival : skipToWorkday(chainSlots[i - 1].end);
            const candidateStart = prevEnd > arrival ? prevEnd : arrival;

            if (candidateStart < slot.start) {
                const oldStart = slot.start;
                const duration = diffWorkingDays(oldStart, slot.end);

                slot.start = candidateStart;
                slot.end = addWorkingDays(candidateStart, duration);

                // Update the corresponding entry in the schedule array
                const schedEntry = schedule.find(s =>
                    s.orderId === slot.orderId &&
                    s.chain === CHAIN_NAMES[chainIdx] &&
                    s.startDate === fmtDate(oldStart)
                );

                if (schedEntry) {
                    schedEntry.startDate = fmtDate(slot.start);
                    schedEntry.endDate = fmtDate(slot.end);

                    const delivery = toDate(order.deliveryDate);
                    let status = 'On Time';
                    if (delivery && slot.end > delivery) status = 'Late';
                    else if (delivery && diffDays(slot.end, delivery) <= 1) status = 'Risk';
                    schedEntry.status = status;
                }
            }
        }
    });

    // Sort schedule by chain then start date
    schedule.sort((a, b) => {
        if (a.chain !== b.chain) return a.chain.localeCompare(b.chain);
        return a.startDate.localeCompare(b.startDate);
    });

    return { schedule, unscheduled, chains };
}

export { CHAIN_NAMES, NUM_CHAINS, getPiecesPerDay, PIECES_PER_HOUR, detectPieceType, calcProductionDays, getEligibleChains };
