import { DEFAULTS, SCENARIOS, LIMITS, evaluate, tornado, lifePriceGrid, CLUSTER } from "./model.js";
import { computeRoutes, ROUTES, MEMO_DEFAULTS, TELEGRAM_FACTS } from "./memo.js";
import { initCopilot } from "./copilot.js";

const $ = s => document.querySelector(s);
const usd = (v, d = 0) => (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const usdM = v => (v < 0 ? "−$" : "$") + (Math.abs(v) / 1e6).toFixed(Math.abs(v) >= 1e7 ? 1 : 2) + "M";
const pc = (v, d = 1) => v === null || v === undefined ? "n/a" : (v * 100).toFixed(d) + "%";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- router ---------------- */
const VIEWS = ["home", "gpu", "memo", "copilot"];
function route() {
  const h = (location.hash || "#home").slice(1);
  const view = VIEWS.includes(h) ? h : "home";
  VIEWS.forEach(v => { $(`#view-${v}`).hidden = v !== view; });
  document.querySelectorAll("[data-nav]").forEach(a => { if (a.dataset.nav === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (!VIEWS.includes(h)) { const el = document.getElementById(h); if (el) el.scrollIntoView(); } else window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
document.addEventListener("click", e => {
  const s = e.target.closest("[data-scroll]");
  if (s) { e.preventDefault(); if (location.hash && location.hash !== "#home") location.hash = "home"; setTimeout(() => document.getElementById(s.dataset.scroll)?.scrollIntoView({ behavior: "smooth" }), 30); }
  const c = e.target.closest("[data-copy]");
  if (c) {
    const text = document.getElementById(c.dataset.copy).textContent;
    const done = () => { c.textContent = "Copied"; setTimeout(() => c.textContent = "Copy", 1500); };
    try { navigator.clipboard.writeText(text).then(done, () => selectText(c.dataset.copy)); } catch { selectText(c.dataset.copy); }
  }
});
function selectText(id) { const r = document.createRange(); r.selectNodeContents(document.getElementById(id)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

/* ---------------- SVG helpers ---------------- */
const C = { acc: "var(--accent)", pos: "var(--pos)", neg: "var(--neg)", mut: "var(--chart-2)", line: "var(--line)", ink: "var(--ink)" };
const niceStep = range => { const raw = range / 5, p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
function ticks(lo, hi) { const st = niceStep(hi - lo || 1); const out = []; for (let v = Math.floor(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(6)); return out; }
const kfmt = v => (v < 0 ? "−" : "") + "$" + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(Math.abs(v) % 1000 === 0 ? 0 : 1) + "k" : Math.abs(v).toFixed(0));

export function barLineChart({ labels, bars, line, w = 640, h = 260 }) {
  const m = { l: 56, r: 16, t: 14, b: 30 };
  const all = [...bars, ...(line || []), 0];
  const lo = Math.min(...all), hi = Math.max(...all);
  const tk = ticks(lo, hi); const y0 = tk[0], y1 = tk[tk.length - 1];
  const Y = v => m.t + (h - m.t - m.b) * (1 - (v - y0) / (y1 - y0 || 1));
  const bw = (w - m.l - m.r) / labels.length;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Cash flow chart">`;
  tk.forEach(t => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(t)}" y2="${Y(t)}" style="stroke:${t === 0 ? C.ink : C.line};stroke-width:${t === 0 ? 1 : .6}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${kfmt(t)}</text>`; });
  bars.forEach((v, i) => {
    const x = m.l + i * bw + bw * .2, top = Y(Math.max(v, 0)), bot = Y(Math.min(v, 0));
    s += `<rect x="${x}" y="${top}" width="${bw * .6}" height="${Math.max(1, bot - top)}" rx="3" style="fill:${v < 0 ? C.neg : C.acc};opacity:${v < 0 ? .85 : .9}"><title>${labels[i]}: ${usd(v)}</title></rect>`;
    s += `<text x="${x + bw * .3}" y="${h - 10}" text-anchor="middle">${labels[i]}</text>`;
  });
  if (line) {
    const pts = line.map((v, i) => `${m.l + i * bw + bw / 2},${Y(v)}`).join(" ");
    s += `<polyline points="${pts}" style="fill:none;stroke:${C.ink};stroke-width:1.6"/>`;
    line.forEach((v, i) => { s += `<circle cx="${m.l + i * bw + bw / 2}" cy="${Y(v)}" r="${i === line.length - 1 ? 4 : 2.5}" style="fill:${C.ink}"><title>Cumulative ${labels[i]}: ${usd(v)}</title></circle>`; });
    const last = line[line.length - 1];
    s += `<text class="lbl-strong" x="${m.l + (line.length - 1) * bw + bw / 2}" y="${Y(last) - 9}" text-anchor="middle">${kfmt(Math.round(last))}</text>`;
  }
  return s + "</svg>";
}

export function tornadoChart(t, w = 640) {
  const rowH = 34, m = { l: 236, r: 72, t: 22, b: 10 }; // labels end at 150; 70px reserved for value labels
  const h = m.t + m.b + rowH * t.bars.length;
  const vals = t.bars.flatMap(b => [b.low, b.high]).concat(t.baseNpv);
  const span = Math.max(...vals.map(v => Math.abs(v - t.baseNpv))) * 1.05 || 1;
  const X = v => m.l + (w - m.l - m.r) * ((v - t.baseNpv) / (2 * span) + .5);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Sensitivity tornado">`;
  s += `<text x="${X(t.baseNpv)}" y="12" text-anchor="middle" class="lbl-strong">Current NPV ${kfmt(Math.round(t.baseNpv))}</text>`;
  t.bars.forEach((b, i) => {
    const y = m.t + i * rowH + 6;
    const [a, z] = [b.low, b.high].sort((p, q) => p - q);
    s += `<text x="150" y="${y + 15}" text-anchor="end" style="fill:var(--ink);font:12px var(--body)">${b.label}</text>`;
    s += `<rect x="${X(a)}" y="${y}" width="${Math.max(1, X(Math.min(z, t.baseNpv)) - X(a))}" height="20" rx="3" style="fill:${C.neg};opacity:.8"><title>${b.lowLabel}: ${usd(b.low)}</title></rect>`;
    s += `<rect x="${X(Math.max(a, t.baseNpv))}" y="${y}" width="${Math.max(1, X(z) - X(Math.max(a, t.baseNpv)))}" height="20" rx="3" style="fill:${C.pos};opacity:.8"><title>${b.highLabel}: ${usd(b.high)}</title></rect>`;
    s += `<text x="${X(a) - 4}" y="${y + 14}" text-anchor="end">${b.low < b.high ? b.lowLabel : b.highLabel}</text>`;
    s += `<text x="${X(z) + 4}" y="${y + 14}">${b.low < b.high ? b.highLabel : b.lowLabel}</text>`;
  });
  s += `<line x1="${X(t.baseNpv)}" x2="${X(t.baseNpv)}" y1="${m.t}" y2="${h - m.b}" style="stroke:${C.ink};stroke-width:1"/>`;
  return s + "</svg>";
}

function gridChart(grid, lives, prices, cur, w = 640) {
  const m = { l: 92, r: 10, t: 34, b: 10 }, cw = (w - m.l - m.r) / prices.length, ch = 34;
  const h = m.t + m.b + ch * lives.length;
  const mx = Math.max(...grid.flat().map(Math.abs)) || 1;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="NPV by life and price">`;
  s += `<text x="${m.l}" y="12" class="lbl-strong">Year-1 rental price ($/GPU-hr) →</text>`;
  prices.forEach((p, j) => { s += `<text x="${m.l + j * cw + cw / 2}" y="28" text-anchor="middle">$${p.toFixed(2)}</text>`; });
  lives.forEach((L, i) => {
    s += `<text x="${m.l - 10}" y="${m.t + i * ch + 21}" text-anchor="end">${L}-yr life</text>`;
    prices.forEach((p, j) => {
      const v = grid[i][j], a = .15 + .7 * Math.min(1, Math.abs(v) / mx);
      const isCur = cur.life === L && Math.abs(cur.price - p) < .001;
      s += `<rect x="${m.l + j * cw + 2}" y="${m.t + i * ch + 2}" width="${cw - 4}" height="${ch - 4}" rx="4" style="fill:${v >= 0 ? C.pos : C.neg};opacity:${a.toFixed(2)};${isCur ? "stroke:var(--ink);stroke-width:2" : ""}"><title>${L} years, $${p.toFixed(2)}/hr: NPV ${usd(v)}</title></rect>`;
      s += `<text x="${m.l + j * cw + cw / 2}" y="${m.t + i * ch + 21}" text-anchor="middle" style="fill:var(--ink);font-weight:${isCur ? 700 : 400}">${(v / 1000).toFixed(1)}</text>`;
    });
  });
  return s + "</svg>";
}

function cwChart(d, w = 560, h = 240) {
  const m = { l: 44, r: 12, t: 14, b: 44 };
  const dna = d.dna.map((v, i) => v / d.revenue[i]), opm = d.operatingIncome.map((v, i) => v / d.revenue[i]);
  const lo = Math.min(-0.1, ...opm), hi = .6;
  const Y = v => m.t + (h - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  const gw = (w - m.l - m.r) / d.periods.length, bw = gw * .3;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="CoreWeave ratios">`;
  [-.1, 0, .2, .4, .6].forEach(t => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(t)}" y2="${Y(t)}" style="stroke:${t === 0 ? C.ink : C.line};stroke-width:${t === 0 ? 1 : .6}"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${Math.round(t * 100)}%</text>`; });
  d.periods.forEach((p, i) => {
    const x = m.l + i * gw + gw * .18;
    s += `<rect x="${x}" y="${Y(dna[i])}" width="${bw}" height="${Y(0) - Y(dna[i])}" rx="3" style="fill:${C.acc}"><title>${p} D&A / revenue: ${pc(dna[i])}</title></rect>`;
    s += `<text x="${x + bw / 2}" y="${Y(dna[i]) - 5}" text-anchor="middle" class="lbl-strong">${Math.round(dna[i] * 100)}%</text>`;
    const o = opm[i], x2 = x + bw + 4;
    s += `<rect x="${x2}" y="${Y(Math.max(o, 0))}" width="${bw}" height="${Math.max(1, Math.abs(Y(o) - Y(0)))}" rx="3" style="fill:${o < 0 ? C.neg : C.mut}"><title>${p} operating margin: ${pc(o)}</title></rect>`;
    s += `<text x="${x2 + bw / 2}" y="${o < 0 ? Y(o) + 12 : Y(o) - 5}" text-anchor="middle">${Math.round(o * 100)}%</text>`;
    s += `<text x="${x + bw + 2}" y="${h - 24}" text-anchor="middle">${p}</text>`;
  });
  s += `<rect x="${m.l}" y="${h - 14}" width="10" height="10" style="fill:${C.acc}"/><text x="${m.l + 14}" y="${h - 5}">D&amp;A / revenue</text>`;
  s += `<rect x="${m.l + 130}" y="${h - 14}" width="10" height="10" style="fill:${C.mut}"/><text x="${m.l + 144}" y="${h - 5}">Operating margin</text>`;
  return s + "</svg>";
}

export function routeChart(rows, w = 640) {
  const m = { l: 118, r: 14, t: 8, b: 30 }, rh = 38;
  const h = m.t + m.b + rh * rows.length;
  const X = v => m.l + (w - m.l - m.r) * v;
  const segs = [["fee", "Payment fees", C.neg], ["platform", "Platform", C.mut], ["creators", "Creators", C.acc]];
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Split of each dollar">`;
  rows.forEach((r, i) => {
    const y = m.t + i * rh + 6; let x0 = 0;
    s += `<text x="${m.l - 10}" y="${y + 16}" text-anchor="end" style="fill:var(--ink);font:12px var(--body);font-weight:${r.strong ? 600 : 400}">${r.label}</text>`;
    segs.forEach(([k, name, col]) => {
      const v = r[k]; s += `<rect x="${X(x0)}" y="${y}" width="${Math.max(0, X(x0 + v) - X(x0))}" height="22" style="fill:${col};opacity:.85"><title>${name}: ${pc(v)}</title></rect>`;
      if (v > .07) s += `<text x="${X(x0 + v / 2)}" y="${y + 15}" text-anchor="middle" style="fill:#fff;font-weight:600">${Math.round(v * 100)}%</text>`;
      x0 += v;
    });
  });
  let lx = m.l; segs.forEach(([, name, col]) => { s += `<rect x="${lx}" y="${h - 16}" width="10" height="10" style="fill:${col}"/><text x="${lx + 14}" y="${h - 7}">${name}</text>`; lx += 120; });
  return s + "</svg>";
}

/* ---------------- GPU view ---------------- */
const SLIDERS = [
  { k: "price", label: "Rental price, year 1", step: .05, fmt: v => `$${v.toFixed(2)}/hr`, note: "Mar 2026 1-yr contract $2.35; on-demand median $3.47" },
  { k: "decline", label: "Price decline per year", step: .01, fmt: v => pc(v, 0) },
  { k: "util", label: "Utilization", step: .01, fmt: v => pc(v, 0) },
  { k: "life", label: "Economic life", step: 1, fmt: v => `${v} yrs`, note: "CoreWeave books 6 years; critics say 2–3" },
  { k: "capex", label: "Capex per GPU (all-in)", step: 1000, fmt: v => `$${(v / 1000).toFixed(0)}k` },
  { k: "wacc", label: "Discount rate (WACC)", step: .005, fmt: v => pc(v, 1) },
  { k: "elec", label: "Electricity", step: .002, fmt: v => `${(v * 100).toFixed(1)}¢/kWh`, note: "EIA US industrial, May 2026: 8.71¢" }
];
let gpuState = { ...DEFAULTS };

function buildSliders() {
  $("#sliders").innerHTML = SLIDERS.map(s => `<div class="ctl"><label for="s-${s.k}">${s.label}<output id="o-${s.k}"></output></label>
    <input type="range" id="s-${s.k}" min="${LIMITS[s.k][0]}" max="${LIMITS[s.k][1]}" step="${s.step}" value="${gpuState[s.k]}">${s.note ? `<small>${s.note}</small>` : ""}</div>`).join("");
  $("#sliders").style.display = "grid"; $("#sliders").style.gap = "14px";
  SLIDERS.forEach(s => $(`#s-${s.k}`).addEventListener("input", e => { gpuState[s.k] = Number(e.target.value); setScenarioPressed(null); renderGpu(); }));
}
function setScenarioPressed(name) { document.querySelectorAll("[data-sc]").forEach(b => b.setAttribute("aria-pressed", b.dataset.sc === name ? "true" : "false")); }
function applyScenario(name) {
  const { label, ...vals } = SCENARIOS[name];
  gpuState = { ...DEFAULTS, ...vals };
  SLIDERS.forEach(s => { $(`#s-${s.k}`).value = gpuState[s.k]; });
  setScenarioPressed(name); renderGpu();
}

function renderGpu() {
  const e = evaluate(gpuState);
  SLIDERS.forEach(s => { $(`#o-${s.k}`).textContent = s.fmt(e.inputs[s.k]); });
  const set = (id, txt, cls) => { const el = $(id); el.textContent = txt; el.className = cls || ""; };
  set("#k-npv", usd(Math.round(e.npv)), e.npv >= 0 ? "pos" : "neg");
  set("#k-npvc", usdM(e.npv * CLUSTER), e.npv >= 0 ? "pos" : "neg");
  set("#k-irr", e.irr === null ? "n/a" : pc(e.irr), e.irr !== null && e.irr >= e.inputs.wacc ? "pos" : "neg");
  set("#k-pay", e.payback === null ? "Not within life" : `${e.payback.toFixed(1)} yrs`);
  set("#k-be", e.breakevenPrice === null ? "n/a" : `$${e.breakevenPrice.toFixed(2)}/hr`);
  const clears = e.npv >= 0;
  $("#gpu-answer").innerHTML = `<b>${clears ? "Yes, but only just." : "No."}</b> At $${e.inputs.price.toFixed(2)}/hr falling ${pc(e.inputs.decline, 0)} a year, ${pc(e.inputs.util, 0)} utilization and a ${e.inputs.life}-year life, one H100 is worth <b class="num">${usd(Math.round(e.npv))}</b> after an ${pc(e.inputs.wacc, 1)} cost of capital (IRR ${e.irr === null ? "n/a" : pc(e.irr)}). It needs a starting price of at least <b class="num">$${(e.breakevenPrice ?? 0).toFixed(2)}/hr</b> to break even.`;
  const labels = ["Y0", ...e.rows.map(r => "Y" + r.year)];
  let cum = 0; const line = e.flows.map(f => (cum += f));
  $("#ch-fcf").innerHTML = barLineChart({ labels, bars: e.flows, line });
  $("#ch-tornado").innerHTML = tornadoChart(tornado(gpuState));
  const lives = [3, 4, 5, 6, 7], base = Math.round(e.inputs.price * 20) / 20;
  const prices = [-.6, -.3, 0, .3, .6, .9].map(d => Math.max(1, +(base + d).toFixed(2)));
  $("#ch-grid").innerHTML = gridChart(lifePriceGrid(gpuState, lives, prices), lives, prices, { life: e.inputs.life, price: base });
  const gap = e.ebitMargin6y - e.ebitMarginEcon;
  $("#acct-callout").innerHTML = `<b>Accounting versus economics</b><p>Booked with CoreWeave's 6-year depreciation, this GPU shows a year-1 operating margin of <b class="num">${pc(e.ebitMargin6y)}</b>. With the ${e.inputs.life}-year economic life used here, the margin is <b class="num">${pc(e.ebitMarginEcon)}</b>. ${Math.abs(gap) < .005 ? "The two lives match, so there is no gap." : gap > 0 ? `The ${pc(gap)} gap is profit that appears on paper only if the GPU really lasts six years.` : `A life longer than six years would make reported margins look lower than the economics.`}</p>`;
  const homeNpv = document.querySelector('[data-k="home-npv"]');
  if (homeNpv && !homeNpv.dataset.set) { const b = evaluate({}); homeNpv.textContent = (b.npv >= 0 ? "+" : "") + usd(Math.round(b.npv)); document.querySelector('[data-k="home-be"]').textContent = `$${b.breakevenPrice.toFixed(2)}`; homeNpv.dataset.set = 1; }
}

async function loadGpuData() {
  let d;
  try { d = await (await fetch("data/gpu.json")).json(); } catch { return; }
  const cw = d.coreweave;
  $("#ch-cw").innerHTML = cwChart(cw);
  const rows = cw.periods.map((p, i) => `<tr><td>${p}</td><td class="n">${usd(cw.revenue[i])}M</td><td class="n">${usd(cw.capex[i])}M</td><td class="n">${(cw.capex[i] / cw.revenue[i]).toFixed(1)}x</td></tr>`).join("");
  $("#cw-facts").innerHTML = `<tr><th>Period</th><th class="n">Revenue</th><th class="n">Capex</th><th class="n">Capex / rev</th></tr>${rows}` +
    cw.facts.map(f => `<tr><td colspan="3">${esc(f.label)}</td><td class="n">${esc(f.value)}</td></tr>`).join("");
  const srcName = k => d.sources[k] ? `<a href="${d.sources[k].url}" target="_blank" rel="noopener">${esc(d.sources[k].title.split(" (")[0])}</a>` : "";
  const assum = [
    ["Rental price, year 1", "$2.35/GPU-hr", srcName("semianalysis")], ["On-demand reference", "$3.47/GPU-hr", srcName("getdeploying")],
    ["Electricity", "8.7¢/kWh", srcName("eia")], ["Accounting life", "6 years", srcName("coreweave10k")],
    ["Capex per GPU", "$35k all-in", "Assumption"], ["Utilization", "85%", "Assumption"], ["Price decline", "15% a year", "Assumption"],
    ["Other opex", "$0.30 per available hour", "Assumption"], ["Power draw", "1.4 kW incl. cooling", "Assumption"], ["WACC / tax", "11% / 21%", "Assumption / US federal rate"]
  ];
  $("#assumptions").innerHTML = `<tr><th>Base-case input</th><th>Value</th><th>Source</th></tr>` + assum.map(a => `<tr><td>${a[0]}</td><td class="mono">${a[1]}</td><td>${a[2]}</td></tr>`).join("");
  $("#gpu-sources").innerHTML = Object.values(d.sources).map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("");
}

/* ---------------- Memo view ---------------- */
let memoState = { ...MEMO_DEFAULTS };
const MEMO_CTL = [
  { k: "mau", label: "Monthly active users", min: 5, max: 200, step: 1, fmt: v => `${v}M` },
  { k: "payers", label: "Share of users who pay", min: .002, max: .05, step: .001, fmt: v => pc(v, 1), note: "Telegram Premium: about 1–1.5%" },
  { k: "arppu", label: "Spend per payer / month", min: .5, max: 10, step: .25, fmt: v => `$${v.toFixed(2)}` },
  { k: "iosShare", label: "Payments started on iOS", min: 0, max: 1, step: .05, fmt: v => pc(v, 0), note: "Assumption. Replace with the app's own data." },
  { k: "take", label: "Platform cut after fees", min: 0, max: .5, step: .05, fmt: v => pc(v, 0) }
];
function buildMemo() {
  const opts = sel => Object.entries(ROUTES).map(([k, r]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${r.label} (${pc(r.fee, r.fee < .02 ? 1 : 0)})</option>`).join("");
  $("#memo-form").innerHTML = `<span class="eyebrow">Inputs</span>` + MEMO_CTL.map(s => `<div class="ctl"><label for="m-${s.k}">${s.label}<output id="mo-${s.k}"></output></label><input type="range" id="m-${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${memoState[s.k]}">${s.note ? `<small>${s.note}</small>` : ""}</div>`).join("") +
    `<div class="ctl"><label for="m-iosRoute">iOS payment route</label><select id="m-iosRoute">${opts(memoState.iosRoute)}</select></div>
     <div class="ctl"><label for="m-otherRoute">Android & web route</label><select id="m-otherRoute">${opts(memoState.otherRoute)}</select></div>`;
  MEMO_CTL.forEach(s => $(`#m-${s.k}`).addEventListener("input", e => { memoState[s.k] = Number(e.target.value); renderMemo(); }));
  ["iosRoute", "otherRoute"].forEach(k => $(`#m-${k}`).addEventListener("change", e => { memoState[k] = e.target.value; renderMemo(); }));
  $("#tg-table").innerHTML = `<tr><th>Data point</th><th>Value</th><th>Reliability</th></tr>` + TELEGRAM_FACTS.map(f => `<tr><td>${esc(f.metric)}</td><td>${esc(f.value)} <a href="${f.url}" target="_blank" rel="noopener" class="muted" style="font-size:12px">[${esc(f.source)}]</a></td><td>${esc(f.grade)}</td></tr>`).join("");
  const srcs = [...new Map(TELEGRAM_FACTS.map(f => [f.url, f])).values()].map(f => `<li><a href="${f.url}" target="_blank" rel="noopener">${esc(f.source)}</a></li>`).join("") +
    `<li><a href="https://thenextweb.com/news/supreme-court-apple-epic-contempt-stay-denial" target="_blank" rel="noopener">The Next Web, Epic v. Apple commission ruling (May 2026)</a></li><li><a href="https://www.macrumors.com/2026/06/11/apple-fights-back-against-epic/" target="_blank" rel="noopener">MacRumors, Apple's Supreme Court appeal (Jun 2026)</a></li>`;
  $("#memo-sources").innerHTML = srcs;
}
function renderMemo() {
  const a = computeRoutes(memoState);
  MEMO_CTL.forEach(s => { $(`#mo-${s.k}`).textContent = s.fmt(a.inputs[s.k]); });
  $("#m-gross").textContent = usdM(a.gross);
  $("#m-fee").textContent = pc(a.effectiveFee, 1);
  $("#m-plat").textContent = usdM(a.annualPlatform);
  const all = computeRoutes({ ...memoState, iosRoute: "iap", otherRoute: "iap" });
  const none = computeRoutes({ ...memoState, iosRoute: "link", otherRoute: "wallet" });
  const row = (label, x, strong) => ({ label, strong, fee: x.effectiveFee, platform: x.platformShare, creators: x.creatorShare });
  $("#ch-routes").innerHTML = routeChart([row("All app stores", all), row("Your mix", a, true), row("No app stores", none)]);
  if (JSON.stringify(memoState) === JSON.stringify(MEMO_DEFAULTS)) return;
  $("#memo-headline").textContent = `With these inputs, fans spend about ${usdM(a.gross)} a month. Your route mix costs ${pc(a.effectiveFee)} in payment fees instead of 30% if everything went through app stores, leaving about ${usdM(a.savedVsAllIap)} more each month for creators and the platform.`;
}

/* ---------------- optional files ----------------
   Add assets/portrait.jpg and resume.pdf to the repo and they show up; nothing else to edit. */
function optionalFiles() {
  const img = new Image();
  img.alt = "Portrait of Tom Phan";
  img.onload = () => { const p = $(".portrait"); p.textContent = ""; p.removeAttribute("aria-hidden"); p.appendChild(img); };
  img.src = "assets/portrait.jpg";
  fetch("resume.pdf", { method: "HEAD" })
    .then(r => { if (r.ok && (r.headers.get("content-type") || "").includes("pdf")) document.querySelectorAll("[data-resume]").forEach(a => { a.hidden = false; }); })
    .catch(() => {});
}

/* ---------------- boot ---------------- */
buildSliders();
document.querySelectorAll("[data-sc]").forEach(b => b.addEventListener("click", () => applyScenario(b.dataset.sc)));
$("#gpu-reset").addEventListener("click", () => applyScenario("base"));
renderGpu(); loadGpuData();
buildMemo(); renderMemo();
initCopilot({ barLineChart, tornadoChart, routeChart });
optionalFiles();
route();
