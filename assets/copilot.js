// tomphan. — "Ask the agent" on the harness page.
// Live mode: POST /api/copilot (Claude + the same tools, on the server). Sample mode: scripted agent steps;
// every tool result is computed here, in the browser, by the same functions.
import { runTool } from "./tools.js";
import { esc, usd, hr } from "./fmt.js";
import { barLineChart, tornadoChart, hbars } from "./charts.js";

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms));
let live = false, busy = false, ctx = {};
const money = v => usd(v);

const SAMPLES = [
  {
    q: "If H100 rents fall 30% a year instead of what the ladder shows, does buying still make sense?",
    plan: "Re-run the base case with a 30% annual rent decline. Keep everything else at the research-based base case.",
    calls: [["run_model", { decline: 0.30 }]],
    answer: ([r]) => `${r.npv_per_gpu >= 0 ? "Yes" : "No"}. NPV is ${money(r.npv_per_gpu)} per GPU (${r.npv_per_1000_gpus_musd < 0 ? "−$" : "$"}${Math.abs(r.npv_per_1000_gpus_musd).toFixed(2)}M for 1,000 GPUs) and IRR is ${r.irr_pct ?? "n/a"}%.
- Break-even year-1 rent rises to ${r.breakeven_rent == null ? "n/a" : hr(r.breakeven_rent)}.
- The most you could pay per GPU and still break even: ${money(r.breakeven_capex)}.
So what: the faster GPUs age, the more the deal depends on what you pay for them.`
  },
  {
    q: "How many years of contract does a buyer need before an H100 pays off?",
    plan: "Run the model with the year-1 rent locked for 2 years, then for 3 years. Everything else stays at the base case.",
    calls: [["run_model", { lock: 2 }], ["run_model", { lock: 3 }]],
    answer: ([a, b]) => `${a.npv_per_gpu >= 0 ? "Two years is enough" : b.npv_per_gpu >= 0 ? "About three years" : "More than three years"} at ${hr(a.assumptions.price)}.
- 2-year lock: NPV ${money(a.npv_per_gpu)}, IRR ${a.irr_pct ?? "n/a"}%.
- 3-year lock: NPV ${money(b.npv_per_gpu)}, IRR ${b.irr_pct ?? "n/a"}%.
So what: contract length is worth negotiating harder than price.`
  },
  {
    q: "Which assumption matters most for the answer?",
    plan: "Run a one-at-a-time sensitivity around the base case and rank the drivers by how far each moves NPV.",
    calls: [["sensitivity", {}]],
    answer: ([r]) => { const [a, b, c] = r.drivers; const last = r.drivers.at(-1); return `${a.driver} matters most: it moves NPV from ${money(a.npv_low)} to ${money(a.npv_high)} per GPU, around a base of ${money(r.base_npv)}.
- Next come ${b.driver} (${money(b.swing)} swing) and ${c.driver} (${money(c.swing)}).
- ${last.driver} matters least (${money(last.swing)}).
So what: diligence should go into contract pricing and purchase price before anything else.`; }
  },
  {
    q: "What does the market data say about GPU rents right now?",
    plan: "Pull the latest market snapshot from the research harness: rents by model, yearly change, the price ladder and contract prices.",
    calls: [["market_snapshot", {}]],
    answer: ([m]) => { const h = m.rents.find(x => x.gpu === "H100"); const top = [...m.rents].sort((x, y) => (y.change_12m_pct ?? -99) - (x.change_12m_pct ?? -99))[0]; return `Rents are rising, but every GPU ages fast.
- H100 rents for ${hr(h.on_demand_usd_hr)} on demand, ${h.change_12m_pct >= 0 ? "up" : "down"} ${Math.abs(h.change_12m_pct)}% in a year; ${top.gpu} rose most (${top.change_12m_pct}%).
- Across models, rent falls about ${m.price_ladder.rent_lost_per_year_of_age_pct}% per year of age (R² ${m.price_ladder.r2}).
- Volume buyers signed 1-year deals at ${hr(m.h100_1yr_contract_index_usd_hr)}.
So what: buy for the contract you can sign, not for today's spot price.`; }
  }
];

function step(type, html) { const el = document.createElement("div"); el.className = `step ${type}`; el.innerHTML = html; $("#cp-steps").appendChild(el); return el; }
const LABEL = { question: "Question", plan: "Plan", tool: "Tool call", answer: "Answer" };
function renderAnswer(text) {
  const lines = String(text).split("\n").map(l => l.trim()).filter(Boolean);
  let html = "", list = [];
  const flush = () => { if (list.length) { html += `<ul>${list.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`; list = []; } };
  for (const l of lines) { if (/^[-•*]\s/.test(l)) list.push(l.replace(/^[-•*]\s/, "")); else { flush(); html += `<p>${l.startsWith("So what") ? `<b>${esc(l)}</b>` : esc(l)}</p>`; } }
  flush(); return html;
}
const toolHtml = (name, args, result) => `<span class="k">${LABEL.tool}</span><span class="mono">${esc(name)}(${esc(JSON.stringify(args))})</span><pre>${esc(JSON.stringify(result, null, 2))}</pre>`;

function drawChart(toolSteps) {
  const card = $("#cp-chart-card"), host = $("#cp-chart");
  const last = toolSteps[toolSteps.length - 1]; if (!last) { card.hidden = true; return; }
  let title = "", svg = "";
  const runs = toolSteps.filter(s => s.name === "run_model");
  if (last.name === "run_model" && runs.length > 1) {
    title = "NPV per GPU by contract length";
    svg = barLineChart({ labels: runs.map(s => `${s.result.assumptions.lock}-yr lock`), bars: runs.map(s => s.result.npv_per_gpu) });
  } else if (last.name === "run_model") {
    const r = last.result; const f = [-r.capex, ...r.fcf_by_year]; let c = 0;
    title = "Cash flow per GPU, by year"; svg = barLineChart({ labels: f.map((_, i) => "Y" + i), bars: f, line: f.map(x => (c += x)) });
  } else if (last.name === "sensitivity") {
    title = "What moves NPV per GPU";
    svg = tornadoChart({ baseNpv: last.result.base_npv, bars: last.result.drivers.map(d => ({ label: d.driver, low: d.npv_low, high: d.npv_high, lowLabel: d.low_case, highLabel: d.high_case })) });
  } else if (last.name === "market_snapshot" && last.result.rents) {
    title = "On-demand rent by GPU model, $/hr";
    svg = hbars(last.result.rents.map(x => ({ label: x.gpu, value: x.on_demand_usd_hr, strong: x.gpu === "H100" })), { fmt: v => `$${v.toFixed(2)}`, labelW: 90 });
  } else if (last.name === "compare_scenarios") {
    title = "NPV per GPU by scenario"; svg = barLineChart({ labels: last.result.map(s => s.scenario), bars: last.result.map(s => s.npv_per_gpu) });
  }
  if (!svg) { card.hidden = true; return; }
  $("#cp-chart-title").textContent = title; host.innerHTML = svg; card.hidden = false;
}

async function runSample(s) {
  busy = true; $("#cp-steps").innerHTML = ""; $("#cp-chart-card").hidden = true;
  step("question", `<span class="k">${LABEL.question}</span>${esc(s.q)}`); await sleep(300);
  step("plan", `<span class="k">${LABEL.plan}</span>${esc(s.plan)}`); await sleep(450);
  const results = [], toolSteps = [];
  for (const [name, args] of s.calls) { const result = runTool(name, args, ctx); results.push(result); toolSteps.push({ name, args, result }); step("tool", toolHtml(name, args, result)); await sleep(500); }
  step("answer", `<span class="k">${LABEL.answer} · sample run</span>${renderAnswer(s.answer(results))}`);
  drawChart(toolSteps); busy = false;
}

// Offline stand-in for typed questions when live mode is off: a small rule-based parser picks the tool.
function offline(q) {
  const t = q.toLowerCase(); const args = {};
  const num = re => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
  const life = num(/(\d+)\s*-?\s*(?:year|yr|năm)\s*(?:life|vòng đời)/); if (life) args.life = life;
  const lock = num(/(\d+)\s*-?\s*(?:year|yr|năm)\s*(?:contract|lock|hợp đồng)/); if (lock !== null) args.lock = lock;
  const util = num(/(?:utili[sz]ation|công suất)[^\d]{0,20}(\d+(?:\.\d+)?)\s*%/) ?? num(/(\d+(?:\.\d+)?)\s*%\s*(?:utili|công suất)/); if (util) args.util = util / 100;
  const price = num(/\$\s*(\d+(?:\.\d+)?)/); if (price) args.price = price;
  const dec = num(/(?:fall|decline|drop|giảm)[^\d]{0,20}(\d+(?:\.\d+)?)\s*%/) ?? num(/(\d+(?:\.\d+)?)\s*%\s*(?:a|per|mỗi)\s*(?:year|năm)/); if (dec) args.decline = dec / 100;
  const capex = num(/capex[^\d]{0,12}\$?\s*(\d+(?:\.\d+)?)\s*k/); if (capex) args.capex = capex * 1000;
  if (!Object.keys(args).length) {
    if (/market|rent|price|giá|thị trường/.test(t)) return SAMPLES[3];
    if (/which|driver|sensitiv|matter|nhạy|yếu tố/.test(t)) return SAMPLES[2];
    if (/contract|hợp đồng/.test(t)) return SAMPLES[1];
  }
  return {
    q, plan: Object.keys(args).length ? `Read these inputs from the question: ${Object.entries(args).map(([k, v]) => `${k} = ${v}`).join(", ")}. Keep everything else at the base case.` : "No specific inputs found, so run the base case.",
    calls: [["run_model", args]],
    answer: ([r]) => `NPV is ${money(r.npv_per_gpu)} per GPU and IRR is ${r.irr_pct ?? "n/a"}%${r.payback_years ? `, with payback in ${r.payback_years} years` : ", with no payback within the GPU's life"}.
- Break-even year-1 rent: ${r.breakeven_rent == null ? "n/a" : hr(r.breakeven_rent)}.
- Most you could pay per GPU and break even: ${money(r.breakeven_capex)}.
So what: ${r.npv_per_gpu >= 0 ? "this case earns more than its cost of capital." : `this case loses value at a ${Math.round(r.assumptions.wacc * 1000) / 10}% cost of capital unless rent, contract length or purchase price improve.`}`
  };
}

async function ask(q) {
  if (busy || !q.trim()) return;
  const sample = SAMPLES.find(s => s.q === q);
  if (sample) return runSample(sample);
  if (!live) return runSample(offline(q));
  busy = true; $("#cp-steps").innerHTML = ""; $("#cp-chart-card").hidden = true;
  step("question", `<span class="k">${LABEL.question}</span>${esc(q)}`);
  const wait = step("plan", `<span class="k">Thinking</span>Choosing a tool and its inputs…`);
  try {
    const res = await fetch("api/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
    const data = await res.json(); wait.remove();
    if (!res.ok) { step("plan", `<span class="k">Note</span>${esc(data.error || "Live mode is unavailable.")} Showing an offline run instead.`); busy = false; await sleep(400); return runSample(offline(q)); }
    const toolSteps = [];
    for (const s of data.steps) {
      if (s.type === "plan") step("plan", `<span class="k">${LABEL.plan}</span>${esc(s.text)}`);
      if (s.type === "tool") { toolSteps.push(s); step("tool", toolHtml(s.name, s.args, s.result)); }
      if (s.type === "answer") step("answer", `<span class="k">${LABEL.answer} · live</span>${renderAnswer(s.text)}`);
      await sleep(250);
    }
    drawChart(toolSteps);
  } catch { wait.remove(); step("plan", `<span class="k">Note</span>Could not reach the live agent. Showing an offline run instead.`); busy = false; return runSample(offline(q)); }
  busy = false;
}

export async function initCopilot(context) {
  ctx = context;
  $("#cp-samples").innerHTML = SAMPLES.map((s, i) => `<button type="button" data-i="${i}">${esc(s.q)}</button>`).join("");
  $("#cp-samples").addEventListener("click", e => { const b = e.target.closest("button"); if (b) ask(SAMPLES[+b.dataset.i].q); });
  $("#cp-form").addEventListener("submit", e => { e.preventDefault(); ask($("#cp-q").value); });
  try { const r = await fetch("api/copilot", { method: "GET" }); live = r.ok && (await r.json()).live === true; } catch { live = false; }
  $("#cp-pill").textContent = live ? "Live: Claude calls the harness tools" : "Sample mode: scripted agent steps, real calculations in your browser";
  if (!live) $("#cp-mode").insertAdjacentHTML("beforeend", `<span>Typed questions use a simple offline parser until live mode is switched on.</span>`);
}
