// tomphan. — county map of Weis's seven states. Shapes are pre-projected (case/build/geo.mjs); colors use theme tokens.
import { esc } from "./fmt.js";

const pct = v => v === null || v === undefined ? "n/a" : `${v.toFixed(1)}%`;
export const METRICS = {
  per10k: { label: "Stand-alone pharmacies per 10,000 residents", short: "Pharmacies per 10,000", fewerIsWorse: true,
    val: c => c.per10k, fmt: v => v === null ? "none" : v.toFixed(1), bins: [0.0001, 1.2, 1.5, 1.9, 2.5], legend: ["None", "Under 1.2", "1.2–1.5", "1.5–1.9", "1.9–2.5", "2.5+"] },
  change: { label: "Change in stand-alone pharmacies since Q3 2023", short: "Change since Q3 2023", diverging: true,
    val: c => c.ph_base ? (c.ph_latest / c.ph_base - 1) * 100 : null, fmt: v => v === null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`, bins: [-30, -20, -10, -0.01, 0.01], legend: ["−30% or more", "−20 to −30%", "−10 to −20%", "0 to −10%", "No change", "Gain"] },
  pct65: { label: "Share of residents aged 65+", short: "Aged 65+", val: c => c.pct65, fmt: pct, bins: [17, 19, 21, 23, 25], legend: ["Under 17%", "17–19%", "19–21%", "21–23%", "23–25%", "25%+"] },
  noveh: { label: "Households with no car", short: "No car", val: c => c.noveh, fmt: pct, bins: [4, 6, 8, 10, 15], legend: ["Under 4%", "4–6%", "6–8%", "8–10%", "10–15%", "15%+"] },
  lacktrpt: { label: "Adults lacking reliable transport", short: "No reliable transport", val: c => c.lacktrpt, fmt: pct, bins: [6.5, 7.5, 8.5, 9.5, 11], legend: ["Under 6.5%", "6.5–7.5%", "7.5–8.5%", "8.5–9.5%", "9.5–11%", "11%+"] },
  diabetes: { label: "Adults with diabetes", short: "Diabetes", val: c => c.diabetes, fmt: pct, bins: [11, 12.5, 14, 15.5, 17], legend: ["Under 11%", "11–12.5%", "12.5–14%", "14–15.5%", "15.5–17%", "17%+"] }
};

function binOf(m, v) { if (v === null || v === undefined) return -1; let b = 0; for (const t of m.bins) if (v >= t) b++; return b; }
function fill(m, b) {
  if (b < 0) return "var(--surface-2)";
  if (m.diverging) { // 0..3 losses (strong to weak), 4 no change, 5 gain
    if (b === 4) return "var(--surface-2)";
    if (b === 5) return "color-mix(in srgb, var(--c-pos) 45%, var(--surface))";
    return `color-mix(in srgb, var(--c-neg) ${[90, 65, 42, 20][b]}%, var(--surface))`;
  }
  if (m.fewerIsWorse) return b === 0 ? "var(--ink)" : `color-mix(in srgb, var(--s1) ${[0, 85, 62, 40, 22, 8][b]}%, var(--surface))`;
  return `color-mix(in srgb, var(--s1) ${[8, 22, 40, 58, 76, 92][b]}%, var(--surface))`;
}

export function mapSvg(geo, counties, metric, { dots = true } = {}) {
  const m = METRICS[metric], byF = Object.fromEntries(counties.map(c => [c.fips, c]));
  let s = `<svg viewBox="0 0 ${geo.width} ${geo.height}" role="img" aria-label="${esc(m.label)} by county">`;
  geo.counties.forEach(g => {
    const c = byF[g.fips]; const v = c ? m.val(c) : null;
    const t = c ? `${c.name}, ${c.state}\n${m.short}: ${m.fmt(v)}\nStand-alone pharmacies: ${c.ph_base} → ${c.ph_latest}\nResidents: ${c.pop.toLocaleString("en-US")} (${pct(c.pct65)} aged 65+)\nNo car: ${pct(c.noveh)} · Diabetes: ${pct(c.diabetes)}${c.weis_rx ? `\nWeis pharmacies: ${c.weis_rx}` : ""}` : g.name;
    s += `<path d="${g.d}" style="fill:${fill(m, binOf(m, v))}" class="cty" data-tip="${esc(t)}"/>`;
  });
  s += `<path d="${geo.inner}" class="cty-line"/>`;
  geo.states.forEach(st => { s += `<path d="${st.d}" class="st-line"/>`; });
  if (dots) geo.weis.forEach(p => { s += `<circle cx="${p.x}" cy="${p.y}" r="3.4" class="weis-dot"/>`; });
  return s + "</svg>";
}

export function legendHtml(metric, dots) {
  const m = METRICS[metric];
  return `<div class="legend">${m.legend.map((l, i) => `<span><i style="background:${fill(m, i)}"></i>${esc(l)}</span>`).join("")}${dots ? `<span><i class="dot-key"></i>Weis pharmacy</span>` : ""}</div>`;
}
