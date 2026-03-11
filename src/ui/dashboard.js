/* ═══════════════════════════════════════════════════
   KPI DASHBOARD — v2.0 with ApexCharts
   ═══════════════════════════════════════════════════ */

import ApexCharts from 'apexcharts';
import store from '../data/store.js';
import { computeAnalytics, weeklyChainLoad } from '../scheduler/analytics.js';
import { CHAIN_NAMES } from '../scheduler/engine.js';

// Track the currently selected month across re-renders
let currentMonth = '';

// Chart instance registry — destroy before recreating
const charts = {};

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

/** Extract sorted unique months (YYYY-MM) from the schedule */
function getAvailableMonths(schedule) {
  const months = new Set();
  schedule.forEach(s => {
    if (s.startDate) months.add(s.startDate.slice(0, 7));
    if (s.endDate) months.add(s.endDate.slice(0, 7));
  });
  return [...months].sort();
}

/** Format "YYYY-MM" → "Jan 2026" */
function formatMonthLabel(ym) {
  const [y, m] = ym.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

/** Shared ApexCharts dark-theme base options */
function baseTheme() {
  return {
    theme: { mode: 'dark' },
    chart: {
      background: 'transparent',
      fontFamily: "'Inter', sans-serif",
      toolbar: { show: false },
      animations: { enabled: true, speed: 600, animateGradually: { enabled: true, delay: 60 } },
    },
    grid: {
      borderColor: 'rgba(255,255,255,0.06)',
      strokeDashArray: 4,
    },
    tooltip: {
      theme: 'dark',
      style: { fontSize: '12px', fontFamily: "'Inter', sans-serif" },
    },
  };
}

/** ── 1. HORIZONTAL BAR CHART — Chain Utilization ── */
function renderUtilizationChart(a) {
  destroyChart('util');
  const el = document.getElementById('chart-util');
  if (!el) return;

  const pcts = a.chainUtilization.map(u => Math.round(u * 100));
  const colors = pcts.map(p =>
    p >= 80 ? '#f87171' : p >= 60 ? '#f59e0b' : p >= 30 ? '#10b981' : '#06b6d4'
  );

  const options = {
    ...baseTheme(),
    chart: { ...baseTheme().chart, type: 'bar', height: 280 },
    series: [{ name: 'Utilization', data: pcts }],
    xaxis: {
      categories: CHAIN_NAMES,
      labels: { style: { colors: '#7e8aac', fontSize: '12px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      max: 100,
      labels: {
        formatter: v => `${v}%`,
        style: { colors: '#7e8aac', fontSize: '11px' },
      },
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: '55%',
        distributed: true,
        dataLabels: { position: 'top' },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: v => `${v}%`,
      offsetY: -20,
      style: { fontSize: '11px', fontWeight: 600, colors: ['#eef0f6'] },
    },
    colors,
    legend: { show: false },
    grid: { ...baseTheme().grid, padding: { top: 10, bottom: 0 } },
    tooltip: {
      ...baseTheme().tooltip,
      y: { formatter: v => `${v}% busy` },
    },
  };

  charts['util'] = new ApexCharts(el, options);
  charts['util'].render();
}

/** ── 2. DONUT CHART — On-Time Delivery Rate ── */
function renderOTDDonut(a) {
  destroyChart('otd');
  const el = document.getElementById('chart-otd');
  if (!el) return;

  const onTime = a.onTimeCount;
  const late = a.lateOrders.length;
  const risk = a.riskOrders.length;
  const total = onTime + late + risk;

  const options = {
    ...baseTheme(),
    chart: { ...baseTheme().chart, type: 'donut', height: 280 },
    series: [onTime, late, risk],
    labels: ['On Time', 'Late', 'At Risk'],
    colors: ['#10b981', '#f87171', '#f59e0b'],
    plotOptions: {
      pie: {
        donut: {
          size: '72%',
          labels: {
            show: true,
            name: { show: true, fontSize: '13px', color: '#7e8aac', offsetY: -4 },
            value: {
              show: true, fontSize: '26px', fontWeight: 700, color: '#eef0f6', offsetY: 8,
              formatter: v => v,
            },
            total: {
              show: true, label: 'On Time',
              fontSize: '12px', color: '#7e8aac',
              formatter: () => total > 0 ? `${Math.round((onTime / total) * 100)}%` : '—',
            },
          },
        },
      },
    },
    legend: {
      position: 'bottom',
      fontSize: '12px',
      labels: { colors: '#7e8aac' },
      markers: { radius: 4 },
    },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    tooltip: { ...baseTheme().tooltip, y: { formatter: v => `${v} orders` } },
  };

  charts['otd'] = new ApexCharts(el, options);
  charts['otd'].render();
}

/** ── 3. HEATMAP — Weekly Factory Load ── */
function renderLoadHeatmap() {
  destroyChart('heatmap');
  const el = document.getElementById('chart-heatmap');
  if (!el) return;

  const series = weeklyChainLoad(store.schedule);
  if (!series.length) {
    el.innerHTML = `<div class="chart-empty">No schedule data</div>`;
    return;
  }

  // Limit to last 16 weeks for readability
  const trimmed = series.map(s => ({
    ...s,
    data: s.data.slice(-16),
  }));

  const options = {
    ...baseTheme(),
    chart: { ...baseTheme().chart, type: 'heatmap', height: 280 },
    series: trimmed,
    dataLabels: { enabled: false },
    xaxis: {
      type: 'category',
      labels: {
        rotate: -45,
        style: { colors: '#7e8aac', fontSize: '10px' },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: '#7e8aac', fontSize: '11px' } },
    },
    plotOptions: {
      heatmap: {
        radius: 4,
        enableShades: true,
        colorScale: {
          ranges: [
            { from: 0, to: 0, color: '#0d1128', name: 'Idle' },
            { from: 1, to: 40, color: '#0e4f3f', name: 'Low' },
            { from: 41, to: 70, color: '#0891b2', name: 'Medium' },
            { from: 71, to: 89, color: '#d97706', name: 'High' },
            { from: 90, to: 100, color: '#ef4444', name: 'Full' },
          ],
        },
      },
    },
    tooltip: {
      ...baseTheme().tooltip,
      y: { formatter: v => `${v}% busy` },
    },
    legend: {
      show: true, position: 'bottom',
      fontSize: '11px', labels: { colors: '#7e8aac' },
    },
  };

  charts['heatmap'] = new ApexCharts(el, options);
  charts['heatmap'].render();
}

/** ── 4. RISK ORDER CARDS — styled severity list ── */
function renderRiskCards(a) {
  const el = document.getElementById('risk-cards-container');
  if (!el) return;

  const riskAndLate = [...a.lateOrders, ...a.riskOrders];
  if (!riskAndLate.length) {
    el.innerHTML = `<div class="no-issues"><span>✅</span> All orders on schedule</div>`;
    return;
  }

  el.innerHTML = riskAndLate.slice(0, 12).map(s => {
    const order = store.orders.find(o => o.id === s.orderId) || {};
    const isLate = s.status === 'Late';
    const color = isLate ? '#f87171' : '#f59e0b';
    const badge = isLate ? 'badge-danger' : 'badge-warning';
    return `
      <div class="risk-card" style="border-left: 3px solid ${color};">
        <div class="risk-card-top">
          <span class="risk-order-id">${s.orderId}</span>
          <span class="badge ${badge}">${s.status}</span>
        </div>
        <div class="risk-card-model">${order.model || '—'}</div>
        <div class="risk-card-chain">${s.chain}</div>
      </div>
    `;
  }).join('');
}

/** ── 5. OVERTIME CARDS ── */
function renderOvertimeCards(a) {
  const el = document.getElementById('overtime-cards-container');
  if (!el) return;

  if (!a.overtimeSuggestions.length) {
    el.innerHTML = `<div class="no-issues"><span>✅</span> No overtime needed</div>`;
    return;
  }

  el.innerHTML = a.overtimeSuggestions.slice(0, 8).map(ot => `
    <div class="overtime-card">
      <div class="overtime-top">
        <span class="risk-order-id">${ot.orderId}</span>
        <span class="overtime-days">+${ot.daysOver}d</span>
      </div>
      <div class="risk-card-model">${ot.model}</div>
      <div class="risk-card-chain">${ot.chain} · ${ot.suggestion}</div>
    </div>
  `).join('');
}

/** ── MAIN RENDER ── */
export function renderDashboard() {
  const empty = document.getElementById('dashboard-empty');
  const content = document.getElementById('dashboard-content');

  if (store.schedule.length === 0) {
    // Destroy any charts that might be around from before
    ['util', 'otd', 'heatmap'].forEach(destroyChart);
    empty.style.display = 'flex';
    content.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  content.style.display = 'block';

  // ── Month selector
  const monthSelect = document.getElementById('dashboard-month');
  const availableMonths = getAvailableMonths(store.schedule);

  if (currentMonth && !availableMonths.includes(currentMonth)) currentMonth = '';

  monthSelect.innerHTML =
    `<option value="">All Months</option>` +
    availableMonths.map(m =>
      `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${formatMonthLabel(m)}</option>`
    ).join('');

  monthSelect.onchange = () => { currentMonth = monthSelect.value; renderDashboard(); };

  // ── Compute analytics
  const a = computeAnalytics(store.orders, store.schedule, currentMonth || null);
  const monthLabel = currentMonth ? formatMonthLabel(currentMonth) : 'All Months';

  // ── SVG icon templates for KPI cards
  const kpiIcons = {
    orders: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    util: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    alert: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    overload: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    otd: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  };

  // ── KPI Hero Cards
  document.getElementById('kpi-cards').innerHTML = `
    <div class="kpi-card kpi-accent">
      <div class="kpi-icon-wrap kpi-icon--accent">${kpiIcons.orders}</div>
      <div class="kpi-label">${store.t('totalOrders')}</div>
      <div class="kpi-value">${a.totalOrders}</div>
      <div class="kpi-sub">${a.scheduledOrders} scheduled · ${a.unscheduledOrders} unscheduled</div>
      <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${a.totalOrders ? (a.scheduledOrders / a.totalOrders * 100).toFixed(0) : 0}%; background: var(--accent);"></div></div>
    </div>
    <div class="kpi-card kpi-success">
      <div class="kpi-icon-wrap kpi-icon--success">${kpiIcons.util}</div>
      <div class="kpi-label">${store.t('overallUtilization')}</div>
      <div class="kpi-value">${Math.round(a.overallUtilization * 100)}%</div>
      <div class="kpi-sub">${monthLabel} — ${CHAIN_NAMES.length} chains</div>
      <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${Math.round(a.overallUtilization * 100)}%; background: var(--accent-3);"></div></div>
    </div>
    <div class="kpi-card ${a.lateRiskCount > 0 ? 'kpi-danger' : 'kpi-success'}">
      <div class="kpi-icon-wrap ${a.lateRiskCount > 0 ? 'kpi-icon--danger' : 'kpi-icon--success'}">${a.lateRiskCount > 0 ? kpiIcons.alert : kpiIcons.check}</div>
      <div class="kpi-label">${store.t('lateRiskOrders')}</div>
      <div class="kpi-value">${a.lateRiskCount}</div>
      <div class="kpi-sub">${a.lateOrders.length} late · ${a.riskOrders.length} at risk</div>
      <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${a.totalOrders ? (a.lateRiskCount / a.totalOrders * 100).toFixed(0) : 0}%; background: var(--danger);"></div></div>
    </div>
    <div class="kpi-card kpi-info">
      <div class="kpi-icon-wrap kpi-icon--info">${kpiIcons.overload}</div>
      <div class="kpi-label">${store.t('overloadWeeks')}</div>
      <div class="kpi-value">${a.overloadWeeks.length}</div>
      <div class="kpi-sub">≥80% chains busy</div>
      <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${Math.min(a.overloadWeeks.length * 10, 100)}%; background: var(--accent-2);"></div></div>
    </div>
    <div class="kpi-card ${a.onTimeRate >= 0.9 ? 'kpi-success' : a.onTimeRate >= 0.7 ? 'kpi-warning' : 'kpi-danger'}">
      <div class="kpi-icon-wrap ${a.onTimeRate >= 0.9 ? 'kpi-icon--success' : a.onTimeRate >= 0.7 ? 'kpi-icon--warning' : 'kpi-icon--danger'}">${kpiIcons.otd}</div>
      <div class="kpi-label">${store.t('onTimeDeliveryRate')}</div>
      <div class="kpi-value">${Math.round(a.onTimeRate * 100)}%</div>
      <div class="kpi-sub">${a.onTimeCount} on time · ${a.lateOrders.length} late</div>
      <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${Math.round(a.onTimeRate * 100)}%; background:${a.onTimeRate >= 0.9 ? '#10b981' : a.onTimeRate >= 0.7 ? '#f59e0b' : '#f87171'};"></div></div>
    </div>
  `;

  // ── Charts (deferred to next frame so containers are in DOM)
  requestAnimationFrame(() => {
    renderUtilizationChart(a);
    renderOTDDonut(a);
    renderLoadHeatmap();
    renderRiskCards(a);
    renderOvertimeCards(a);
  });
}
