// tomphan. — Step 1: market research page. Every title and sentence with a number is built from data/market.json.
import { $, esc, usd, pc, spc, hr, mw, dateLabel } from "./fmt.js";
import { lineChart, attachLineHover, ladderChart, hbars, colBars } from "./charts.js";
import { tornado } from "./model.js";

const link = (s, label) => s ? `<a href="${s.url}" target="_blank" rel="noopener">${esc(label || s.title)}</a>` : "";
const GD = { title: "GetDeploying GPU price dataset (CC BY 4.0)", url: "https://getdeploying.com/dataset/gpu-prices" };

export function researchFacts(mk) {
  const H = mk.models.find(m => m.label === "H100");
  const fastest = [...mk.models].filter(m => m.change !== null).sort((a, b) => b.change - a.change)[0];
  const slowest = [...mk.models].filter(m => m.change !== null).sort((a, b) => a.change - b.change)[0];
  const r12 = mk.terms.find(t => t.months === 12);
  const contract = mk.manual.contract1y.value;
  const t = tornado({});
  const elec = t.bars.find(b => b.key === "elec");
  const seaTotal = mk.manual.seaPipeline.markets.reduce((s, m) => s + (m.pipeline || 0), 0);
  return { H, fastest, slowest, r12, contract, decline: mk.ladder?.annualDecline, r2: mk.ladder?.r2, elec, top: t.bars[0], rank: t.bars.findIndex(b => b.key === "elec") + 1, drivers: t.bars.length, seaTotal };
}

export function renderResearch(mk) {
  const f = researchFacts(mk);
  $("#research-asof").textContent = `Prices as of the week of ${dateLabel(mk.asOf)}; refreshed weekly.`;

  // Key findings: agent-drafted if the harness accepted any, otherwise built from the data
  const titles = {
    e1: f.H.change >= 0 ? `Rents are still rising: H100 ${spc(f.H.change)} in a year` : `H100 rents fell ${pc(-f.H.change)} in a year`,
    e2: `Yet each GPU loses about ${pc(f.decline)} of its rent per year it ages`,
    e3: `Volume buyers pay about ${pc(1 - f.contract / f.H.latest)} below the on-demand price`
  };
  const fallback = [
    { title: titles.e1, text: `Demand still outruns supply. The newest chips rose fastest (${f.fastest.label} ${spc(f.fastest.change)}); the oldest barely moved (${f.slowest.label} ${spc(f.slowest.change)}).` },
    { title: titles.e2, text: `Across five GPU generations, rent falls in a near-straight line with age (R² ${f.r2}). A GPU earns its best rent in year one.` },
    { title: "The business runs on long contracts", text: `Big operators sign multi-year deals before buying chips. Without an anchor customer, a buyer carries the price fall alone.` }
  ];
  const agent = Array.isArray(mk.findings) && mk.findings.length === 3;
  const list = agent ? mk.findings : fallback;
  $("#findings").innerHTML = `<div class="f-head"><span class="eyebrow">Key findings</span><span class="f-by">${agent ? "Drafted by the research agent · every number checked against the data" : "Built from the latest data"}</span></div>` +
    `<div class="f-grid">${list.map(x => `<div class="finding"><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div>`).join("")}</div>`;

  // Exhibit 1 — weekly rents
  const dates = [...new Set(mk.models.flatMap(m => m.series.map(p => p[0])))].sort();
  // 4-week rolling average, so the line ends exactly at each model's "latest" figure used everywhere else
  const roll = s => s.map((p, i) => { const w = s.slice(Math.max(0, i - 3), i + 1).map(x => x[1]); return [p[0], w.reduce((a, b) => a + b, 0) / w.length]; });
  const series = mk.models.map(m => { const map = new Map(roll(m.series)); return { label: m.label, strong: m.label === "H100", points: dates.map(d => [d, map.has(d) ? map.get(d) : null]) }; });
  const lc = lineChart({ series, id: "trend" });
  $("#ch-trend").innerHTML = lc.svg;
  attachLineHover($("#ch-trend"), lc.meta, v => hr(v));
  $("#ex1-title").textContent = titles.e1;
  $("#ex1-so").innerHTML = `<b>So what:</b> demand still outruns supply, and it is chasing the newest hardware. ${esc(f.fastest.label)} rose ${spc(f.fastest.change)} while the ${esc(f.slowest.label)}, the oldest model here, moved ${spc(f.slowest.change)}.`;
  $("#tb-trend").innerHTML = `<tr><th>GPU</th><th class="n">Latest $/hr</th><th class="n">Year ago $/hr</th><th class="n">Change</th><th class="n">Providers</th><th class="n">Spot / on-demand</th></tr>` +
    mk.models.map(m => `<tr><td>${esc(m.label)}</td><td class="n">${m.latest.toFixed(2)}</td><td class="n">${m.first.toFixed(2)}</td><td class="n">${m.change === null ? "n/a" : spc(m.change)}</td><td class="n">${m.providers}</td><td class="n">${m.spotRatio ?? "n/a"}</td></tr>`).join("");
  $("#ex1-src").innerHTML = `Source: ${link(GD)}. Latest = average of the last four complete weeks; year ago = first four weeks in the dataset (about ${f.H.weeks} weeks earlier).`;

  // Exhibit 2 — price ladder
  if (mk.ladder) {
    $("#ch-ladder").innerHTML = ladderChart(mk.ladder);
    $("#ex2-title").textContent = titles.e2;
    $("#ex2-so").innerHTML = `<b>So what:</b> today's price rise is a snapshot; the ladder is the long-run pull. A GPU bought now earns its highest rent in year one and about ${pc(f.decline)} less each year after. That rate is the model's base-case rent decline. Part of the gap is that newer chips do more work, which is exactly what an owner's chip competes against.`;
    $("#ex2-src").innerHTML = `Source: ${link(GD)}. Volume-availability dates are analyst inputs from NVIDIA launch timing (A100 2020, H100 late 2022, H200 2024, B200 early 2025, B300 late 2025).`;
  }

  // Exhibit 3 — how H100 capacity is bought
  const gap = mk.manual.hyperscalerGap;
  const rows = [
    { label: "Hyperscaler on-demand", sub: "AWS, Azure, Google · Oct 2026", value: gap.hyperscalers },
    { label: "On-demand, all GPU clouds", sub: `median of ${f.H.providers} providers`, value: f.H.latest },
    f.r12 ? { label: "Listed 12-month reservation", sub: `median of ${f.r12.providers} providers`, value: f.r12.price } : null,
    f.H.spotRatio ? { label: "Spot (can be interrupted)", sub: "same week, median", value: f.H.latest * f.H.spotRatio } : null,
    { label: "1-year contract, volume buyers", sub: "SemiAnalysis index · Mar 2026", value: f.contract, strong: true }
  ].filter(Boolean).sort((a, b) => b.value - a.value);
  $("#ch-price").innerHTML = hbars(rows, { fmt: v => `$${v.toFixed(2)}` });
  $("#ex3-title").textContent = titles.e3;
  $("#ex3-so").innerHTML = `<b>So what:</b> a large buyer signing for a year paid about ${hr(f.contract)}, ${pc(1 - f.contract / f.H.latest)} below today's on-demand median${f.r12 ? `, while listed 12-month reservations sit only ${pc(f.r12.discount)} below it` : ""}. Real discounts are negotiated, not listed. The model starts from the negotiated price.`;
  $("#ex3-src").innerHTML = `Sources: ${link(GD)}; ${link(mk.manual.hyperscalerGap, "GetDeploying GPU Price Trends")}; ${link(mk.manual.contract1y, "SemiAnalysis H100 1-year rental index")}. Dates differ by bar, as labelled.`;

  // Exhibit 4 — CoreWeave
  const cw = mk.coreweave;
  if (cw?.periods?.length) {
    $("#ch-cw").innerHTML = colBars(cw.periods.map(p => ({ label: p.label, value: p.revenue, strong: p.label.startsWith("FY2025") })), { fmt: v => `$${v.toLocaleString("en-US")}M` });
    const fy = cw.periods.find(p => p.label === "FY2025");
    const facts = cw.facts || [];
    const tiles = [
      ...facts.filter(x => ["topCustomer", "rpo", "contractLength"].includes(x.key)).map(x => ({ v: x.value, l: x.label })),
      fy ? { v: pc(fy.dna / fy.revenue), l: "Depreciation as a share of revenue, FY2025" } : null
    ].filter(Boolean);
    $("#cw-tiles").innerHTML = tiles.map(t => `<div class="tile"><b>${esc(t.v)}</b><span>${esc(t.l)}</span></div>`).join("");
    $("#ex4-so").innerHTML = `<b>So what:</b> the leading operator locks in multi-year, take-or-pay contracts before it buys chips, and one customer can be two-thirds of revenue. A newcomer without an anchor customer carries the rent decline alone, which is why contract length is a lever in the model.`;
    $("#ex4-src").innerHTML = `Source: ${link(mk.manual.coreweave, "CoreWeave Form 10-K FY2025")} and 10-Q filings via SEC XBRL${cw.cached ? ` (this week the harness used its ${esc(cw.cached)}; see the run log)` : ""}.`;
  }

  // Exhibit 5 — Southeast Asia
  const sea = mk.manual.seaPipeline;
  $("#ch-sea").innerHTML = hbars(sea.markets.map(m => ({ label: m.market, value: m.pipeline, sub: m.underConstruction ? `${m.underConstruction.toLocaleString("en-US")} MW under construction` : "", strong: m.market.startsWith("Ho Chi Minh") })), { fmt: v => mw(v), labelW: 240 });
  const hcm = sea.markets.find(m => m.market.startsWith("Ho Chi Minh"));
  const johor = sea.markets[0];
  $("#ex5-so").innerHTML = `<b>So what:</b> the region holds about half of Asia-Pacific capacity under construction, so tenants will have choices. In the model, electricity ranks ${f.rank} of ${f.drivers} value drivers: moving the power price from ${esc(f.elec.lowLabel)} to ${esc(f.elec.highLabel)} shifts NPV by ${usd(f.elec.swing)} per GPU, against ${usd(f.top.swing)} for ${esc(f.top.label.toLowerCase())}. A regional player wins on contracts and local demand, not cheap power. Ho Chi Minh City is early: a ${mw(hcm.pipeline)} pipeline against ${mw(johor.pipeline)} in Johor.`;
  $("#ex5-src").innerHTML = `Source: ${link(sea, "Cushman & Wakefield, APAC Data Centre H1 2026 Update")}. Pipeline = under construction plus planned. Power-price swing from the model's sensitivity analysis.`;

  // Bridge — driver tree
  const a = mk.assumptions;
  const node = (label, value, tag, href) => `<div class="t-node"><span>${esc(label)}</span><b>${esc(value)}</b>${href ? `<a href="${href}">${esc(tag)}</a>` : `<em>${esc(tag)}</em>`}</div>`;
  $("#driver-tree").innerHTML = `
    <div class="t-col"><span class="t-k">Rent earned</span>${node("Year-1 rent", hr(a.price.value), "Exhibit 3", "#ex-price")}${node("Years locked by contract", `${a.lock.value} yr`, "Exhibit 4", "#ex-buyers")}${node("Rent decline per year", pc(a.decline.value), "Exhibit 2", "#ex-ladder")}${node("Utilization", pc(a.util.value), "Analyst input")}</div>
    <div class="t-op">−</div>
    <div class="t-col"><span class="t-k">Cash costs</span>${node("Power", `${(a.elec.value * 100).toFixed(1)}¢/kWh`, "Exhibit 5 · EIA", "#ex-sea")}${node("Other opex", "$0.30 per hour", "Analyst input")}</div>
    <div class="t-op">−</div>
    <div class="t-col"><span class="t-k">Capital</span>${node("Capex per GPU", usd(a.capex.value), "Analyst input")}${node("Economic life", `${a.life.value} years`, "Exhibit 4: books use 6", "#ex-buyers")}${node("Cost of capital", pc(a.wacc.value), "Analyst input")}</div>`;

  // Sources
  const srcs = [GD, { title: "SEC EDGAR XBRL, CoreWeave Inc.", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001769628" }, mk.manual.coreweave, mk.manual.contract1y, mk.manual.hyperscalerGap, mk.manual.power, mk.manual.seaPipeline, mk.manual.depreciationDebate];
  $("#research-sources").innerHTML = srcs.map(s => `<li>${link(s)}</li>`).join("");
}
