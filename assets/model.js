// tomphan. — GPU rental unit-economics model
// One H100 GPU, valued over its economic life. Works in the browser and in Node (Vercel function).

export const DEFAULTS = {
  capex: 35000,        // all-in USD per GPU: GPU + share of server, network, storage (assumption)
  price: 2.35,         // USD per GPU-hour, year 1 (SemiAnalysis H100 1-yr contract index, Mar 2026)
  decline: 0.15,       // annual fall in rental price as newer GPUs arrive (assumption)
  util: 0.85,          // share of hours actually billed (assumption)
  kw: 1.4,             // kW per GPU incl. server share and cooling overhead (assumption)
  elec: 0.087,         // USD per kWh (EIA US industrial average, May 2026)
  otherOpex: 0.30,     // USD per GPU-hour available: colocation, network, staff, maintenance (assumption)
  life: 5,             // economic life in years
  residual: 0.05,      // resale value at end of life, share of capex
  wacc: 0.11,          // discount rate
  tax: 0.21            // US federal corporate rate
};

export const SCENARIOS = {
  bull: { label: "Bull", price: 2.80, decline: 0.10, util: 0.90, life: 6 },
  base: { label: "Base" },
  bear: { label: "Bear", price: 2.00, decline: 0.25, util: 0.70, life: 3 }
};

export const LIMITS = {
  capex: [20000, 60000], price: [1.0, 5.0], decline: [0, 0.4], util: [0.4, 1],
  kw: [0.8, 2.5], elec: [0.04, 0.2], otherOpex: [0.1, 0.8], life: [2, 8],
  residual: [0, 0.3], wacc: [0.05, 0.2], tax: [0, 0.3]
};

const HOURS = 8760;

export function withDefaults(over = {}) {
  const p = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (over[k] === undefined || over[k] === null || Number.isNaN(Number(over[k]))) continue;
    const [lo, hi] = LIMITS[k];
    p[k] = Math.min(hi, Math.max(lo, Number(over[k])));
  }
  p.life = Math.round(p.life);
  return p;
}

// Year-by-year cash flows for one GPU
export function schedule(input) {
  const p = withDefaults(input);
  const dep = p.capex / p.life;
  const rows = [];
  for (let t = 1; t <= p.life; t++) {
    const price = p.price * Math.pow(1 - p.decline, t - 1);
    const revenue = price * HOURS * p.util;
    const power = p.kw * HOURS * p.util * p.elec;
    const other = p.otherOpex * HOURS;
    const ebitda = revenue - power - other;
    const ebit = ebitda - dep;
    const tax = ebit * p.tax; // negative = tax shield used by the wider company
    const residual = t === p.life ? p.residual * p.capex : 0;
    const fcf = ebitda - tax + residual;
    rows.push({ year: t, price, revenue, power, other, ebitda, dep, ebit, tax, residual, fcf });
  }
  return { p, rows };
}

export function npvAt(flows, rate) {
  return flows.reduce((s, cf, t) => s + cf / Math.pow(1 + rate, t), 0);
}

export function irr(flows) {
  let lo = -0.99, hi = 2;
  if (npvAt(flows, lo) * npvAt(flows, hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npvAt(flows, lo) * npvAt(flows, mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function evaluate(input) {
  const { p, rows } = schedule(input);
  const flows = [-p.capex, ...rows.map(r => r.fcf)];
  const npv = npvAt(flows, p.wacc);
  const r = irr(flows);
  let cum = -p.capex, payback = null;
  for (const row of rows) {
    const before = cum;
    cum += row.fcf;
    if (payback === null && cum >= 0) payback = row.year - 1 + (-before / row.fcf);
  }
  const y1 = rows[0];
  // Same year-1 business, booked with 6-year accounting depreciation (CoreWeave's policy)
  const ebitMargin6y = (y1.ebitda - p.capex / 6) / y1.revenue;
  const ebitMarginEcon = y1.ebit / y1.revenue;
  return {
    inputs: p, rows, flows, npv, irr: r, payback,
    y1Revenue: y1.revenue, y1EbitdaMargin: y1.ebitda / y1.revenue,
    depToRevenueY1: y1.dep / y1.revenue,
    ebitMargin6y, ebitMarginEcon,
    breakevenPrice: breakeven(p)
  };
}

// Year-1 price that makes NPV = 0, holding everything else fixed
export function breakeven(p) {
  let lo = 0.1, hi = 10;
  // computed directly so the price search is not clamped by LIMITS
  const g = x => {
    const q = { ...p, price: x };
    const dep = q.capex / q.life; let flows = [-q.capex];
    for (let t = 1; t <= q.life; t++) {
      const rev = x * Math.pow(1 - q.decline, t - 1) * HOURS * q.util;
      const ebitda = rev - q.kw * HOURS * q.util * q.elec - q.otherOpex * HOURS;
      const fcf = ebitda - (ebitda - dep) * q.tax + (t === q.life ? q.residual * q.capex : 0);
      flows.push(fcf);
    }
    return npvAt(flows, q.wacc);
  };
  if (g(lo) > 0 || g(hi) < 0) return null;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (g(m) > 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

export function scenario(name, over = {}) {
  const s = SCENARIOS[name] || {};
  const { label, ...vals } = s;
  return evaluate({ ...vals, ...over });
}

// One-at-a-time sensitivity of NPV around a base case
export const TORNADO_SPECS = [
  { key: "price", label: "Rental price (yr 1)", lo: p => p.price * 0.8, hi: p => p.price * 1.2, fmt: v => `$${v.toFixed(2)}/hr` },
  { key: "decline", label: "Annual price decline", lo: p => p.decline + 0.10, hi: p => Math.max(0, p.decline - 0.10), fmt: v => `${Math.round(v * 100)}%` },
  { key: "util", label: "Utilization", lo: p => p.util - 0.10, hi: p => Math.min(1, p.util + 0.10), fmt: v => `${Math.round(v * 100)}%` },
  { key: "life", label: "Economic life", lo: () => 3, hi: () => 7, fmt: v => `${v} yrs` },
  { key: "capex", label: "Capex per GPU", lo: p => p.capex * 1.2, hi: p => p.capex * 0.8, fmt: v => `$${Math.round(v / 1000)}k` },
  { key: "wacc", label: "Discount rate (WACC)", lo: p => p.wacc + 0.03, hi: p => p.wacc - 0.03, fmt: v => `${(v * 100).toFixed(0)}%` },
  { key: "elec", label: "Electricity price", lo: p => p.elec * 1.3, hi: p => p.elec * 0.7, fmt: v => `${(v * 100).toFixed(1)}¢/kWh` }
];

export function tornado(input) {
  const base = evaluate(input);
  const p = base.inputs;
  const bars = TORNADO_SPECS.map(s => {
    const loV = s.lo(p), hiV = s.hi(p);
    const lo = evaluate({ ...p, [s.key]: loV }).npv;
    const hi = evaluate({ ...p, [s.key]: hiV }).npv;
    return { key: s.key, label: s.label, low: lo, high: hi, lowLabel: s.fmt(loV), highLabel: s.fmt(hiV), swing: Math.abs(hi - lo) };
  }).sort((a, b) => b.swing - a.swing);
  return { baseNpv: base.npv, bars };
}

// NPV grid over economic life × year-1 price
export function lifePriceGrid(input, lives = [3, 4, 5, 6, 7], prices = [1.75, 2.05, 2.35, 2.65, 2.95, 3.25]) {
  return lives.map(L => prices.map(pr => evaluate({ ...input, life: L, price: pr }).npv));
}

export const CLUSTER = 1000; // GPUs in the illustrative cluster
