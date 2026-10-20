// tomphan. — hand-rolled SVG charts. Colors come from CSS tokens so every chart follows the page theme.
// Marks carry data-tip for the shared hover tooltip (multi-line with \n).
import { esc } from "./fmt.js";

const niceStep = range => { const raw = range / 5, p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
export function ticks(lo, hi) { const st = niceStep(hi - lo || 1); const out = []; for (let v = Math.floor(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(6)); if (out[out.length - 1] < hi) out.push(+(out[out.length - 1] + st).toFixed(6)); return out; }
const tip = s => `data-tip="${esc(s)}"`;
const gl = (x1, x2, y, zero) => `<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" class="${zero ? "ax0" : "gl"}"/>`;
const n0 = v => Math.round(v).toLocaleString("en-US");

/* Line chart over categorical x (quarters, years). series: [{label, values:[], strong}], events: [{i, n, label}] */
export function lineChart({ labels, series, w = 720, h = 320, yFmt = n0, yMin = null, yMax = null, every = 1, xFmt = l => l, highlightFrom = null, events = [], endFmt = null, aria = "Line chart" }) {
  const m = { l: 60, r: 150, t: events.length ? 34 : 14, b: 30 };
  const all = series.flatMap(s => s.values.filter(v => v !== null && v !== undefined));
  const tk = ticks(yMin ?? Math.min(...all), yMax ?? Math.max(...all)); const y0 = tk[0], y1 = tk[tk.length - 1];
  const X = i => m.l + (w - m.l - m.r) * (i / (labels.length - 1));
  const Y = v => m.t + (h - m.t - m.b) * (1 - (v - y0) / (y1 - y0));
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">`;
  tk.forEach(t => { s += gl(m.l, w - m.r, Y(t), t === y0 && y0 === 0) + `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${yFmt(t)}</text>`; });
  labels.forEach((l, i) => { if (i % every === 0) s += `<text x="${X(i)}" y="${h - 9}" text-anchor="middle">${esc(xFmt(l))}</text>`; });
  events.forEach(e => {
    s += `<line x1="${X(e.i)}" x2="${X(e.i)}" y1="${m.t - 10}" y2="${h - m.b}" class="ev"/>`;
    s += `<circle cx="${X(e.i)}" cy="${m.t - 20}" r="9" class="ev-c" ${tip(e.label)}/><text x="${X(e.i)}" y="${m.t - 16}" text-anchor="middle" class="lbl-strong">${e.n}</text>`;
  });
  const ends = [];
  series.forEach((sr, k) => {
    const col = sr.color || (sr.strong ? "var(--s1)" : "var(--chart-2)");
    const pts = sr.values.map((v, i) => v === null || v === undefined ? null : [X(i), Y(v)]).filter(Boolean);
    s += `<polyline points="${pts.map(p => p.join(",")).join(" ")}" class="ln" style="stroke:${col}"/>`;
    if (highlightFrom !== null && sr.strong) {
      const hp = sr.values.map((v, i) => i >= highlightFrom && v !== null ? [X(i), Y(v)] : null).filter(Boolean);
      s += `<polyline points="${hp.map(p => p.join(",")).join(" ")}" class="ln" style="stroke:var(--s1);stroke-width:3"/>`;
    }
    sr.values.forEach((v, i) => { if (v === null || v === undefined) return; const hot = highlightFrom === null ? sr.strong : sr.strong && i >= highlightFrom; s += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.2" class="dot" style="fill:${hot ? "var(--s1)" : col}" ${tip(`${sr.label}\n${labels[i]}: ${yFmt(v)}${sr.tipExtra ? sr.tipExtra(i) : ""}`)}/>`; });
    let li = sr.values.length - 1; while (li > 0 && (sr.values[li] === null || sr.values[li] === undefined)) li--;
    ends.push({ y: Y(sr.values[li]), x: X(li), text: endFmt ? endFmt(sr, sr.values[li]) : `${sr.label} ${yFmt(sr.values[li])}`, strong: sr.strong });
  });
  ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
  ends.forEach(e => { s += `<text x="${e.x + 10}" y="${e.y + 4}" class="${e.strong ? "lbl-strong" : "lbl"}">${esc(e.text)}</text>`; });
  return s + "</svg>";
}

/* Horizontal bars that can be negative, with an optional reference line. rows: {label, sub, value, strong, tip} */
export function divBars(rows, { w = 720, fmt = v => `${(v * 100).toFixed(1)}%`, ref = null, refLabel = "", labelW = 200, aria = "Bar chart" } = {}) {
  const rh = 38, m = { l: labelW, r: 70, t: ref !== null ? 26 : 6, b: 6 }, h = m.t + m.b + rh * rows.length;
  const lo = Math.min(0, ...rows.map(r => r.value), ref ?? 0), hi = Math.max(0, ...rows.map(r => r.value), ref ?? 0);
  const X = v => m.l + (w - m.l - m.r) * ((v - lo) / (hi - lo || 1));
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">`;
  rows.forEach((r, i) => {
    const y = m.t + i * rh + 8;
    s += `<text x="0" y="${y + 13}" class="${r.strong ? "lbl-strong" : "lbl"}">${esc(r.label)}</text>`;
    if (r.sub) s += `<text x="${labelW - 12}" y="${y + 13}" text-anchor="end" class="note">${esc(r.sub)}</text>`;
    const x0 = X(Math.min(0, r.value)), x1 = X(Math.max(0, r.value));
    s += `<rect x="${x0}" y="${y}" width="${Math.max(2, x1 - x0)}" height="20" rx="4" class="bar${r.strong ? " strong" : ""}" ${tip(r.tip || `${r.label}: ${fmt(r.value)}`)}/>`;
    s += `<text x="${r.value < 0 ? X(0) + 8 : x1 + 6}" y="${y + 14}" class="${r.strong ? "lbl-strong" : "lbl"}">${fmt(r.value)}</text>`;
  });
  s += `<line x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${h - m.b}" class="ax0"/>`;
  if (ref !== null) s += `<line x1="${X(ref)}" x2="${X(ref)}" y1="${m.t - 8}" y2="${h - m.b}" class="ev"/><text x="${X(ref)}" y="${m.t - 12}" text-anchor="middle" class="note">${esc(refLabel)}</text>`;
  return s + "</svg>";
}

/* Vertical bars with value labels; optional line on a second scale. rows: {label, value, strong, tip}; line: {values, fmt, label} */
export function colBars(rows, { w = 720, h = 280, fmt = n0, line = null, aria = "Column chart", y0zero = true } = {}) {
  const m = { l: 16, r: 16, t: 26, b: 30 };
  const top = Math.max(...rows.map(r => r.value)) * 1.12, bw = (w - m.l - m.r) / rows.length;
  const Y = v => m.t + (h - m.t - m.b) * (1 - v / top);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">` + gl(m.l, w - m.r, Y(0), true);
  rows.forEach((r, i) => {
    const x = m.l + i * bw + bw * .18;
    s += `<rect x="${x}" y="${Y(r.value)}" width="${bw * .64}" height="${Y(0) - Y(r.value)}" rx="4" class="bar${r.strong ? " strong" : ""}" ${tip(r.tip || `${r.label}: ${fmt(r.value)}`)}/>`;
    if (!line) s += `<text x="${x + bw * .32}" y="${Y(r.value) - 7}" text-anchor="middle" class="${r.strong ? "lbl-strong" : "lbl"}">${fmt(r.value)}</text>`;
    s += `<text x="${x + bw * .32}" y="${h - 9}" text-anchor="middle">${esc(r.label)}</text>`;
  });
  if (line) {
    const lv = line.values, lt = Math.max(...lv) * 1.25, lb = Math.min(...lv) * .6;
    const LY = v => m.t + 10 + (h - m.t - m.b - 40) * (1 - (v - lb) / (lt - lb));
    const pts = lv.map((v, i) => `${m.l + i * bw + bw / 2},${LY(v)}`).join(" ");
    s += `<polyline points="${pts}" class="ln" style="stroke:var(--s2)"/>`;
    lv.forEach((v, i) => { s += `<circle cx="${m.l + i * bw + bw / 2}" cy="${LY(v)}" r="4" class="dot" style="fill:var(--s2)" ${tip(`${line.label}, ${rows[i].label}: ${line.fmt(v)}`)}/><text x="${m.l + i * bw + bw / 2}" y="${LY(v) - 10}" text-anchor="middle" class="lbl-strong" style="fill:var(--s2)">${line.fmt(v)}</text>`; });
    rows.forEach((r, i) => { s += `<text x="${m.l + i * bw + bw / 2}" y="${Y(r.value) + 16}" text-anchor="middle" class="lbl-in">${fmt(r.value)}</text>`; });
  }
  return s + "</svg>";
}

/* Grouped vertical bars: groups [{label, values:[...]}], keys [{label, color}] */
export function groupBars(groups, keys, { w = 720, h = 280, fmt = n0, aria = "Grouped bars" } = {}) {
  const m = { l: 16, r: 16, t: 26, b: 30 };
  const top = Math.max(...groups.flatMap(g => g.values)) * 1.15, gw = (w - m.l - m.r) / groups.length, bw = gw * .7 / keys.length;
  const Y = v => m.t + (h - m.t - m.b) * (1 - Math.max(0, v) / top);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">` + gl(m.l, w - m.r, Y(0), true);
  groups.forEach((g, i) => {
    g.values.forEach((v, k) => {
      const x = m.l + i * gw + gw * .15 + k * bw;
      s += `<rect x="${x + 1}" y="${Y(v)}" width="${bw - 2}" height="${Math.max(1, Y(0) - Y(v))}" rx="3" style="fill:${keys[k].color}" ${tip(`${g.label}, ${keys[k].label}: ${fmt(v)}`)}/>`;
      s += `<text x="${x + bw / 2}" y="${Y(v) - 6}" text-anchor="middle" class="lbl" style="font-size:10.5px">${fmt(v)}</text>`;
    });
    s += `<text x="${m.l + i * gw + gw / 2}" y="${h - 9}" text-anchor="middle">${esc(g.label)}</text>`;
  });
  return s + "</svg>";
}

/* Profit by prescriptions per day, with break-even and current markers */
export function profitCurve({ cur, gpRx, fixed, days, w = 720, h = 280 }) {
  const m = { l: 64, r: 20, t: 18, b: 36 }, xs = [60, 300];
  const P = rx => rx * days * gpRx - fixed;
  const lo = Math.min(P(xs[0]), P(xs[1])), hi = Math.max(P(xs[0]), P(xs[1]));
  const tk = ticks(lo, hi); const y0 = tk[0], y1 = tk[tk.length - 1];
  const X = rx => m.l + (w - m.l - m.r) * ((rx - xs[0]) / (xs[1] - xs[0])), Y = v => m.t + (h - m.t - m.b) * (1 - (v - y0) / (y1 - y0));
  const k = v => (v < 0 ? "−$" : "$") + Math.abs(Math.round(v / 1000)).toLocaleString("en-US") + "k";
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Profit by prescriptions per day">`;
  tk.forEach(t => { s += gl(m.l, w - m.r, Y(t), t === 0) + `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${k(t)}</text>`; });
  for (let rx = 60; rx <= 300; rx += 40) s += `<text x="${X(rx)}" y="${h - 16}" text-anchor="middle">${rx}</text>`;
  s += `<text x="${(m.l + w - m.r) / 2}" y="${h - 2}" text-anchor="middle">Prescriptions per day</text>`;
  s += `<line x1="${X(xs[0])}" y1="${Y(P(xs[0]))}" x2="${X(xs[1])}" y2="${Y(P(xs[1]))}" class="ln" style="stroke:var(--s1)"/>`;
  const be = fixed / gpRx / days;
  if (be > xs[0] && be < xs[1]) s += `<line x1="${X(be)}" x2="${X(be)}" y1="${m.t}" y2="${h - m.b}" class="ev"/><text x="${X(be) + 6}" y="${m.t + 12}" class="lbl-strong">Break-even ${Math.round(be)} a day</text>`;
  if (cur >= xs[0] && cur <= xs[1]) s += `<circle cx="${X(cur)}" cy="${Y(P(cur))}" r="6" class="dot" style="fill:var(${P(cur) >= 0 ? "--c-pos" : "--c-neg"})" ${tip(`${cur} a day: profit ${k(P(cur))} a year`)}/><text x="${X(cur) + 10}" y="${Y(P(cur)) + 18}" class="lbl-strong">${cur} a day: ${k(P(cur))}</text>`;
  return s + "</svg>";
}

/* Shared tooltip for any [data-tip] mark */
export function showTip(x, y) { const t = document.getElementById("tip"); t.hidden = false; const r = t.getBoundingClientRect(); t.style.left = Math.min(window.innerWidth - r.width - 8, x + 14) + "px"; t.style.top = Math.max(8, y - r.height - 12) + "px"; }
export function hideTip() { const t = document.getElementById("tip"); if (t) t.hidden = true; }
export function initTips() {
  document.addEventListener("pointerover", e => { const el = e.target.closest?.("[data-tip]"); if (!el) return; document.getElementById("tip").textContent = el.getAttribute("data-tip"); showTip(e.clientX, e.clientY); });
  document.addEventListener("pointermove", e => { if (e.target.closest?.("[data-tip]")) showTip(e.clientX, e.clientY); });
  document.addEventListener("pointerout", e => { if (e.target.closest?.("[data-tip]")) hideTip(); });
  window.addEventListener("scroll", hideTip, { passive: true });
}
