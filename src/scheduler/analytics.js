/* ═══════════════════════════════════════════════════
   ANALYTICS — KPI Computation
   ═══════════════════════════════════════════════════ */

import { NUM_CHAINS, CHAIN_NAMES } from './engine.js';

function toDate(str) {
    return new Date(str + 'T00:00:00');
}

function diffDays(a, b) {
    return Math.round((b - a) / 86400000);
}

function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

export function computeAnalytics(orders, schedule, selectedMonth = null) {
    // Filter schedule by month if a specific month is selected (format: "YYYY-MM")
    let filteredSchedule = schedule;
    let filteredOrders = orders;

    if (selectedMonth) {
        const [year, month] = selectedMonth.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0); // last day of month

        // Include schedule entries that overlap with the selected month
        filteredSchedule = schedule.filter(s => {
            const start = toDate(s.startDate);
            const end = toDate(s.endDate);
            return start <= monthEnd && end >= monthStart;
        });

        // Filter orders to those that have a scheduled entry in this month
        const scheduledOrderIds = new Set(filteredSchedule.map(s => s.orderId));
        filteredOrders = orders.filter(o => scheduledOrderIds.has(o.id));
    }

    if (!filteredSchedule.length) {
        return {
            totalOrders: filteredOrders.length,
            scheduledOrders: 0,
            unscheduledOrders: filteredOrders.length,
            lateRiskCount: 0,
            lateOrders: [],
            riskOrders: [],
            chainUtilization: new Array(NUM_CHAINS).fill(0),
            idleTime: new Array(NUM_CHAINS).fill(0),
            overallUtilization: 0,
            overloadWeeks: [],
            overtimeSuggestions: [],
            onTimeRate: 0,
            onTimeCount: 0,
        };
    }

    // Date range — scoped to the selected month or the full schedule range
    let minDate, maxDate;
    if (selectedMonth) {
        const [year, month] = selectedMonth.split('-').map(Number);
        minDate = new Date(year, month - 1, 1);
        maxDate = new Date(year, month, 0); // last day of month
    } else {
        const allStarts = filteredSchedule.map(s => toDate(s.startDate));
        const allEnds = filteredSchedule.map(s => toDate(s.endDate));
        minDate = new Date(Math.min(...allStarts));
        maxDate = new Date(Math.max(...allEnds));
    }
    const totalDays = Math.max(diffDays(minDate, maxDate), 1);

    // Chain utilization — count busy days within the date range only
    const chainBusy = new Array(NUM_CHAINS).fill(0);
    const chainSlots = CHAIN_NAMES.map(() => []);

    filteredSchedule.forEach(s => {
        const chainIdx = CHAIN_NAMES.indexOf(s.chain);
        if (chainIdx >= 0) {
            const start = toDate(s.startDate);
            const end = toDate(s.endDate);
            // Clamp to the date range
            const clampedStart = start < minDate ? minDate : start;
            const clampedEnd = end > maxDate ? maxDate : end;
            const busyDays = Math.max(diffDays(clampedStart, clampedEnd), 0);
            chainBusy[chainIdx] += busyDays;
            chainSlots[chainIdx].push({ start, end });
        }
    });

    const chainUtilization = chainBusy.map(busy => Math.min(busy / totalDays, 1));
    const idleTime = chainBusy.map(busy => Math.max(totalDays - busy, 0));
    const overallUtilization = chainBusy.reduce((a, b) => a + b, 0) / (totalDays * NUM_CHAINS);

    // Late and risk orders
    const lateOrders = filteredSchedule.filter(s => s.status === 'Late');
    const riskOrders = filteredSchedule.filter(s => s.status === 'Risk');

    // Overload week detection (within date range)
    const overloadWeeks = [];
    let weekStart = new Date(minDate);
    while (weekStart < maxDate) {
        const weekEnd = addDays(weekStart, 7);
        let busyChainsThisWeek = 0;

        for (let c = 0; c < NUM_CHAINS; c++) {
            const isChainBusy = chainSlots[c].some(slot =>
                slot.start < weekEnd && slot.end > weekStart
            );
            if (isChainBusy) busyChainsThisWeek++;
        }

        const loadPct = busyChainsThisWeek / NUM_CHAINS;
        if (loadPct >= 0.8) {
            overloadWeeks.push({
                weekStart: weekStart.toISOString().slice(0, 10),
                weekEnd: weekEnd.toISOString().slice(0, 10),
                busyChains: busyChainsThisWeek,
                loadPercent: Math.round(loadPct * 100),
            });
        }
        weekStart = weekEnd;
    }

    // Overtime suggestions for late orders
    const overtimeSuggestions = lateOrders.map(s => {
        const order = orders.find(o => o.id === s.orderId);
        if (!order) return null;
        const delivery = toDate(order.deliveryDate);
        const endDate = toDate(s.endDate);
        const daysOver = diffDays(delivery, endDate);
        return {
            orderId: s.orderId,
            model: order.model,
            chain: s.chain,
            daysOver,
            suggestion: daysOver <= 2
                ? `Add ${daysOver} day(s) overtime on ${s.chain}`
                : `Consider splitting or reassigning — ${daysOver} days over deadline`,
        };
    }).filter(Boolean);

    // On-Time Delivery rate
    const onTimeCount = filteredSchedule.length - lateOrders.length;
    const onTimeRate = filteredSchedule.length > 0
        ? onTimeCount / filteredSchedule.length
        : 0;

    return {
        totalOrders: filteredOrders.length,
        scheduledOrders: filteredSchedule.length,
        unscheduledOrders: Math.max(filteredOrders.length - filteredSchedule.length, 0),
        lateRiskCount: lateOrders.length + riskOrders.length,
        lateOrders,
        riskOrders,
        chainUtilization,
        idleTime,
        overallUtilization,
        overloadWeeks,
        overtimeSuggestions,
        onTimeRate,
        onTimeCount,
    };
}

/**
 * Build a heatmap-ready dataset: for each chain, an array of
 * { x: weekLabel, y: loadPercent } covering the full schedule range.
 * Returned as ApexCharts series format: [{ name: chainName, data: [{x,y},...] }, ...]
 */
export function weeklyChainLoad(schedule) {
    if (!schedule.length) return [];
    const CHAIN_NAMES_LOCAL = [...new Set(schedule.map(s => s.chain))].sort();
    const allStarts = schedule.map(s => new Date(s.startDate + 'T00:00:00'));
    const allEnds = schedule.map(s => new Date(s.endDate + 'T00:00:00'));
    const minDate = new Date(Math.min(...allStarts));
    const maxDate = new Date(Math.max(...allEnds));

    // Build week buckets (Mon-aligned)
    const weeks = [];
    let ws = new Date(minDate);
    while (ws <= maxDate) {
        const we = new Date(ws);
        we.setDate(we.getDate() + 6);
        weeks.push({ start: new Date(ws), end: new Date(we), label: ws.toISOString().slice(5, 10) });
        ws.setDate(ws.getDate() + 7);
    }

    // For each chain, compute busy % per week
    return CHAIN_NAMES_LOCAL.map(chain => {
        const chainSchedule = schedule.filter(s => s.chain === chain);
        const data = weeks.map(w => {
            const totalDays = 7;
            let busyDays = 0;
            chainSchedule.forEach(s => {
                const start = new Date(s.startDate + 'T00:00:00');
                const end = new Date(s.endDate + 'T00:00:00');
                if (start <= w.end && end >= w.start) {
                    const overlapStart = start < w.start ? w.start : start;
                    const overlapEnd = end > w.end ? w.end : end;
                    busyDays += Math.max(0, (overlapEnd - overlapStart) / 86400000);
                }
            });
            return { x: w.label, y: Math.min(100, Math.round((busyDays / totalDays) * 100)) };
        });
        return { name: chain, data };
    });
}

