// tomphan. — router and pages for the Pharmacy Deserts case. Every number is read from data/case.json,
// which case/build/build.py makes from the fetched open data (case/data/) and case/build/facts.json.
import { $, esc } from "./fmt.js";
import { initTips, lineChart, divBars, colBars, groupBars, profitCurve } from "./charts.js";
import { mapSvg, legendHtml, METRICS } from "./map.js";

const n0 = v => Math.round(v).toLocaleString("en-US");
const p1 = v => `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v * 100).toFixed(1)}%`;
const p0 = v => `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v * 100).toFixed(0)}%`;
const usdM = v => `$${Math.round(v).toLocaleString("en-US")}M`;
const usdK = v => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v / 1000)).toLocaleString("en-US")}k`;
const qLabel = q => `${q.slice(4)} ${q.slice(0, 4)}`;
let D, GEO;

const ACTS = [
  { n: 1, slug: "act1", short: "The shock", q: "One-time event or lasting shift?", live: true },
  { n: 2, slug: "act2", short: "Demand", q: "Who is left behind, and where?", live: true },
  { n: 3, slug: "act3", short: "Economics", q: "Why does the old model lose money?", live: true },
  { n: 4, slug: "act4", short: "Weis", q: "What does Weis have to win with?", live: true },
  { n: 5, slug: "act5", short: "New model", q: "Can technology change the cost, and where first?", live: false },
  { n: 6, slug: "act6", short: "The money", q: "Which of three options is worth it?", live: false },
  { n: 7, slug: "act7", short: "Decision", q: "What to do, how to track it, when to stop?", live: false }
];

/* ---------- derived numbers used in several places ---------- */
function derive() {
  const a1 = D.act1, a2 = D.act2, a3 = D.act3, a4 = D.act4;
  const us = a1.us_change, st = a1.states_change;
  const pa = st.find(s => s.state === "PA");
  const seven = st.reduce((o, s) => ({ b: o.b + s.base, l: o.l + s.latest, jb: o.jb + s.jobs_base, jl: o.jl + s.jobs_latest }), { b: 0, l: 0, jb: 0, jl: 0 });
  const pd = a1.partd, fills0 = pd[0], fillsL = pd[pd.length - 1];
  const ph = y => a1.us_annual.find(r => r.year === y).estabs;
  const c = a2.counties, weisC = c.filter(x => x.weis_rx > 0), other = c.filter(x => !x.weis_rx);
  const grp = g => { const b = g.reduce((s, x) => s + x.ph_base, 0), l = g.reduce((s, x) => s + x.ph_latest, 0), pop = g.reduce((s, x) => s + x.pop, 0), a65 = g.reduce((s, x) => s + x.age65, 0); return { n: g.length, b, l, pop, a65, ch: l / b - 1, a65PerPh: a65 / l, resPerPh: pop / l }; };
  const sd = Object.fromEntries(a2.state_demand.map(s => [s.state, s.fills_2024 / s.ph_2024]));
  const displaced = weisC.reduce((s, x) => s + Math.max(0, x.ph_base - x.ph_latest) * sd[x.state], 0);
  const cd = a3.calc_defaults, gp = cd.revenue_per_rx * cd.gross_margin, fixed = cd.payroll + cd.other_costs;
  const profit = cd.rx_per_day * 365 * gp - fixed;
  const pay = a3.payroll_per_ph, pay0 = pay[0], payL = pay[pay.length - 1];
  const fin = a4.fin, f = y => fin.find(r => r.year === y);
  return {
    us, pa, seven, usDrop: us.latest - us.base, usPct: us.latest / us.base - 1, usJobs: us.jobs_latest / us.jobs_base - 1,
    paPct: pa.latest / pa.base - 1, paJobs: pa.jobs_latest / pa.jobs_base - 1, sevenPct: seven.l / seven.b - 1,
    riteMaxShare: a1.context.rite_aid_stores_at_filing / (us.base - us.latest),
    fillsGrowth: fillsL.fills / fills0.fills - 1, fills0, fillsL, phFlat: ph(fillsL.year) / ph(fills0.year) - 1,
    fillsPerPh0: fills0.fills / ph(fills0.year), fillsPerPhL: fillsL.fills / ph(fillsL.year),
    weisG: grp(weisC), otherG: grp(other), weisLosing: weisC.filter(x => x.change < 0).length, weisRxInLosing: weisC.filter(x => x.change < 0).reduce((s, x) => s + x.weis_rx, 0),
    noneNow: c.filter(x => x.ph_latest === 0), lostLast: c.filter(x => x.ph_latest === 0 && x.ph_base > 0), displaced, sd,
    gp, fixed, profit, rev: cd.rx_per_day * 365 * cd.revenue_per_rx, be: fixed / gp / 365, be0: (pay0.payroll + cd.other_costs) / gp / 365, pay0, payL,
    wba: a3.walgreens, phSales: y => f(y).net_sales * f(y).pharmacy_share, f, cashSec: y => f(y).cash + f(y).securities
  };
}

/* ---------- shared bits ---------- */
const strip = cur => `<nav class="acts" aria-label="The seven acts">${ACTS.map(a => `<a href="#${a.slug}" class="act${a.n === cur ? " on" : ""}${a.live ? "" : " soon"}" ${a.n === cur ? 'aria-current="page"' : ""} data-tip="${esc(`Act ${a.n} · ${a.short}\n${a.q}${a.live ? "" : "\n(in progress)"}`)}"><span class="act-n">${a.n}</span><span class="act-t">${esc(a.short)}</span></a>`).join("")}</nav>`;
const head = (a, title, answer) => `<div class="wrap">${strip(a.n)}<header class="p-head"><span class="eyebrow">Act ${a.n} of 7 · ${esc(a.short)}</span><h1>${title}</h1>
  <div class="qa"><div><span class="k">The question</span><p>${esc(a.q)}</p></div><div><span class="k">What the data says</span><p>${answer}</p></div></div></header>`;
const exhibit = (no, id, title, sub, chart, so, src, extra = "") => `<article class="exhibit" id="${id}"><span class="ex-no">Exhibit ${no}</span><h2>${title}</h2>${sub ? `<p class="ex-sub">${sub}</p>` : ""}<div class="chart" id="ch-${id}">${chart}</div>${extra}${so ? `<p class="sowhat">${so}</p>` : ""}<p class="src">${src}</p></article>`;
const srcLink = k => { const s = D.sources[k]; return `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a>`; };
const decision = (q, reading, change) => `<section class="decision"><span class="eyebrow">The decision this act settles</span><h2>${q}</h2><p>${reading}</p>${change ? `<p class="muted"><b>What would change this reading:</b> ${change}</p>` : ""}<span class="draft-tag">Draft reading, under review</span></section>`;
const next = (n, text) => { const a = ACTS[n - 1]; return `<a class="leads" href="#${a.slug}"><span class="eyebrow">This leads to Act ${n} · ${esc(a.short)}</span><b>${esc(a.q)}</b><span>${text}</span></a>`; };
const tiles = arr => `<div class="tiles t${arr.length}">${arr.map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join("")}</div>`;
const table = (cols, rows, cls = "") => `<div class="table-wrap"><table class="${cls}"><thead><tr>${cols.map(c => `<th${c.n ? ' class="n"' : ""}>${c.t}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td${cols[i].n ? ' class="n"' : ""}>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

/* ---------- home ---------- */
function home(x) {
  return `<div class="wrap">
  <section class="hero">
    <div class="portrait" aria-hidden="true">TP</div>
    <div>
      <div class="eyebrow">Business planning · Strategy analysis</div>
      <h1>Tom Phan</h1>
      <div class="full">Phan Nguyen Hong Quang · Ho Chi Minh City</div>
      <p class="lede">I build business plans and the analysis behind them. For four years I have planned revenue for a 28-supermarket retail region. This site follows one real business decision from public data to a board recommendation.</p>
      <div class="btns"><a class="btn primary" href="#act1">Start with Act 1</a><a class="btn" href="downloads/pharmacy-deserts-data.xlsx" download>Download the data (Excel)</a><a class="btn" href="resume.pdf" target="_blank" rel="noopener" data-resume hidden>Résumé (PDF)</a></div>
    </div>
  </section>

  <section class="case">
    <span class="eyebrow">The case · October 2026</span>
    <h2>Pharmacy deserts: what should Weis Markets do next?</h2>
    <p class="prose">Rite Aid, once the third-largest US drugstore chain, has closed every store, and the rush to buy its customers' prescription records is over. Weis Markets, a supermarket chain with 202 stores in seven states, picked up a few. The board's question is what to do next:</p>
    <div class="options"><div><b>A</b><span>Keep buying prescription records one deal at a time</span></div><div><b>B</b><span>Build a technology-enabled pharmacy network where pharmacies have closed</span></div><div><b>C</b><span>Hold its current size and protect margin</span></div></div>
    <p class="disclaimer">An independent, outside-in analysis built only on public data. It uses no inside information, is not affiliated with Weis Markets, and is not investment advice.</p>
  </section>

  <section class="journey">
    <div class="j-head"><h2>Seven acts, from the outside in</h2><span class="status">Acts 1–4 published · Acts 5–7 in progress</span></div>
    <div class="j-grid">${ACTS.map(a => `<a class="j-card${a.live ? "" : " soon"}" href="#${a.slug}"><span class="act-n">${a.n}</span><b>${esc(a.short)}</b><span class="q">${esc(a.q)}</span><span class="ans">${a.live ? ANSWERS[a.n](x) : "In progress"}</span></a>`).join("")}</div>
  </section>

  <section class="kpi-row">
    ${tiles([[p1(x.usPct), `US stand-alone pharmacies, ${qLabel(D.act1.base)} to ${qLabel(D.act1.last)}`], [p1(x.paPct), "Pennsylvania, where 120 of 202 Weis stores are"], [p1(x.weisG.ch), "In the 50 counties with a Weis pharmacy"], [p0(x.fillsGrowth), `Medicare prescriptions, ${x.fills0.year} to ${x.fillsL.year}`]])}
  </section>

  <section class="about" id="about">
    <div class="prose">
      <span class="eyebrow">About</span><h2>Retail planner, moving into strategy</h2>
      <p>Since 2022 I have been a Planning Specialist at Saigon Co.op, a retailer running hypermarkets, supermarkets, minimarts and convenience stores. I plan revenue for a region of 28 supermarkets, including private label and fresh food, and prepare business reviews for the Board of Management.</p>
      <p>I build my own tools: SQL and Power BI for reporting, VBA, Power Apps and Power Automate for workflows, and AI agents that turn progress notes into numbers and tickets into SQL queries. The data pipeline behind this case is built the same way.</p>
      <p>Before that I was promoted from support agent to support analyst at MEXC Global, and ran a premium imported-food store. I hold a Bachelor of Business Management from the Posts and Telecommunications Institute of Technology.</p>
    </div>
    <aside class="contact-box"><b>Contact</b><div class="row"><span class="mono" id="email">hongquangpl0508@gmail.com</span><button class="copy" data-copy="email" type="button">Copy</button></div><div class="row"><span class="muted">Based in</span><span>Ho Chi Minh City</span></div></aside>
  </section></div>`;
}
const ANSWERS = {
  1: x => `A lasting shift. Pharmacies fell ten quarters in a row while prescriptions kept rising; Rite Aid explains at most ${Math.round(x.riteMaxShare * 10)} in 10 of the closures.`,
  2: x => `The gap is where Weis is. Counties with a Weis pharmacy lost ${Math.abs(x.weisG.ch * 100).toFixed(0)}% of their stand-alone pharmacies, against ${Math.abs(x.otherG.ch * 100).toFixed(0)}% elsewhere.`,
  3: x => `Thin margins and rising fixed costs. A typical stand-alone pharmacy keeps about ${Math.round(x.profit / x.rev * 100)} cents per dollar; $1 less per prescription takes ${Math.round(D.act3.calc_defaults.rx_per_day * 365 / x.profit * 100)}% of its profit.`,
  4: x => `The locations, not the cash. ${D.act4.npi_pharmacies} pharmacy counters, mostly in hard-hit counties; cash and securities fell from ${usdM(x.cashSec(2024))} to ${usdM(x.cashSec(2025))} in 2025.`
};

/* ---------- Act 1 ---------- */
function act1(x) {
  const a = ACTS[0], A = D.act1;
  const q = A.us_quarterly, bi = q.findIndex(r => r.q === A.base);
  const ev = [{ q: "2023Q4", n: 1, label: "Oct 2023: Rite Aid files for bankruptcy" }, { q: "2025Q2", n: 2, label: "May 2025: Rite Aid files again and decides to close every store" }, { q: "2025Q4", n: 3, label: "Oct 2025: the last Rite Aid stores close" }];
  const c1 = lineChart({ labels: q.map(r => r.q), series: [{ label: "US pharmacies", values: q.map(r => r.estabs), strong: true, tipExtra: i => `\nJobs: ${n0(q[i].jobs)}` }], every: 4, xFmt: l => l.slice(0, 4), highlightFrom: bi, events: ev.map(e => ({ ...e, i: q.findIndex(r => r.q === e.q) })), yMin: 57000, yMax: 66000, endFmt: (s, v) => n0(v), aria: "US pharmacies by quarter" });
  const years = A.us_annual.map(r => r.year).filter(y => y >= A.partd[0].year);
  const phI = years.map(y => A.us_annual.find(r => r.year === y).estabs / A.us_annual.find(r => r.year === years[0]).estabs * 100);
  const fiI = years.map(y => { const r = A.partd.find(p => p.year === y); return r ? r.fills / A.partd[0].fills * 100 : null; });
  const c2 = lineChart({ labels: years.map(String), series: [{ label: "Medicare prescriptions", values: fiI, strong: true }, { label: "Pharmacies", values: phI }], every: 2, yMin: 90, yMax: 160, yFmt: v => v.toFixed(0), endFmt: (s, v) => `${s.label} ${v.toFixed(0)}`, aria: "Medicare prescriptions and pharmacies, index 2014 = 100" });
  const st = [...A.states_change].sort((p, r) => (p.latest / p.base) - (r.latest / r.base));
  const c3 = divBars(st.map(s => ({ label: s.name, sub: `${s.weis} Weis stores`, value: s.latest / s.base - 1, strong: s.state === "PA", tip: `${s.name}: ${n0(s.base)} → ${n0(s.latest)} pharmacies (${p1(s.latest / s.base - 1)})\nJobs ${p1(s.jobs_latest / s.jobs_base - 1)}\nWeis stores: ${s.weis}` })), { ref: x.usPct, refLabel: `United States ${p1(x.usPct)}`, fmt: p1, labelW: 230, aria: "Change in pharmacies by state" });
  const tl = table([{ t: "When" }, { t: "What happened" }, { t: "Why it matters" }], A.timeline.map(r => [`<span class="mono nowrap">${esc(r.label)}</span>`, `${esc(r.event)} <a class="cite" href="${D.sources[r.src].url}" target="_blank" rel="noopener">source</a>`, esc(r.why)]), "timeline-t");
  return head(a, "Rite Aid failed, and the whole industry is shrinking", ANSWERS[1](x)) + `
  ${tiles([[n0(-x.usDrop), `fewer US stand-alone pharmacies, ${qLabel(A.base)} to ${qLabel(A.last)} (${p1(x.usPct)})`], [p1(x.paPct), "Pennsylvania over the same period; 120 of 202 Weis stores are there"], [p0(x.fillsGrowth), `Medicare prescriptions, ${x.fills0.year} to ${x.fillsL.year}, while pharmacy numbers ended flat`]])}
  <article class="exhibit"><span class="ex-no">Exhibit 1</span><h2>What happened</h2><p class="ex-sub">The events behind this case, in order. Each row links to its source.</p>${tl}</article>
  ${exhibit(2, "ex-count", "US pharmacies held near 64,000 for years, then fell ten quarters in a row", "Pharmacies and drug stores in the US, by quarter. Numbered markers are Rite Aid events; hover for details.", c1,
    `Rite Aid had ${n0(A.context.rite_aid_stores_at_filing)} stores when it first filed. Even if every one of them is part of this drop, at least ${n0(-x.usDrop - A.context.rite_aid_stores_at_filing)} of the ${n0(-x.usDrop)} lost pharmacies (${Math.round((1 - x.riteMaxShare) * 100)}%) belonged to someone else: CVS closed about ${A.context.cvs_closed_2021_2024} stores from late 2021 to 2024 and planned ${A.context.cvs_closures_2025_plan} more in 2025, Walgreens planned ${n0(A.context.walgreens_closure_plan)} closures over three years, and many independents closed. Pharmacy jobs fell almost as much (${p1(x.usJobs)}), so this is a real loss, not a quirk of how stores are counted.`,
    `Source: ${srcLink("qcew")}, private sector. <b>What this count includes:</b> businesses whose main activity is selling medicine (chain drugstores and independent pharmacies). Pharmacy counters inside supermarkets, like Weis's, are counted under the store's main business and are not in this number. The industry code changed in 2022, which explains the small jump that year.`)}
  ${exhibit(3, "ex-demand", "Medicare prescriptions rose " + p0(x.fillsGrowth).replace("+", "") + " in ten years; the number of pharmacies went nowhere", "Index, 2014 = 100. Medicare prescriptions counted as 30-day fills paid by Part D, the drug plan for people aged 65 and over.", c2,
    `In ${x.fills0.year} Medicare paid for ${(x.fills0.fills / 1e9).toFixed(1)} billion 30-day prescriptions; in ${x.fillsL.year}, ${(x.fillsL.fills / 1e9).toFixed(1)} billion. Each pharmacy now fills about ${n0(x.fillsPerPhL)} Medicare prescriptions a year, against ${n0(x.fillsPerPh0)} ten years earlier. The wider market says the same: Americans used ${A.context.iqvia_days_bn_2025} billion days of medicine in 2025, ${Math.round(A.context.iqvia_days_5y_growth * 100)}% more than five years before, and spending rose ${(A.context.iqvia_spend_growth * 100).toFixed(1)}% in one year to $${A.context.iqvia_spend_bn_2025} billion. Fewer shops, more customers per shop.`,
    `Sources: ${srcLink("partd")}; ${srcLink("qcew")}; ${srcLink("iqvia")}.`)}
  <article class="exhibit"><span class="ex-no">Exhibit 4</span><h2>Why pharmacies close while demand rises</h2>
    <div class="explain"><div><b>Who pays</b><p>The customer at the counter rarely pays the full price. Most of it is paid by insurers through pharmacy benefit managers (PBMs), middlemen that set how much each pharmacy is paid per prescription.</p></div>
    <div><b>Who sets the price</b><p>The three largest PBMs handled nearly ${Math.round(A.context.ftc_top3_share * 100)}% of the ${A.context.ftc_rx_bn_2023} billion prescriptions filled in the US in 2023 (FTC). A pharmacy cannot walk away from them.</p></div>
    <div><b>What it does to a pharmacy</b><p>Pharmacies report being paid below cost, paid late, and asked for money back months later. In 2025, ${(A.context.ncpa_considering_closing_2025 * 100).toFixed(1)}% of independent owners said they were thinking of closing (NCPA).</p></div></div>
    <p class="sowhat">The problem is not too few customers. It is too little money per customer to cover rent and a pharmacist. Act 3 puts numbers on that.</p>
    <p class="src">Sources: ${srcLink("ftc")}; ${srcLink("ncpa")}.</p></article>
  ${exhibit(5, "ex-states", "Weis's home states lost pharmacies faster than the US, Pennsylvania above all", `Change in pharmacies and drug stores, ${qLabel(A.base)} to ${qLabel(A.last)}. Weis's seven states together: ${p1(x.sevenPct)} (${n0(x.seven.l - x.seven.b)}).`, c3,
    `Pennsylvania lost ${n0(x.pa.base - x.pa.latest)} pharmacies and pharmacy jobs fell almost as much (${p1(x.paJobs)}). Rite Aid was strongest here: it still had ${A.context.rite_aid_pa_stores_may2025} stores in Pennsylvania when it announced it would close them all. When a pharmacy closes, its prescription records are usually sold and patients moved to the buyer's nearest store. CVS took most of Rite Aid's, from ${A.context.cvs_rite_aid_pharmacies} pharmacies, and says it now serves more than ${A.context.cvs_rite_aid_patients_m} million former Rite Aid patients. Weis bought the records of 12 competitor pharmacies in 2025.`,
    `Sources: ${srcLink("qcew")}; ${srcLink("inquirer")}; ${srcLink("pymnts")}; ${srcLink("weis10k")}.`)}
  ${decision("A one-time event to profit from, or a lasting shift?", `<b>A lasting shift.</b> The decline started before Rite Aid's last stores closed, it is larger than Rite Aid, it is happening while demand rises, and it has a clear cause: too little money per prescription. A one-time event would call for a deal (keep buying records when they come up). A lasting shift calls for a strategy, so the case continues.`, `the next BLS releases showing the count leveling off once all Rite Aid closures are counted.`)}
  ${next(2, "If supply is shrinking while demand grows, where are the gaps, and are they near Weis?")}
  </div>`;
}

/* ---------- Act 2 ---------- */
function act2(x) {
  const a = ACTS[1], A2 = D.act2;
  const sd = [...A2.state_demand].sort((p, r) => r.fills_2024 / r.ph_2024 - p.fills_2024 / p.ph_2024);
  const c5 = divBars(sd.map(s => ({ label: s.name, sub: `${s.weis} Weis stores`, value: s.fills_2024 / s.ph_2024, strong: s.state === "PA", tip: `${s.name}: ${n0(s.fills_2024)} Medicare 30-day fills in 2024\n${n0(s.ph_2024)} stand-alone pharmacies\n${n0(s.fills_2024 / s.ph_2024)} per pharmacy` })), { ref: A2.us_fills_per_ph_2024, refLabel: `US ${n0(A2.us_fills_per_ph_2024)}`, fmt: n0, labelW: 230, aria: "Medicare prescriptions per pharmacy by state" });
  const g = groupBars([{ label: "Change in stand-alone pharmacies", values: [-x.weisG.ch * 100, -x.otherG.ch * 100] }], [{ label: "Counties with a Weis pharmacy", color: "var(--s1)" }, { label: "Other counties", color: "var(--chart-2)" }], { fmt: v => `−${v.toFixed(1)}%`, h: 200, w: 340, aria: "Loss of pharmacies" });
  const g2 = groupBars([{ label: "Residents 65+ per stand-alone pharmacy", values: [x.weisG.a65PerPh, x.otherG.a65PerPh] }], [{ label: "Counties with a Weis pharmacy", color: "var(--s1)" }, { label: "Other counties", color: "var(--chart-2)" }], { fmt: n0, h: 200, w: 340, aria: "Older residents per pharmacy" });
  const worst = A2.counties.filter(c => c.weis_rx > 0).sort((p, r) => p.change - r.change).slice(0, 12);
  return head(a, "The gap is opening right where Weis already is", ANSWERS[2](x)) + `
  ${tiles([[p1(x.weisG.ch), `stand-alone pharmacies in the ${x.weisG.n} counties with a Weis pharmacy (${p1(x.otherG.ch)} in the other ${x.otherG.n})`], [`${(x.weisG.a65 / 1e6).toFixed(1)}M`, "residents aged 65+ live in those counties"], [`~${Math.round(x.displaced / 1e6)}M`, "Medicare prescriptions a year that were filled at pharmacies there that have since closed (estimate)"]])}
  <article class="exhibit" id="ex-map"><span class="ex-no">Exhibit 6</span><h2>Where pharmacies are thin, and where they are closing</h2>
    <p class="ex-sub">All ${A2.counties.length} counties in Weis's seven states. Choose what to color by; dots are pharmacies registered to Weis. Hover a county for its numbers.</p>
    <div class="map-ctl" role="group" aria-label="Map measure">${Object.entries(METRICS).map(([k, m]) => `<button type="button" data-metric="${k}" aria-pressed="${k === "change"}">${esc(m.short)}</button>`).join("")}<label class="tog"><input type="checkbox" id="dots" checked> Weis pharmacies</label></div>
    <div class="map" id="map"></div><div id="map-legend"></div>
    <p class="sowhat">Losses are spread across the region. In raw numbers the biggest falls were in large cities such as Philadelphia and Pittsburgh, where Weis has no pharmacy; in percentage terms many of the suburban and small-city counties where Weis does operate fell as much or more (Exhibit 7). ${x.noneNow.length} counties, home to ${n0(x.noneNow.reduce((s, c) => s + c.pop, 0))} people, now have no stand-alone pharmacy; ${x.lostLast.length} of them lost their last one since ${qLabel(D.act1.base)}. Many still have a pharmacy counter in a supermarket or big-box store, which this count does not see.</p>
    <p class="src">Sources: ${srcLink("qcew")} (county counts); ${srcLink("svi")} (residents, age, cars); ${srcLink("places")} (diabetes, transport; 2023 estimates); ${srcLink("npi")}; map shapes from ${srcLink("atlas")}.</p></article>
  <article class="exhibit"><span class="ex-no">Exhibit 7</span><h2>Counties with a Weis pharmacy lost pharmacies faster, and have more older people per pharmacy</h2>
    <p class="ex-sub">${x.weisG.n} counties with at least one Weis pharmacy vs the other ${x.otherG.n} counties in the seven states.</p>
    <div class="ex-split"><div class="chart small">${g}</div><div class="chart small">${g2}</div></div>
    <div class="legend"><span><i style="background:var(--s1)"></i>Counties with a Weis pharmacy</span><span><i style="background:var(--chart-2)"></i>Other counties</span></div>
    <p class="sowhat">${x.weisLosing} of the ${x.weisG.n} counties lost stand-alone pharmacies, and they hold ${x.weisRxInLosing} of Weis's ${D.act4.npi_placed} mapped pharmacies. Taken together they went from ${n0(x.weisG.b)} to ${n0(x.weisG.l)} stand-alone pharmacies. If the closed ones had filled as many Medicare prescriptions as their state's average in 2024, about ${Math.round(x.displaced / 1e6)} million Medicare prescriptions a year had to find a new home. That is a rough upper estimate: closing pharmacies were probably smaller than average.</p>
    <p class="src">Sources: ${srcLink("qcew")}; ${srcLink("svi")}; ${srcLink("npi")}; ${srcLink("partd")}.</p></article>
  ${exhibit(8, "ex-busy", "Pennsylvania's pharmacies were already the busiest in the region", "Medicare 30-day prescriptions per stand-alone pharmacy, 2024.", c5,
    "Busier pharmacies mean fewer of them for the same need. Pennsylvania's were filling more Medicare prescriptions each than any other Weis state before the 2025 closures, so each closure there moved more patients.", `Sources: ${srcLink("partd")}; ${srcLink("qcew")}.`)}
  <article class="exhibit"><span class="ex-no">Exhibit 9</span><h2>The counties with a Weis pharmacy that lost the most</h2>
    ${table([{ t: "County" }, { t: "Stand-alone pharmacies" , n: true }, { t: "Change", n: true }, { t: "Residents", n: true }, { t: "Aged 65+", n: true }, { t: "No car", n: true }, { t: "Weis pharmacies", n: true }], worst.map(c => [`${esc(c.name)}, ${c.state}`, `${c.ph_base} → ${c.ph_latest}`, p0(c.ph_latest / c.ph_base - 1), n0(c.pop), `${c.pct65.toFixed(1)}%`, `${c.noveh.toFixed(1)}%`, c.weis_rx]))}
    <details class="data-table"><summary>Explore all ${A2.counties.length} counties</summary><input type="search" id="cty-q" placeholder="Filter by county or state" class="search"><div id="cty-table"></div></details>
    <p class="src">Sources: as Exhibit 6. The Excel file has every county with formulas.</p></article>
  ${decision("Is the unserved need big enough to deserve its own strategy?", `<b>Yes, inside Weis's own footprint.</b> The counties where Weis already has pharmacies lost stand-alone pharmacies about ${(x.weisG.ch / x.otherG.ch).toFixed(1)} times as fast as the rest of the region, and they are home to ${(x.weisG.a65 / 1e6).toFixed(1)} million people aged 65+, the heaviest users of medicine. The need is not in far-off places Weis would have to enter; it is next to its existing stores.`, `checking real drive times. The BLS count leaves out supermarket and big-box pharmacies, so "fewer stand-alone pharmacies" does not always mean "no pharmacy nearby". Act 5 will test the top counties against actual pharmacy locations.`)}
  ${next(3, "If the need is there, why are others walking away from it? Is the problem revenue or cost?")}
  </div>`;
}

/* ---------- Act 3 ---------- */
function act3(x) {
  const a = ACTS[2], A3 = D.act3, cd = A3.calc_defaults;
  const pay = A3.payroll_per_ph;
  const c7 = colBars(pay.map(r => ({ label: String(r.year), value: r.payroll, strong: r.year === pay[pay.length - 1].year, tip: `${r.year}: ${usdK(r.payroll)} pay per pharmacy\n${r.jobs} jobs per pharmacy\nAverage pay per job $${n0(r.avg_pay)}` })), { fmt: usdK, aria: "Pay per pharmacy" });
  const w23 = x.wba[0], w24 = x.wba[1];
  return head(a, "Thin margins, rising fixed costs", ANSWERS[3](x)) + `
  ${tiles([[`${(D.act3.ncpa[0].gross_margin * 100).toFixed(1)}%`, "gross margin of independent pharmacies in 2023, the lowest in ten years (NCPA)"], [p0(x.payL.payroll / x.pay0.payroll - 1), `pay per pharmacy, ${x.pay0.year} to ${x.payL.year} (BLS)`], [`${(w24.adj_op_income_bn / w24.sales_bn * 100).toFixed(1)}%`, `Walgreens pharmacy operating margin, fiscal 2024, down from ${(w23.adj_op_income_bn / w23.sales_bn * 100).toFixed(1)}%`]])}
  ${exhibit(10, "ex-pay", `Running a pharmacy costs ${p0(x.payL.payroll / x.pay0.payroll - 1).replace("+", "")} more in pay than ten years ago`, "Total pay per pharmacy and drug store, US, per year.", c7,
    `Jobs per pharmacy barely moved (${x.pay0.jobs} in ${x.pay0.year}, ${x.payL.jobs} in ${x.payL.year}); each job simply costs more. A pharmacist earns $${n0(A3.oews.pharmacist.US)} a year on average and a pharmacy technician $${n0(A3.oews.technician.US)} (BLS, May 2025). Holding everything else equal, pay alone raised the prescriptions a day needed to break even from about ${Math.round(x.be0)} to ${Math.round(x.be)}.`,
    `Sources: ${srcLink("qcew")}; ${srcLink("oews")}.`)}
  <article class="exhibit" id="ex-calc"><span class="ex-no">Exhibit 11</span><h2>One stand-alone pharmacy's year</h2>
    <p class="ex-sub">Move the inputs. Defaults come from published industry data, except rent and other costs, which are an assumption.</p>
    <div class="workbench"><div class="controls" id="calc-ctl">
      ${slider("rx", "Prescriptions per day", cd.rx_per_day, 60, 300, 5, cd.rx_per_day_src)}
      ${slider("rev", "Revenue per prescription", cd.revenue_per_rx, 50, 120, 0.1, cd.revenue_per_rx_src, "$")}
      ${slider("gm", "Gross margin", cd.gross_margin * 100, 12, 30, 0.1, cd.gross_margin_src, "", "%")}
      ${slider("pay", "Payroll per year", cd.payroll / 1000, 300, 900, 10, cd.payroll_src, "$", "k")}
      ${slider("oth", "Rent and other costs per year", cd.other_costs / 1000, 100, 500, 10, cd.other_costs_src, "$", "k")}
      <button type="button" class="btn" id="calc-reset">Reset to defaults</button>
    </div><div class="panels"><div id="calc-kpis"></div><div class="chart" id="calc-chart"></div><p class="sowhat" id="calc-so"></p></div></div>
    <p class="src">Sources: ${srcLink("ncpa2026")}; ${srcLink("ncpa2024")}; ${srcLink("qcew")}. The same calculator, with a sensitivity table, is in the Excel file.</p></article>
  <article class="exhibit"><span class="ex-no">Exhibit 12</span><h2>The biggest chains feel it too</h2>
    ${table([{ t: "" }, { t: "Fiscal 2023", n: true }, { t: "Fiscal 2024", n: true }], [["Walgreens US pharmacy sales", `$${w23.sales_bn.toFixed(1)}bn`, `$${w24.sales_bn.toFixed(1)}bn`], ["Adjusted operating income", `$${w23.adj_op_income_bn.toFixed(2)}bn`, `$${w24.adj_op_income_bn.toFixed(2)}bn`], ["Operating margin", `${(w23.adj_op_income_bn / w23.sales_bn * 100).toFixed(1)}%`, `${(w24.adj_op_income_bn / w24.sales_bn * 100).toFixed(1)}%`], ["Operating income per 30-day prescription", "", `$${(w24.adj_op_income_bn / w24.rx_30day_bn).toFixed(2)}`]])}
    <p class="sowhat">Walgreens sold more and earned ${Math.round((1 - w24.adj_op_income_bn / w23.adj_op_income_bn) * 100)}% less, and named lower reimbursement as a cause it expects to continue. ${Math.round(w24.third_party_paid * 100)}% of its pharmacy sales are paid by insurers and PBMs, not the customer. CVS went the other way: it kept closing stores (${D.act3.cvs_2025.closed_2025} in 2025) but filled ${D.act3.cvs_2025.rx_30day_bn} billion prescriptions, ${(D.act3.cvs_2025.retail_share * 100).toFixed(1)}% of the US retail total, and took most of Rite Aid's patients. Volume per store is what separates the two.</p>
    <p class="src">Sources: ${srcLink("wba1200")}; ${srcLink("wba10k")}; ${srcLink("cvs10k")}.</p></article>
  ${decision("Is the problem revenue or cost?", `<b>Both, and the fix is volume per site.</b> Money per prescription is falling (gross margin at a ten-year low, lower reimbursement at Walgreens, and from 2026 Medicare's negotiated prices), while the fixed cost of keeping a pharmacy open keeps rising. Technology cannot raise the price, but it can cut the fixed cost per prescription: filling at a central site, sharing a pharmacist across counters by video, delivering instead of opening a new store. That keeps the network option alive. A supermarket that already pays the rent and draws the shoppers starts with part of that cost covered.`, `evidence that payment per prescription will keep falling faster than any realistic cost saving. Act 6 tests this with the money.`)}
  ${next(4, "Does Weis have what it takes to use that edge: locations, money, room to absorb a pilot?")}
  </div>`;
}
const slider = (id, label, v, min, max, step, src, pre = "", suf = "") => `<div class="ctl"><label for="in-${id}">${esc(label)} <output id="out-${id}"></output></label><input type="range" id="in-${id}" min="${min}" max="${max}" step="${step}" value="${v}" data-def="${v}" data-pre="${pre}" data-suf="${suf}"><small>${esc(src)}</small></div>`;
function wireCalc() {
  const ids = ["rx", "rev", "gm", "pay", "oth"];
  const draw = () => {
    ids.forEach(i => { const el = $(`#in-${i}`); $(`#out-${i}`).textContent = `${el.dataset.pre}${(+el.value).toLocaleString("en-US")}${el.dataset.suf}`; });
    const rx = +$("#in-rx").value, rev = +$("#in-rev").value, gm = +$("#in-gm").value / 100, fixed = (+$("#in-pay").value + +$("#in-oth").value) * 1000;
    const gp = rev * gm, yr = rx * 365, profit = yr * gp - fixed, be = fixed / gp / 365;
    $("#calc-kpis").innerHTML = tiles([[`$${gp.toFixed(2)}`, "kept per prescription after the drug cost"], [usdK(profit), "profit before tax per year"], [`${(profit / (yr * rev) * 100).toFixed(1)}%`, "profit as a share of revenue"], [`${Math.round(be)}`, "prescriptions a day to break even"]]);
    $("#calc-chart").innerHTML = profitCurve({ cur: rx, gpRx: gp, fixed, days: 365 });
    $("#calc-so").innerHTML = `At these inputs, each $1 less paid per prescription costs this pharmacy ${usdK(yr)} a year${profit > 0 ? `, ${Math.round(yr / profit * 100)}% of its profit` : ""}. Each extra prescription a day adds ${usdK(gp * 365)}.`;
  };
  ids.forEach(i => $(`#in-${i}`).addEventListener("input", draw));
  $("#calc-reset").onclick = () => { ids.forEach(i => { const el = $(`#in-${i}`); el.value = el.dataset.def; }); draw(); };
  draw();
}

/* ---------- Act 4 ---------- */
function act4(x) {
  const a = ACTS[3], A4 = D.act4, fin = A4.fin;
  const yrs = [2023, 2024, 2025];
  const c11 = colBars(yrs.map(y => ({ label: String(y), value: x.phSales(y), strong: y === 2025, tip: `${y}: pharmacy sales about ${usdM(x.phSales(y))} (${(x.f(y).pharmacy_share * 100).toFixed(1)}% of ${usdM(x.f(y).net_sales)})` })), { fmt: usdM, w: 360, h: 240, aria: "Weis pharmacy sales" });
  const c11b = colBars(yrs.map(y => ({ label: String(y), value: x.f(y).op_income, strong: y === 2025, tip: `${y}: operating income ${usdM(x.f(y).op_income)}` })), { fmt: usdM, w: 360, h: 240, aria: "Weis operating income" });
  const c12 = groupBars(fin.map(r => ({ label: String(r.year), values: [r.cash + r.securities, r.capex, r.ocf] })), [{ label: "Cash and marketable securities", color: "var(--s1)" }, { label: "Capital spending", color: "var(--s2)" }, { label: "Cash from operations", color: "var(--chart-2)" }], { fmt: v => `$${Math.round(v)}M`, aria: "Weis cash, capital spending and operating cash flow" });
  const st = Object.entries(A4.stores_by_state).map(([s, n]) => [s, n, A4.npi_by_state[s] || 0]).sort((p, r) => r[1] - p[1]);
  const pa = x.pa;
  return head(a, "Weis has the locations, but less cash than it had", ANSWERS[4](x)) + `
  ${tiles([[A4.npi_pharmacies, `pharmacies registered to Weis, in ${st.filter(r => r[2]).length} of its 7 states`], [usdM(x.phSales(2025)), `pharmacy sales in 2025, up ${p0(x.phSales(2025) / x.phSales(2023) - 1)} in two years (derived)`], [usdM(x.cashSec(2025)), `cash and marketable securities at end-2025, from ${usdM(x.cashSec(2024))} a year earlier`]])}
  ${exhibit(13, "ex-weis-rx", "Pharmacy grew fast while Weis's operating income fell", "$ millions. Pharmacy sales are derived: net sales × the pharmacy share Weis reports.", `<div class="ex-split"><div><p class="mini-h">Pharmacy sales</p><div class="chart small">${c11}</div></div><div><p class="mini-h">Operating income, whole company</p><div class="chart small">${c11b}</div></div></div>`,
    `Pharmacy went from ${(x.f(2023).pharmacy_share * 100).toFixed(1)}% to ${(x.f(2025).pharmacy_share * 100).toFixed(1)}% of Weis's sales. Over the same years operating income fell from ${usdM(x.f(2023).op_income)} to ${usdM(x.f(2025).op_income)}. Weis reports one segment, so the data cannot say how much of the fall, if any, comes from pharmacy; expensive drugs such as GLP-1 weight-loss medicines raise sales far more than profit. In the first half of 2026 Weis said Medicare's negotiated prices cut its pharmacy revenue by ${usdM(A4.h1_2026.ira_pharmacy_revenue_hit)}.`,
    `Sources: ${srcLink("weis10k")} (2023–2025 as restated); ${srcLink("weisq2")}.`)}
  ${exhibit(14, "ex-weis-cash", "Store spending has eaten the cash cushion", "$ millions, fiscal years.", c12,
    `Weis has no borrowings, but it spent ${usdM(x.f(2025).capex)} on stores and fuel centers in 2025, almost all of the ${usdM(x.f(2025).ocf)} its operations produced. Cash and marketable securities fell to ${usdM(x.cashSec(2025))} (${usdM(A4.h1_2026.cash + A4.h1_2026.securities)} in June 2026). Its credit line is small: $${A4.credit_line.committed}M committed plus $${A4.credit_line.discretionary}M at the bank's discretion. A pilot of a few million dollars fits; a large network build would compete with store spending or need new borrowing.`,
    `Sources: ${srcLink("weisxbrl")}; ${srcLink("weis10k")}.`, `<div class="legend"><span><i style="background:var(--s1)"></i>Cash and marketable securities</span><span><i style="background:var(--s2)"></i>Capital spending</span><span><i style="background:var(--chart-2)"></i>Cash from operations</span></div>`)}
  <article class="exhibit" id="ex-weis-map"><span class="ex-no">Exhibit 15</span><h2>Weis pharmacies sit in the counties that lost the most</h2>
    <p class="ex-sub">Change in stand-alone pharmacies since ${qLabel(D.act1.base)}, with Weis's registered pharmacies as dots.</p>
    <div class="map" id="map4"></div><div id="map4-legend"></div>
    ${table([{ t: "State" }, { t: "Weis stores", n: true }, { t: "Registered Weis pharmacies", n: true }], st.map(r => [r[0], r[1], r[2]]))}
    <p class="sowhat">Weis does not publish how many of its stores have a pharmacy. Every US pharmacy must register in the national provider registry (NPI), and ${A4.npi_pharmacies} active registrations carry Weis's name, ${A4.npi_by_state.PA} of them in Pennsylvania and none in Virginia. Treat this as an estimate: a registration can outlive a closed counter. ${x.weisRxInLosing} of the ${A4.npi_placed} mapped Weis pharmacies are in counties that lost stand-alone pharmacies.</p>
    <p class="src">Sources: ${srcLink("npi")}; ${srcLink("geocoder")}; ${srcLink("qcew")}; ${srcLink("weis10k")}.</p></article>
  <article class="exhibit"><span class="ex-no">Exhibit 16</span><h2>Strengths and limits, side by side</h2>
    <div class="sl"><div><b>Strengths</b><ul><li>About ${A4.npi_pharmacies} pharmacy counters already open, inside stores that pay the rent and draw shoppers.</li><li>Concentrated where closures were deepest: Pennsylvania and Maryland.</li><li>No borrowings, steady cash from operations (about $${Math.round(x.f(2025).ocf)}M a year).</li><li>Has already started buying prescription records (12 in 2025) and runs free pharmacy delivery in parts of Pennsylvania.</li></ul></div>
    <div><b>Limits</b><ul><li>Cash and securities fell by ${usdM(x.cashSec(2024) - x.cashSec(2025))} in 2025; store spending uses nearly all operating cash.</li><li>Operating income down three years in a row (${usdM(x.f(2023).op_income)} to ${usdM(x.f(2025).op_income)}).</li><li>Medicare's negotiated prices are already cutting pharmacy revenue.</li><li>Small scale next to CVS (${D.act3.cvs_2025.rx_30day_bn} billion prescriptions a year), so less weight with PBMs.</li></ul></div></div></article>
  ${decision("Does Weis have the locations, the money and the room to carry a pilot?", `<b>Locations yes, money for a pilot, not for a big build.</b> Weis already has pharmacy counters in exactly the counties that lost the most, which lowers the cost of any network. But its cash cushion halved in 2025 and its credit line is small, so the network option has to start small and prove itself before it can grow. Act 6 will size the three options inside these limits.`, `a change in Weis's capital plans (for example, fewer new stores) or new borrowing, which would widen the room for investment.`)}
  ${next(5, "Next: which model (central filling, remote pharmacists, delivery) and which counties first. In progress.")}
  </div>`;
}

/* ---------- Acts 5-7 (in progress) ---------- */
const COMING = {
  5: ["Can technology change the cost, and where first?", "Compares the cost of one prescription today with a model that fills prescriptions at a central site, connects store counters to a pharmacist by video where state rules allow, and delivers to homes. Ranks the counties from Act 2 with a weighted score you can adjust.", ["State rules on remote pharmacy (NABP, state boards)", "The county table from Act 2 and Weis locations from Act 4", "Technology costs as labelled ranges from public sources"]],
  6: ["Which of three options is worth it?", "An adjustable financial model of A (keep buying records), B (tech-enabled network) and C (hold and protect margin): value, return, payback and worst case under bad, base and good scenarios, with the extra groceries pharmacy customers buy.", ["Results of Acts 2 to 5", "Cost of capital for food retail", "Excel version that matches the web model"]],
  7: ["What to do, how to track it, when to stop?", "A recommendation for the board, with a pilot, gates to pass before expanding, the measures to watch, and a control-tower demo: an agent that reads the measures weekly and flags a missed gate.", ["Results of Act 6", "Measures: prescriptions per day per site, cost per prescription, patients taking medicine on schedule, grocery basket of pharmacy customers"]]
};
function coming(n) {
  const a = ACTS[n - 1], [q, what, data] = COMING[n];
  return `<div class="wrap">${strip(n)}<header class="p-head"><span class="eyebrow">Act ${n} of 7 · ${esc(a.short)} · in progress</span><h1>${esc(q)}</h1><p class="prose muted">${esc(what)}</p></header>
  <div class="callout"><b>Will use</b><ul>${data.map(d => `<li>${esc(d)}</li>`).join("")}</ul></div>
  <p class="muted" style="margin-top:20px">Acts 1–4 are published; this act follows once their conclusions are confirmed. <a href="#act4">Back to Act 4</a></p></div>`;
}

/* ---------- Data & method ---------- */
function data() {
  const S = D.sources;
  return `<div class="wrap"><header class="p-head"><span class="eyebrow">Data and method</span><h1>Where every number comes from</h1>
  <p class="prose muted">All data is public. Datasets are downloaded by a script that runs on GitHub Actions, checked, and turned into one data file for this site and one Excel workbook. Facts from company filings and reports are kept in a separate file with their source links.</p>
  <div class="btns"><a class="btn primary" href="downloads/pharmacy-deserts-data.xlsx" download>Download the Excel workbook</a></div></header>
  <div class="flowline">${["Fetch: BLS, CMS, CDC, Census, NPI registry", "Check and log every request", "Build one data file and the Excel workbook", "Charts and text read only from that file"].map((s, i) => `<div><span class="act-n">${i + 1}</span>${esc(s)}</div>`).join("")}</div>
  <div class="grid-2" style="margin-top:28px"><div class="card"><h3>What the workbook holds</h3><ul class="plain"><li>Act 1: US and state pharmacy counts by quarter, Medicare prescriptions, the event timeline</li><li>Act 2: all ${D.act2.counties.length} counties with pharmacies, age, cars, health and Weis pharmacies</li><li>Act 3: pay per pharmacy, a one-pharmacy calculator with a sensitivity table, industry benchmarks</li><li>Act 4: Weis financials and its registered pharmacies</li></ul></div>
  <div class="card"><h3>Read with care</h3><ul class="plain"><li>BLS counts stand-alone pharmacies and drugstores; supermarket and big-box pharmacy counters are counted under the store's main business.</li><li>County figures sum to slightly less than state figures because BLS withholds some county detail.</li><li>Weis pharmacy count comes from active registrations, which can outlive a closed counter.</li><li>Rent and other costs in the Act 3 calculator are an assumption.</li></ul></div></div>
  <h2 style="margin-top:36px;font-size:24px">Sources</h2><ul class="sources">${Object.values(S).filter((s, i, arr) => arr.findIndex(t => t.url === s.url) === i).map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("")}</ul></div>`;
}

/* ---------- map wiring ---------- */
function wireMap(host, legend, metric, dots, ctl) {
  const draw = () => { host.innerHTML = mapSvg(GEO, D.act2.counties, metric, { dots }); legend.innerHTML = legendHtml(metric, dots); };
  if (ctl) {
    ctl.querySelectorAll("[data-metric]").forEach(b => b.onclick = () => { metric = b.dataset.metric; ctl.querySelectorAll("[data-metric]").forEach(o => o.setAttribute("aria-pressed", o === b)); draw(); });
    ctl.querySelector("#dots").onchange = e => { dots = e.target.checked; draw(); };
  }
  draw();
}
function wireCountyTable() {
  const rows = [...D.act2.counties].sort((p, r) => p.state.localeCompare(r.state) || p.name.localeCompare(r.name));
  const render = q => {
    const f = rows.filter(c => !q || `${c.name} ${c.state}`.toLowerCase().includes(q.toLowerCase()));
    $("#cty-table").innerHTML = table([{ t: "County" }, { t: "Pharmacies", n: true }, { t: "Per 10,000", n: true }, { t: "Residents", n: true }, { t: "65+", n: true }, { t: "No car", n: true }, { t: "Diabetes", n: true }, { t: "Weis", n: true }],
      f.map(c => [`${esc(c.name)}, ${c.state}`, `${c.ph_base} → ${c.ph_latest}`, c.per10k?.toFixed(1) ?? "", n0(c.pop), `${c.pct65?.toFixed(1)}%`, `${c.noveh?.toFixed(1)}%`, c.diabetes === null ? "n/a" : `${c.diabetes.toFixed(1)}%`, c.weis_rx || ""]), "dense");
  };
  $("#cty-q").addEventListener("input", e => render(e.target.value));
  render("");
}

/* ---------- router ---------- */
let X;
function route() {
  const h = (location.hash || "#home").slice(1);
  const app = $("#app");
  const page = { home: () => home(X), act1: () => act1(X), act2: () => act2(X), act3: () => act3(X), act4: () => act4(X), act5: () => coming(5), act6: () => coming(6), act7: () => coming(7), data }[h] || (() => home(X));
  app.innerHTML = page();
  document.querySelectorAll("[data-nav]").forEach(a => { const on = a.dataset.nav === h || (a.dataset.nav === "case" && /^act\d$/.test(h)); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (h === "act2") { wireMap($("#map"), $("#map-legend"), "change", true, $(".map-ctl")); wireCountyTable(); }
  if (h === "act3") wireCalc();
  if (h === "act4") wireMap($("#map4"), $("#map4-legend"), "change", true, null);
  if (FILES.resume) document.querySelectorAll("[data-resume]").forEach(e => e.hidden = false);
  if (FILES.portrait) document.querySelectorAll(".portrait").forEach(p => { p.innerHTML = '<img src="assets/portrait.jpg" alt="Tom Phan">'; });
  window.scrollTo(0, 0);
}
const FILES = {};
async function optionalFiles() {
  const has = async (u, t) => { try { const r = await fetch(u, { method: "HEAD" }); return r.ok && (r.headers.get("content-type") || "").includes(t); } catch { return false; } };
  [FILES.resume, FILES.portrait] = await Promise.all([has("resume.pdf", "pdf"), has("assets/portrait.jpg", "image")]);
}
document.addEventListener("click", e => {
  const c = e.target.closest("[data-copy]");
  if (c) { const el = document.getElementById(c.dataset.copy); navigator.clipboard?.writeText(el.textContent).then(() => { c.textContent = "Copied"; setTimeout(() => c.textContent = "Copy", 1500); }); }
});

(async () => {
  initTips();
  [D, GEO] = await Promise.all([fetch("data/case.json").then(r => r.json()), fetch("data/geo.json").then(r => r.json())]);
  X = derive();
  await optionalFiles();
  window.addEventListener("hashchange", route);
  route();
})();
