// tomphan. — hand-rolled SVG charts. Colors come from CSS tokens (--s1..--s5, --pos, --neg, --line, --ink, --muted),
// so every chart follows the page theme. Marks carry data-tip for the shared hover tooltip.
import { esc } from "./fmt.js";

const niceStep = range => { const raw = range / 5, p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
export function ticks(lo, hi) { const st = niceStep(hi - lo || 1); const out = []; for (let v = Math.floor(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(6)); if (out[out.length - 1] < hi) out.push(+(out[out.length - 1] + st).toFixed(6)); return out; }
const kfmt = v => (v < 0 ? "−" : "") + "$" + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(Math.abs(v) % 1000 === 0 ? 0 : 1) + "k" : Math.abs(v).toFixed(Math.abs(v) < 10 && v % 1 ? 2 : 0));
const tip = s => `data-tip="${esc(s)}"`;
const grid = (x1, x2, y, zero) => `<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" class="${zero ? "ax0" : "gl"}"/>`;

/* Multi-series line chart with end labels and a hover crosshair (wired by attachLineHover). */
export function lineChart({ series, w = 680, h = 300, yFmt = v => `$${v.toFixed(2)}`, id = "lc" }) {
  const m = { l: 48, r: 92, t: 12, b: 28 };
  const all = series.flatMap(s => s.points.map(p => p[1]).filter(v => v !== null));
  const tk = ticks(0, Math.max(...all) * 1.05); const y1 = tk[tk.length - 1];
  const dates = series[0].points.map(p => p[0]);
  const X = i => m.l + (w - m.l - m.r) * (i / (dates.length - 1));
  const Y = v => m.t + (h - m.t - m.b) * (1 - v / y1);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Weekly rental prices by GPU model" data-chart="${id}">`;
  tk.forEach(t => { s += grid(m.l, w - m.r, Y(t), t === 0) + `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${yFmt(t)}</text>`; });
  const months = []; dates.forEach((d, i) => { const mo = d.slice(0, 7); if (!months.length || months[months.length - 1].mo !== mo) months.push({ mo, i }); });
  months.filter((_, k) => k % 2 === 0).forEach(({ mo, i }) => { s += `<text x="${X(i)}" y="${h - 8}" text-anchor="middle">${new Date(mo + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })}</text>`; });
  // end labels, nudged apart
  const lastOf = sr => { for (let i = sr.points.length - 1; i >= 0; i--) if (sr.points[i][1] !== null) return [i, sr.points[i][1]]; return [0, 0]; };
  const ends = series.map((sr, k) => ({ k, y: Y(lastOf(sr)[1]), label: `${sr.label} ${yFmt(lastOf(sr)[1])}` })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  series.forEach((sr, k) => {
    const pts = sr.points.map((p, i) => p[1] === null ? null : `${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).filter(Boolean).join(" ");
    const [li, lv] = lastOf(sr);
    s += `<polyline points="${pts}" class="ln" style="stroke:var(--s${k + 1})${sr.strong ? ";stroke-width:2.8" : ""}"/>`;
    s += `<circle cx="${X(li)}" cy="${Y(lv)}" r="4" class="dot" style="fill:var(--s${k + 1})"/>`;
  });
  ends.forEach(e => { s += `<text x="${w - m.r + 8}" y="${e.y + 4}" class="lbl-strong">${esc(e.label)}</text>`; });
  s += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${h - m.b}" visibility="hidden"/>`;
  s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${w - m.l - m.r}" height="${h - m.t - m.b}" fill="transparent"/>`;
  return { svg: s + "</svg>", meta: { m, w, h, dates, series } };
}

export function attachLineHover(host, meta, fmt) {
  const svg = host.querySelector("svg"); if (!svg) return;
  const xh = svg.querySelector(".xh"), hit = svg.querySelector(".hit"), tipEl = document.getElementById("tip");
  const { m, w, dates, series } = meta;
  const move = e => {
    const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) * (w / r.width);
    const i = Math.max(0, Math.min(dates.length - 1, Math.round((sx - m.l) / (w - m.l - m.r) * (dates.length - 1))));
    const x = m.l + (w - m.l - m.r) * (i / (dates.length - 1));
    xh.setAttribute("x1", x); xh.setAttribute("x2", x); xh.setAttribute("visibility", "visible");
    tipEl.innerHTML = `<b>Week of ${esc(dates[i])}</b>` + series.map((sr, k) => `<div><i style="background:var(--s${k + 1})"></i>${esc(sr.label)} <span>${sr.points[i][1] === null ? "–" : fmt(sr.points[i][1])}</span></div>`).join("");
    showTip(e.clientX, e.clientY);
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerleave", () => { xh.setAttribute("visibility", "hidden"); hideTip(); });
}

/* Price ladder: log-scale scatter of rent vs age with the fitted decline line. */
export function ladderChart(ladder, w = 680, h = 300) {
  const m = { l: 56, r: 20, t: 16, b: 40 };
  const pts = ladder.points; const maxAge = Math.ceil(Math.max(...pts.map(p => p.age)) + 0.5);
  const yTicks = [1, 2, 4, 8, 16].filter(v => v <= Math.max(...pts.map(p => p.price)) * 1.6 && v >= 1);
  const lo = Math.log(0.9), hi = Math.log(Math.max(...yTicks, ...pts.map(p => p.price)) * 1.15);
  const X = a => m.l + (w - m.l - m.r) * (a / maxAge), Y = p => m.t + (h - m.t - m.b) * (1 - (Math.log(p) - lo) / (hi - lo));
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Rent by years on the market">`;
  yTicks.forEach(t => { s += grid(m.l, w - m.r, Y(t)) + `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">$${t}</text>`; });
  for (let a = 0; a <= maxAge; a++) s += `<text x="${X(a)}" y="${h - 20}" text-anchor="middle">${a}</text>`;
  s += `<text x="${(m.l + w - m.r) / 2}" y="${h - 4}" text-anchor="middle">Years since volume availability</text>`;
  const fit = a => Math.exp(ladder.intercept + ladder.slope * a);
  s += `<line x1="${X(0.3)}" y1="${Y(fit(0.3))}" x2="${X(maxAge - 0.2)}" y2="${Y(fit(maxAge - 0.2))}" class="fit"/>`;
  pts.forEach(p => {
    s += `<circle cx="${X(p.age)}" cy="${Y(p.price)}" r="6" class="dot" style="fill:var(--s1)" ${tip(`${p.label}: $${p.price.toFixed(2)}/hr, ${p.age} years on market`)}/>`;
    const right = p.age > maxAge - 1.5;
    s += `<text x="${X(p.age) + (right ? -10 : 10)}" y="${Y(p.price) - 9}" text-anchor="${right ? "end" : "start"}" class="lbl-strong">${esc(p.label)} $${p.price.toFixed(2)}</text>`;
  });
  s += `<text x="${w - m.r}" y="${m.t + 4}" text-anchor="end" class="note">Dashed line: fitted −${Math.round(ladder.annualDecline * 100)}% per year · R² ${ladder.r2}</text>`;
  return s + "</svg>";
}

/* Horizontal bars, one highlighted. rows: {label, value, sub?, strong?, tip?} */
export function hbars(rows, { w = 680, fmt = v => `$${v.toFixed(2)}`, max = null, labelW = 230 } = {}) {
  const rh = 34, m = { l: labelW, r: 70, t: 4, b: 4 }, h = m.t + m.b + rh * rows.length;
  const top = max ?? Math.max(...rows.map(r => r.value)) * 1.02;
  const X = v => m.l + (w - m.l - m.r) * (v / top);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Bar chart">`;
  rows.forEach((r, i) => {
    const y = m.t + i * rh + 6;
    s += `<text x="${m.l - 10}" y="${y + 13}" text-anchor="end" class="${r.strong ? "lbl-strong" : "lbl"}">${esc(r.label)}</text>`;
    if (r.sub) s += `<text x="${m.l - 10}" y="${y + 26}" text-anchor="end" class="note">${esc(r.sub)}</text>`;
    s += `<rect x="${m.l}" y="${y}" width="${Math.max(2, X(r.value) - m.l)}" height="18" rx="4" class="bar${r.strong ? " strong" : ""}" ${tip(r.tip || `${r.label}: ${fmt(r.value)}`)}/>`;
    s += `<text x="${X(r.value) + 6}" y="${y + 13}" class="${r.strong ? "lbl-strong" : "lbl"}">${fmt(r.value)}</text>`;
  });
  return s + "</svg>";
}

/* Vertical bars (+ optional cumulative line). Negative bars use --neg. */
export function barLineChart({ labels, bars, line, w = 640, h = 260, tips }) {
  const m = { l: 56, r: 16, t: 18, b: 30 };
  const all = [...bars, ...(line || []), 0];
  const tk = ticks(Math.min(...all), Math.max(...all)); const y0 = tk[0], y1 = tk[tk.length - 1];
  const Y = v => m.t + (h - m.t - m.b) * (1 - (v - y0) / (y1 - y0 || 1));
  const bw = (w - m.l - m.r) / labels.length;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Cash flow chart">`;
  tk.forEach(t => { s += grid(m.l, w - m.r, Y(t), t === 0) + `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${kfmt(t)}</text>`; });
  bars.forEach((v, i) => {
    const x = m.l + i * bw + bw * .22, top = Y(Math.max(v, 0)), bot = Y(Math.min(v, 0));
    s += `<rect x="${x}" y="${top}" width="${bw * .56}" height="${Math.max(1, bot - top)}" rx="4" style="fill:var(${v < 0 ? "--c-neg" : "--c-pos"})" ${tip(tips ? tips[i] : `${labels[i]}: ${kfmt(v)}`)}/>`;
    s += `<text x="${x + bw * .28}" y="${h - 10}" text-anchor="middle">${esc(labels[i])}</text>`;
  });
  if (line) {
    const pts = line.map((v, i) => `${m.l + i * bw + bw / 2},${Y(v)}`).join(" ");
    s += `<polyline points="${pts}" class="ln" style="stroke:var(--ink);stroke-width:1.6"/>`;
    line.forEach((v, i) => { s += `<circle cx="${m.l + i * bw + bw / 2}" cy="${Y(v)}" r="${i === line.length - 1 ? 4.5 : 3}" style="fill:var(--ink)" ${tip(`Cumulative after ${labels[i]}: ${kfmt(Math.round(v))}`)}/>`; });
    const last = line[line.length - 1];
    s += `<text class="lbl-strong" x="${m.l + (line.length - 1) * bw + bw / 2}" y="${Y(last) + (last < 0 ? 18 : -10)}" text-anchor="middle">${kfmt(Math.round(last))}</text>`;
  }
  return s + "</svg>";
}

export function tornadoChart(t, w = 680) {
  const rowH = 34, m = { l: 236, r: 76, t: 22, b: 8 };
  const h = m.t + m.b + rowH * t.bars.length;
  const span = Math.max(...t.bars.flatMap(b => [Math.abs(b.low - t.baseNpv), Math.abs(b.high - t.baseNpv)])) * 1.05 || 1;
  const X = v => m.l + (w - m.l - m.r) * ((v - t.baseNpv) / (2 * span) + .5);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="What moves NPV">`;
  s += `<text x="${X(t.baseNpv)}" y="12" text-anchor="middle" class="lbl-strong">Current NPV ${kfmt(Math.round(t.baseNpv))}</text>`;
  t.bars.forEach((b, i) => {
    const y = m.t + i * rowH + 6;
    const lo = Math.min(b.low, b.high), hi = Math.max(b.low, b.high);
    const loLab = b.low <= b.high ? b.lowLabel : b.highLabel, hiLab = b.low <= b.high ? b.highLabel : b.lowLabel;
    s += `<text x="150" y="${y + 14}" text-anchor="end" class="lbl">${esc(b.label)}</text>`;
    if (lo < t.baseNpv) s += `<rect x="${X(lo)}" y="${y}" width="${Math.max(1, X(Math.min(hi, t.baseNpv)) - X(lo))}" height="20" rx="4" style="fill:var(--c-neg)" ${tip(`${b.label} at ${loLab}: NPV ${kfmt(Math.round(lo))}`)}/>`;
    if (hi > t.baseNpv) s += `<rect x="${X(Math.max(lo, t.baseNpv))}" y="${y}" width="${Math.max(1, X(hi) - X(Math.max(lo, t.baseNpv)))}" height="20" rx="4" style="fill:var(--c-pos)" ${tip(`${b.label} at ${hiLab}: NPV ${kfmt(Math.round(hi))}`)}/>`;
    s += `<text x="${X(lo) - 5}" y="${y + 14}" text-anchor="end">${esc(loLab)}</text><text x="${X(hi) + 5}" y="${y + 14}">${esc(hiLab)}</text>`;
  });
  s += `<line x1="${X(t.baseNpv)}" x2="${X(t.baseNpv)}" y1="${m.t}" y2="${h - m.b}" class="ax0"/>`;
  return s + "</svg>";
}

/* NPV heat grid: rows = capex, columns = contract lock years. Diverging: --pos above zero, --neg below. */
export function lockCapexChart({ locks, capexes, grid: g }, cur, w = 680) {
  const m = { l: 92, r: 10, t: 40, b: 8 }, cw = (w - m.l - m.r) / locks.length, ch = 36;
  const h = m.t + m.b + ch * capexes.length;
  const mx = Math.max(...g.flat().map(Math.abs)) || 1;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="NPV by contract length and capex">`;
  s += `<text x="${m.l}" y="12" class="lbl-strong">Years the year-1 rent is locked by contract →</text>`;
  locks.forEach((L, j) => { s += `<text x="${m.l + j * cw + cw / 2}" y="30" text-anchor="middle">${L === 0 ? "none" : L + " yr"}</text>`; });
  capexes.forEach((c, i) => {
    s += `<text x="${m.l - 10}" y="${m.t + i * ch + 22}" text-anchor="end">$${c / 1000}k capex</text>`;
    locks.forEach((L, j) => {
      const v = g[i][j], a = .12 + .78 * Math.min(1, Math.abs(v) / mx);
      const isCur = cur.lock === L && cur.capex === c;
      s += `<rect x="${m.l + j * cw + 2}" y="${m.t + i * ch + 2}" width="${cw - 4}" height="${ch - 4}" rx="4" style="fill:var(${v >= 0 ? "--c-pos" : "--c-neg"});fill-opacity:${a.toFixed(2)}${isCur ? ";stroke:var(--ink);stroke-width:2" : ""}" ${tip(`$${c / 1000}k capex, ${L}-year lock: NPV ${kfmt(Math.round(v))}`)}/>`;
      s += `<text x="${m.l + j * cw + cw / 2}" y="${m.t + i * ch + 22}" text-anchor="middle" class="${isCur ? "lbl-strong" : "lbl"}">${(v / 1000).toFixed(1)}k</text>`;
    });
  });
  return s + "</svg>";
}

/* Small vertical bar chart (CoreWeave revenue). */
export function colBars(rows, { w = 420, h = 200, fmt = v => v } = {}) {
  const m = { l: 10, r: 10, t: 22, b: 26 }, bw = (w - m.l - m.r) / rows.length, top = Math.max(...rows.map(r => r.value)) * 1.08;
  const Y = v => m.t + (h - m.t - m.b) * (1 - v / top);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Revenue by period">`;
  s += grid(m.l, w - m.r, Y(0), true);
  rows.forEach((r, i) => {
    const x = m.l + i * bw + bw * .2;
    s += `<rect x="${x}" y="${Y(r.value)}" width="${bw * .6}" height="${Y(0) - Y(r.value)}" rx="4" class="bar${r.strong ? " strong" : ""}" ${tip(`${r.label}: ${fmt(r.value)}`)}/>`;
    s += `<text x="${x + bw * .3}" y="${Y(r.value) - 6}" text-anchor="middle" class="lbl-strong">${fmt(r.value)}</text>`;
    s += `<text x="${x + bw * .3}" y="${h - 8}" text-anchor="middle">${esc(r.label)}</text>`;
  });
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
