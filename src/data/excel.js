/* ═══════════════════════════════════════════════════
   EXCEL IMPORT / EXPORT
   Handles French-language textile production Excel files
   ═══════════════════════════════════════════════════ */

import * as XLSX from 'xlsx';
import { detectPieceType, calcProductionDays } from '../scheduler/engine.js';

// ── Column mapping (flexible matching for French/English headers)
const COL_MAP = {
    id: ['order id', 'orderid', 'order_id', 'id', 'ref', 'reference', 'n°', 'no', 'num'],
    client: ['client', 'customer', 'buyer', 'société', 'societe', 'company', 'fournisseur'],
    model: ['model', 'modèle', 'modele', 'product', 'article', 'style', 'design'],
    quantity: ['quantity', 'quantité', 'quantite', 'qty', 'pcs', 'pieces', 'qte'],
    arrival: ['arrival', 'arrival date', 'date arrival', 'arrivée', 'arrivee', 'available',
        'start date', 'date début', 'date arrivée', 'arrivee a fes', 'arrivée à fes',
        'date arrivee', 'arrivee fes', 'date arrivée à fes'],
    delivery: ['delivery', 'delivery date', 'date delivery', 'deadline', 'due date',
        'échéance', 'echeance', 'livraison', 'date livraison', 'date fin',
        'depart', 'depart de fes', 'départ de fes', 'depart fes', 'départ',
        'date depart', 'date départ'],
    duration: ['duration', 'durée', 'duree', 'production time', 'days', 'jours',
        'estimated duration', 'production duration'],
    priority: ['priority', 'priorité', 'priorite', 'urgency', 'urgence'],
    observations: ['observations', 'observation', 'notes', 'note', 'remarques', 'remarque', 'commentaire'],
    price: ['prix', 'price', 'prix en euro', 'prix en euros', 'prix unitaire', 'pu'],
};

function matchColumn(header) {
    const h = header.toString().toLowerCase().trim()
        .replace(/\s+/g, ' ')       // normalize whitespace
        .replace(/[''`]/g, "'");    // normalize quotes
    for (const [field, aliases] of Object.entries(COL_MAP)) {
        if (aliases.some(a => {
            if (h === a) return true;
            // Only allow partial matching (includes) for aliases with 3+ chars
            // to avoid single-letter aliases like 'n' matching 'quantite'
            if (a.length >= 3 && h.includes(a)) return true;
            return false;
        })) return field;
    }
    return null;
}

function parseDate(val) {
    if (val === null || val === undefined || val === '') return '';

    // If it's already a Date object
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return '';
        return formatDateObj(val);
    }

    // Excel serial number — convert manually (no dependency on XLSX.SSF)
    if (typeof val === 'number') {
        try {
            // Excel epoch: Jan 0, 1900 (with the Lotus 1-2-3 leap year bug)
            const excelEpoch = new Date(1899, 11, 30);
            const d = new Date(excelEpoch.getTime() + val * 86400000);
            if (!isNaN(d.getTime())) return formatDateObj(d);
        } catch (e) { /* ignore */ }
        return '';
    }

    const str = String(val).trim();
    if (!str) return '';

    // Try yyyy-mm-dd (ISO)
    const iso = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

    // Try dd/mm/yyyy or dd-mm-yyyy (European format — most common in French files)
    const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

    // Try to let JS parse it
    try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return formatDateObj(d);
    } catch (e) { /* ignore */ }

    return '';
}

function formatDateObj(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Safely get a value from a row — returns '' if column is unmapped
function safeGet(row, colMapping, field) {
    const col = colMapping[field];
    if (!col) return '';
    const val = row[col];
    return val !== null && val !== undefined ? val : '';
}

// Parse European-style quantity: "1.200" = 1200, "65.000" = 65000
function parseQuantity(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return Math.round(val);

    let str = String(val).trim();
    if (!str) return 0;

    // Remove non-numeric chars except dots, commas, minus
    // European thousands separator: 1.200 → 1200, 65.000 → 65000
    if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
        str = str.replace(/\./g, '');
    }
    // Also handle comma as decimal separator: 1.200,50
    str = str.replace(/\./g, '').replace(',', '.');

    const n = parseFloat(str);
    return isNaN(n) ? 0 : Math.round(n);
}

// Calculate working days between two dates
function calcDuration(arrivalStr, deliveryStr) {
    if (!arrivalStr || !deliveryStr) return 5; // default
    try {
        const a = new Date(arrivalStr + 'T00:00:00');
        const b = new Date(deliveryStr + 'T00:00:00');
        if (isNaN(a.getTime()) || isNaN(b.getTime())) return 5;

        const diffMs = b - a;
        const diffDays = Math.round(diffMs / 86400000);

        // Use ~85% of calendar days as production duration (6 working days / 7 days)
        return Math.max(1, Math.round(diffDays * (6 / 7)));
    } catch (e) {
        return 5;
    }
}

// ── Import orders from an Excel file (ArrayBuffer)
export function importOrdersFromExcel(buffer) {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Strategy: First try to find the actual header row.
    // Some Excel files have title rows, merged cells, etc. before the real headers.
    // We scan for a row that contains recognizable column names.
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }); // raw 2D array
    console.log('Total rows in sheet:', allRows.length);
    if (allRows.length < 2) return [];

    // Find the header row by scanning for known column names
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(allRows.length, 15); i++) {
        const row = allRows[i];
        if (!Array.isArray(row)) continue;
        const rowStr = row.map(c => String(c || '').toLowerCase().trim().replace(/\s+/g, ' ')).join('|');
        // Check if this row contains at least 2 recognizable column names
        let matchCount = 0;
        const knownHeaders = ['quantit', 'modele', 'modèle', 'client', 'arriv', 'depart', 'départ', 'prix', 'observation'];
        for (const kh of knownHeaders) {
            if (rowStr.includes(kh)) matchCount++;
        }
        if (matchCount >= 2) {
            headerRowIdx = i;
            console.log(`Found header row at index ${i}:`, allRows[i]);
            break;
        }
    }

    // If we didn't find a header row, fall back to row 0
    if (headerRowIdx < 0) {
        headerRowIdx = 0;
        console.log('No header row detected, using row 0');
    }

    // Extract headers from the identified row
    const headerRow = allRows[headerRowIdx].map(c => String(c || '').trim());
    console.log('Detected headers:', headerRow);

    // Build column mapping from these headers
    const colMapping = {}; // field -> column index
    headerRow.forEach((h, colIdx) => {
        if (!h) return;
        const field = matchColumn(h);
        if (field && !(field in colMapping)) {
            colMapping[field] = colIdx;
        }
    });

    console.log('Column mapping (by index):', colMapping);

    // Fallbacks: if key columns weren't matched, try positional guessing
    // Common French textile Excel: QUANTITE | MODELE | CLIENT | PRIX | ARRIVEE | DEPART | OBSERVATIONS
    if (!('quantity' in colMapping) && headerRow.length >= 1) {
        colMapping.quantity = 0; // first column is often QUANTITE
    }
    if (!('model' in colMapping) && headerRow.length >= 2) {
        colMapping.model = 1;
    }
    if (!('client' in colMapping) && headerRow.length >= 3) {
        colMapping.client = 2;
    }

    console.log('Final column mapping:', colMapping);

    // Parse data rows (everything after the header row)
    const orders = [];
    for (let i = headerRowIdx + 1; i < allRows.length; i++) {
        try {
            const row = allRows[i];
            if (!Array.isArray(row) || row.length === 0) continue;

            // Helper to get value by field name
            const get = (field) => {
                const idx = colMapping[field];
                if (idx === undefined || idx === null) return '';
                const val = row[idx];
                return val !== null && val !== undefined ? val : '';
            };

            const model = String(get('model')).trim();
            const client = String(get('client')).trim();
            const quantity = parseQuantity(get('quantity'));
            const arrivalDate = parseDate(get('arrival'));
            const deliveryDate = parseDate(get('delivery'));

            // Skip completely empty rows or rows that look like sub-headers
            if (!model && !client && !quantity) continue;
            // Skip if model matches a header keyword (duplicate header row)
            if (model.toLowerCase() === 'modele' || model.toLowerCase() === 'modèle') continue;

            // Piece type auto-detection
            const pieceType = detectPieceType(model);

            // Duration: computed from quantity ÷ 630 pcs/day
            let duration = calcProductionDays(quantity);

            // Priority
            let priority = 'normal';
            const priVal = get('priority');
            if (priVal) {
                priority = String(priVal).toLowerCase().trim();
            } else {
                const obs = String(get('observations')).toLowerCase();
                if (obs.includes('urgent')) priority = 'urgent';
                else if (obs.includes('priorit') || obs.includes('important')) priority = 'high';
            }

            const idVal = get('id');
            const todayStr = new Date().toISOString().slice(0, 10);

            let finalArrivalDate = arrivalDate;
            if (!finalArrivalDate) {
                if (deliveryDate) {
                    // Safe parsing to avoid timezone offset issues
                    const [y, m, d] = deliveryDate.split('-').map(Number);
                    const dDate = new Date(y, m - 1, d);
                    dDate.setDate(dDate.getDate() - 21); // 3 weeks before deadline
                    finalArrivalDate = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`;
                } else {
                    finalArrivalDate = todayStr;
                }
            }

            orders.push({
                id: idVal ? String(idVal).trim() : `ORD-${String(orders.length + 1).padStart(3, '0')}`,
                client,
                model,
                pieceType,
                quantity,
                arrivalDate: finalArrivalDate,
                deliveryDate: deliveryDate || '',
                duration,
                priority,
                lockedChain: '',
            });
        } catch (rowErr) {
            console.warn(`Skipping row ${i + 1} due to error:`, rowErr);
        }
    }

    console.log(`Imported ${orders.length} orders`);
    console.log('Sample imported order:', orders[0]);
    return orders;
}

// ── Export schedule to Excel
export function exportToExcel(orders, schedule, analytics) {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Orders
    const ordersData = orders.map(o => ({
        'Order ID': o.id,
        'Client': o.client,
        'Modèle': o.model,
        'Quantité': o.quantity,
        'Arrivée': o.arrivalDate,
        'Départ': o.deliveryDate,
        'Durée (jours)': o.duration,
        'Priorité': o.priority,
        'Chaîne Verrouillée': o.lockedChain || '',
    }));
    const wsOrders = XLSX.utils.json_to_sheet(ordersData);
    XLSX.utils.book_append_sheet(wb, wsOrders, 'Commandes');

    // Sheet 2: Schedule
    const scheduleData = schedule.map(s => {
        const order = orders.find(o => o.id === s.orderId) || {};
        return {
            'Chaîne': s.chain,
            'Order ID': s.orderId,
            'Client': order.client || '',
            'Modèle': order.model || '',
            'Quantité': order.quantity || 0,
            'Date Début': s.startDate,
            'Date Fin': s.endDate,
            'Durée': s.duration,
            'Statut': s.status,
        };
    });
    const wsSchedule = XLSX.utils.json_to_sheet(scheduleData);
    XLSX.utils.book_append_sheet(wb, wsSchedule, 'Planning');

    // Sheet 3: KPIs
    if (analytics) {
        const kpiData = [
            { 'Métrique': 'Total Commandes', 'Valeur': analytics.totalOrders },
            { 'Métrique': 'Commandes Planifiées', 'Valeur': analytics.scheduledOrders },
            { 'Métrique': 'Non Planifiées', 'Valeur': analytics.unscheduledOrders },
            { 'Métrique': 'Commandes en Retard', 'Valeur': analytics.lateRiskCount },
            { 'Métrique': 'Utilisation Globale %', 'Valeur': Math.round(analytics.overallUtilization * 100) + '%' },
        ];
        analytics.chainUtilization.forEach((u, i) => {
            kpiData.push({ 'Métrique': `CH${i + 1} Utilisation %`, 'Valeur': Math.round(u * 100) + '%' });
        });
        analytics.idleTime.forEach((idle, i) => {
            kpiData.push({ 'Métrique': `CH${i + 1} Jours Inactifs`, 'Valeur': idle });
        });
        const wsKPI = XLSX.utils.json_to_sheet(kpiData);
        XLSX.utils.book_append_sheet(wb, wsKPI, 'KPIs');
    }

    XLSX.writeFile(wb, `Planning_Production_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Export Gantt chart as a vertical chain table (like the handwritten sheet)
export function exportGanttTable(orders, schedule) {
    const wb = XLSX.utils.book_new();

    // Group schedule entries by chain, sorted by startDate (first in → last out)
    const chains = {};
    schedule.forEach(s => {
        if (!chains[s.chain]) chains[s.chain] = [];
        const order = orders.find(o => o.id === s.orderId) || {};
        chains[s.chain].push({
            client: order.client || '',
            model: order.model || '',
            quantity: order.quantity || 0,
            startDate: s.startDate,
            endDate: s.endDate,
            orderId: s.orderId,
        });
    });

    // Sort each chain's orders by startDate
    Object.values(chains).forEach(arr => {
        arr.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    });

    // Get all chain names in order
    const chainNames = Object.keys(chains).sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, '')) || 0;
        const nb = parseInt(b.replace(/\D/g, '')) || 0;
        return na - nb;
    });

    if (chainNames.length === 0) return;

    // Each chain gets 3 columns: Client, Modèle, Quantité
    const COLS_PER_CHAIN = 3;
    const maxRows = Math.max(...chainNames.map(c => chains[c].length));

    // Build the sheet data as a 2D array
    // Row 0: Chain names (merged across 3 columns each)
    // Row 1: Sub-headers: Client | Modèle | Quantité
    // Row 2+: Data
    const data = [];

    // Row 0 — Chain header row
    const headerRow = [];
    chainNames.forEach(name => {
        headerRow.push(name, '', '');
    });
    data.push(headerRow);

    // Row 1 — Sub-header row
    const subHeaderRow = [];
    chainNames.forEach(() => {
        subHeaderRow.push('Client', 'Modèle', 'Quantité');
    });
    data.push(subHeaderRow);

    // Data rows
    for (let r = 0; r < maxRows; r++) {
        const row = [];
        chainNames.forEach(name => {
            const entry = chains[name][r];
            if (entry) {
                row.push(entry.client, entry.model, entry.quantity);
            } else {
                row.push('', '', '');
            }
        });
        data.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Merge chain header cells (row 0: merge every 3 columns)
    ws['!merges'] = [];
    chainNames.forEach((_, i) => {
        const startCol = i * COLS_PER_CHAIN;
        ws['!merges'].push({
            s: { r: 0, c: startCol },
            e: { r: 0, c: startCol + COLS_PER_CHAIN - 1 },
        });
    });

    // Set column widths
    ws['!cols'] = [];
    chainNames.forEach(() => {
        ws['!cols'].push(
            { wch: 16 },  // Client
            { wch: 28 },  // Modèle
            { wch: 10 },  // Quantité
        );
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Planning Chaînes');
    XLSX.writeFile(wb, `Planning_Chaines_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
