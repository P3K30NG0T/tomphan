// tomphan. — GPU rental unit-economics model
// One GPU, bought today and rented out over its economic life. Runs in the browser, in Node (Vercel, harness).
// The base case is set from the market research (data/market.json) through setBase(); MODEL_DEFAULTS is the fallback.

export const MODEL_DEFAULTS = {
  capex: 35000,     // all-in USD per GPU: GPU + share of server, network, storage (analyst input)
  price: 2.35,      // USD per GPU-hour in year 1 (H100 1-yr contract index)
  lock: 1,          // years the year-1 price is fixed by contract; afterwards the rent follows the market curve
  decline: 0.15,    // annual fall in the market rent for a GPU of this age
  util: 0.85,       // share of hours actually billed
  kw: 1.4,          // kW per GPU incl. server share and cooling
  elec: 0.087,      // USD per kWh
  otherOpex: 0.30,  // USD per available GPU-hour: colocation, network, staff, maintenance
  life: 5,          // economic life in years
  residual: 0.05,   // resale value at end of life, share of capex
  wacc: 0.11,       // discount rate
  tax: 0.21         // corporate tax rate
};

export const LIMITS = {
  capex: [10000, 60000], price: [1.0, 5.0], lock: [0, 6], decline: [0, 0.45], util: [0.4, 1],
  kw: [0.8, 2.5], elec: [0.04, 0.2], otherOpex: [0.1, 0.8], life: [2, 8],
  residual: [0, 0.3], wacc: [0.05, 0.2], tax: [0, 0.3]
};

const HOURS = 8760;
let BASE = { ...MODEL_DEFAULTS };

const clampTo = (k, v) => Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], Number(v)));
function pick(over = {}) {
  const out = {};
  for (const k of Object.keys(MODEL_DEFAULTS)) {
    const v = over[k];
    if (v === undefined || v === null || v === "" || Number.isNaN(Number(v))) continue;
    out[k] = clampTo(k, v);
  }
  return out;
}

export function setBase(over) { BASE = { ...MODEL_DEFAULTS, ...pick(over) }; BASE.life = Math.round(BASE.life); BASE.lock = Math.round(BASE.lock); }
export function getBase() { return { ...BASE }; }

export function withDefaults(over = {}) {
  const p = { ...BASE, ...pick(over) };
  p.life = Math.round(p.life);
  p.lock = Math.min(Math.round(p.lock), p.life);
  return p;
}

export function scenarioInputs(name) {
  const b = BASE;
  if (name === "bull") return { decline: Math.max(0.05, b.decline - 0.08), util: Math.min(0.95, b.util + 0.05), lock: 3, life: 6 };
  if (name === "bear") return { decline: Math.min(0.45, b.decline + 0.08), util: Math.max(0.4, b.util - 0.15), lock: 1, life: 4 };
  return {};
}
export const SCENARIO_LABELS = {
  bull: "Shortage lasts: slower price fall, 3-year contract, 6-year life",
  base: "Market evidence as measured",
  bear: "Faster obsolescence: steeper price fall, lower utilization, 4-year life"
};

export const rentAt = (p, t) => t <= p.lock ? p.price : p.price * Math.pow(1 - p.decline, t - 1);

function flowsFor(p) {
  const dep = p.capex / p.life;
  const rows = [];
  for (let t = 1; t <= p.life; t++) {
    const price = rentAt(p, t);
    const revenue = price * HOURS * p.util;
    const power = p.kw * HOURS * p.util * p.elec;
    const other = p.otherOpex * HOURS;
    const ebitda = revenue - power - other;
    const ebit = ebitda - dep;
    const tax = ebit * p.tax; // negative = tax shield used by the wider business
    const residual = t === p.life ? p.residual * p.capex : 0;
    rows.push({ year: t, price, revenue, power, other, ebitda, dep, ebit, tax, residual, fcf: ebitda - tax + residual });
  }
  return { rows, flows: [-p.capex, ...rows.map(r => r.fcf)] };
}

export function schedule(input) { const p = withDefaults(input); return { p, rows: flowsFor(p).rows }; }

export function npvAt(flows, rate) { return flows.reduce((s, cf, t) => s + cf / Math.pow(1 + rate, t), 0); }

export function irr(flows) {
  let lo = -0.99, hi = 2;
  if (npvAt(flows, lo) * npvAt(flows, hi) > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npvAt(flows, lo) * npvAt(flows, mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

// Unclamped NPV for solver searches
const npvRaw = p => npvAt(flowsFor(p).flows, p.wacc);
function solve(f, lo, hi) {
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 120; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

export function evaluate(input) {
  const p = withDefaults(input);
  const { rows, flows } = flowsFor(p);
  const npv = npvAt(flows, p.wacc);
  let cum = -p.capex, payback = null;
  for (const row of rows) { const before = cum; cum += row.fcf; if (payback === null && cum >= 0) payback = row.year - 1 + (-before / row.fcf); }
  const y1 = rows[0];
  return {
    inputs: p, rows, flows, npv, irr: irr(flows), payback,
    y1Revenue: y1.revenue, y1EbitdaMargin: y1.ebitda / y1.revenue, depToRevenueY1: y1.dep / y1.revenue,
    ebitMargin6y: (y1.ebitda - p.capex / 6) / y1.revenue, ebitMarginEcon: y1.ebit / y1.revenue,
    breakevenPrice: solve(x => npvRaw({ ...p, price: x }), 0.1, 12),      // year-1 rent that makes NPV = 0
    breakevenCapex: solve(x => npvRaw({ ...p, capex: x }), 500, 250000),  // most you can pay per GPU, all-in
    cashCost: p.kw * p.elec + p.otherOpex / p.util                        // cash cost per billed GPU-hour
  };
}

export function scenario(name, over = {}) { return evaluate({ ...scenarioInputs(name), ...over }); }

// One-at-a-time sensitivity of NPV around a case
export const TORNADO_SPECS = [
  { key: "price", label: "Rent, year 1", lo: p => p.price * 0.8, hi: p => p.price * 1.2, fmt: v => `$${v.toFixed(2)}/hr` },
  { key: "decline", label: "Annual rent decline", lo: p => p.decline + 0.08, hi: p => Math.max(0, p.decline - 0.08), fmt: v => `${Math.round(v * 100)}%` },
  { key: "capex", label: "Capex per GPU", lo: p => p.capex * 1.2, hi: p => p.capex * 0.8, fmt: v => `$${Math.round(v / 1000)}k` },
  { key: "lock", label: "Years locked by contract", lo: p => Math.max(0, p.lock - 1), hi: p => p.lock + 2, fmt: v => `${v} yr` },
  { key: "util", label: "Utilization", lo: p => p.util - 0.10, hi: p => Math.min(1, p.util + 0.10), fmt: v => `${Math.round(v * 100)}%` },
  { key: "life", label: "Economic life", lo: p => Math.max(2, p.life - 2), hi: p => p.life + 2, fmt: v => `${v} yrs` },
  { key: "wacc", label: "Cost of capital", lo: p => p.wacc + 0.03, hi: p => p.wacc - 0.03, fmt: v => `${(v * 100).toFixed(0)}%` },
  { key: "elec", label: "Electricity price", lo: p => p.elec * 1.5, hi: p => p.elec * 0.6, fmt: v => `${(v * 100).toFixed(1)}¢/kWh` }
];

export function tornado(input) {
  const base = evaluate(input);
  const p = base.inputs;
  const bars = TORNADO_SPECS.map(s => {
    const loV = s.lo(p), hiV = s.hi(p);
    const lo = evaluate({ ...p, [s.key]: loV }).npv, hi = evaluate({ ...p, [s.key]: hiV }).npv;
    return { key: s.key, label: s.label, low: lo, high: hi, lowLabel: s.fmt(withDefaults({ ...p, [s.key]: loV })[s.key]), highLabel: s.fmt(withDefaults({ ...p, [s.key]: hiV })[s.key]), swing: Math.abs(hi - lo) };
  }).sort((a, b) => b.swing - a.swing);
  return { baseNpv: base.npv, bars };
}

// NPV grid: years locked by contract × all-in capex — the two levers a buyer controls
export function lockCapexGrid(input, locks = [0, 1, 2, 3, 4, 5], capexes = [20000, 25000, 30000, 35000, 40000]) {
  return { locks, capexes, grid: capexes.map(c => locks.map(L => evaluate({ ...input, lock: L, capex: c }).npv)) };
}

export const CLUSTER = 1000; // GPUs in the illustrative cluster

