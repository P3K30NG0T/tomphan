// tomphan. — Analyst Copilot front end
// Live mode: POST /api/copilot (Claude + tools on the server).
// Sample mode: scripted agent steps; every tool result is computed here, in the browser, by the same functions.
import { runTool } from "./tools.js";

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = v => (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let live = false, busy = false, charts = {};

const SAMPLES = [
  {
    q: "If GPUs only last 4 years and rental prices fall 20% a year, does an H100 still clear an 11% hurdle?",
    plan: "Re-run the base case with a 4-year economic life and a 20% annual price decline. Keep price, utilization and WACC at the base case.",
    calls: [["run_model", { life: 4, decline: 0.2 }]],
    answer: ([r]) => `${r.npv_per_gpu >= 0 ? "Yes" : "No"}. NPV is ${money(r.npv_per_gpu)} per GPU (${r.npv_per_1000_gpus_musd < 0 ? "−$" : "$"}${Math.abs(r.npv_per_1000_gpus_musd).toFixed(2)}M for 1,000 GPUs) and IRR is ${r.irr_pct}%, ${r.irr_pct >= 11 ? "above" : "below"} the 11% hurdle.
- Break-even starting price rises to $${r.breakeven_price.toFixed(2)}/hr, against $2.35 today.
- Year-1 margin is ${r.y1_ebit_margin_pct_economic_life}% on a 4-year life, but ${r.y1_ebit_margin_pct_6yr_accounting}% if booked over 6 years.
So what: under a shorter life, contract prices must hold up or the cluster loses value.`
  },
  {
    q: "Which assumption moves the H100's NPV the most?",
    plan: "Run a one-at-a-time sensitivity around the base case and rank the drivers by NPV swing.",
    calls: [["sensitivity", {}]],
    answer: ([r]) => { const [a, b, c] = r.drivers; return `${a.driver} matters most: it swings NPV from ${money(a.npv_low)} to ${money(a.npv_high)} per GPU around a base of ${money(r.base_npv)}.
- Next come ${b.driver} (${money(b.swing)} swing) and ${c.driver} (${money(c.swing)}).
- Electricity barely matters at US industrial rates.
So what: diligence should focus on contract pricing and how fast it decays, not power costs.`; }
  },
  {
    q: "Compare bull, base and bear, and check the model against CoreWeave's reported numbers.",
    plan: "Pull the three preset scenarios, then CoreWeave's filed revenue and depreciation to test whether the model's cost structure is realistic.",
    calls: [["compare_scenarios", {}], ["coreweave_benchmark", {}]],
    answer: ([s, cw]) => { const [bu, ba, be] = s; return `The range is wide: NPV per GPU runs from ${money(be.npv_per_gpu)} (bear) to ${money(bu.npv_per_gpu)} (bull), with base at ${money(ba.npv_per_gpu)}.
- Bear assumes a 3-year life and 25% annual price falls; bull assumes 6 years and 10%.
- CoreWeave's depreciation ran at ${cw.dna_to_revenue_pct[2]}% of revenue in FY2025 and ${cw.dna_to_revenue_pct[3]}% in H1 2026, close to the model's 40% in year 1.
So what: the model's cost base is realistic; the outcome depends on GPU life and pricing.`; }
  },
  {
    q: "For the paid-channel plan, how much do we save if iOS users pay through a web link instead of in-app purchase?",
    plan: "Run the payment-route calculator twice: iOS through in-app purchase, then iOS through a web link. Android and web use e-wallets in both.",
    calls: [["payment_routes", { iosRoute: "iap", otherRoute: "wallet" }], ["payment_routes", { iosRoute: "link", otherRoute: "wallet" }]],
    answer: ([a, b]) => `Moving iOS to a web link cuts payment fees from ${a.payment_fees_pct}% to ${b.payment_fees_pct}% of fan spending.
- Platform revenue rises from $${a.platform_musd_year}M to $${b.platform_musd_year}M a year; creators get $${(b.creators_musd_month - a.creators_musd_month).toFixed(2)}M more a month.
- The link-out is only commission-free in the US today, and still in court.
So what: in Southeast Asia, win on Android and web first; treat iOS link-outs as upside.`
  }
];

function step(type, html) {
  const el = document.createElement("div");
  el.className = `step ${type}`;
  el.innerHTML = html;
  $("#cp-steps").appendChild(el);
  return el;
}
const label = { question: "Question", plan: "Plan", tool: "Tool call", answer: "Answer" };
function renderAnswer(text) {
  const lines = String(text).split("\n").map(l => l.trim()).filter(Boolean);
  let html = "", list = [];
  const flush = () => { if (list.length) { html += `<ul>${list.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`; list = []; } };
  for (const l of lines) { if (/^[-•*]\s/.test(l)) list.push(l.replace(/^[-•*]\s/, "")); else { flush(); html += `<p>${l.startsWith("So what") ? `<b>${esc(l)}</b>` : esc(l)}</p>`; } }
  flush();
  return html;
}
function toolHtml(name, args, result) {
  return `<span class="k">${label.tool}</span><span class="mono">${esc(name)}(${esc(JSON.stringify(args))})</span><pre>${esc(JSON.stringify(result, null, 2))}</pre>`;
}

function drawChart(toolSteps) {
  const card = $("#cp-chart-card"), host = $("#cp-chart");
  const last = toolSteps[toolSteps.length - 1];
  if (!last) { card.hidden = true; return; }
  const { name, result } = last;
  let title = "", svg = "";
  if (name === "run_model") {
    const flows = [-result.capex, ...result.fcf_by_year]; let c = 0;
    title = "Cash flow per GPU, by year"; svg = charts.barLineChart({ labels: flows.map((_, i) => "Y" + i), bars: flows, line: flows.map(f => (c += f)) });
  } else if (name === "sensitivity") {
    title = "What moves NPV per GPU";
    svg = charts.tornadoChart({ baseNpv: result.base_npv, bars: result.drivers.map(d => ({ label: d.driver, low: d.npv_low, high: d.npv_high, lowLabel: d.low_case, highLabel: d.high_case })) });
  } else if (name === "payment_routes") {
    title = "Where each dollar goes";
    const rows = toolSteps.filter(s => s.name === "payment_routes").map((s, i) => ({ label: `${s.result.assumptions.iosRoute === "iap" ? "iOS in-app" : "iOS " + s.result.assumptions.iosRoute}`, strong: i === 0, fee: s.result.payment_fees_pct / 100, platform: s.result.platform_pct_of_gross / 100, creators: s.result.creators_pct_of_gross / 100 }));
    svg = charts.routeChart(rows);
  } else if (name === "compare_scenarios" || toolSteps.some(s => s.name === "compare_scenarios")) {
    const sc = toolSteps.find(s => s.name === "compare_scenarios").result;
    title = "NPV per GPU by scenario"; svg = charts.barLineChart({ labels: sc.map(s => s.scenario), bars: sc.map(s => s.npv_per_gpu) });
  }
  if (!svg) { card.hidden = true; return; }
  $("#cp-chart-title").textContent = title; host.innerHTML = svg; card.hidden = false;
}

async function runSample(s) {
  busy = true; $("#cp-steps").innerHTML = ""; $("#cp-chart-card").hidden = true;
  step("question", `<span class="k">${label.question}</span>${esc(s.q)}`); await sleep(350);
  step("plan", `<span class="k">${label.plan}</span>${esc(s.plan)}`); await sleep(500);
  const results = [], toolSteps = [];
  for (const [name, args] of s.calls) {
    const result = runTool(name, args); results.push(result); toolSteps.push({ name, args, result });
    step("tool", toolHtml(name, args, result)); await sleep(550);
  }
  step("answer", `<span class="k">${label.answer} · sample run</span>${renderAnswer(s.answer(results))}`);
  drawChart(toolSteps); busy = false;
}

// Offline fallback for typed questions: a small rule-based parser stands in for the model.
function offline(q) {
  const t = q.toLowerCase(); const args = {};
  const num = re => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
  const life = num(/(\d+)\s*-?\s*(?:year|yr|năm)/); if (life) args.life = life;
  const util = num(/(?:utili[sz]ation|utilisation|công suất)[^\d]{0,20}(\d+(?:\.\d+)?)\s*%/) ?? num(/(\d+(?:\.\d+)?)\s*%\s*(?:utili|công suất)/); if (util) args.util = util / 100;
  const price = num(/\$\s*(\d+(?:\.\d+)?)/); if (price) args.price = price;
  const dec = num(/(?:fall|decline|drop|giảm)[^\d]{0,20}(\d+(?:\.\d+)?)\s*%/); if (dec) args.decline = dec / 100;
  const wacc = num(/(?:wacc|hurdle|discount)[^\d]{0,20}(\d+(?:\.\d+)?)\s*%/); if (wacc) args.wacc = wacc / 100;
  if (/ios|iap|app store|payment|creator|channel|kênh|thanh toán/.test(t)) return SAMPLES[3];
  if (/coreweave|bull|bear|scenario|kịch bản/.test(t)) return SAMPLES[2];
  if (/which|driver|sensitiv|matter|nhạy|yếu tố/.test(t) && !Object.keys(args).length) return SAMPLES[1];
  return {
    q, plan: Object.keys(args).length ? `Read these inputs from the question: ${Object.entries(args).map(([k, v]) => `${k} = ${v}`).join(", ")}. Keep everything else at the base case.` : "No specific inputs found, so run the base case.",
    calls: [["run_model", args]],
    answer: ([r]) => `NPV is ${money(r.npv_per_gpu)} per GPU and IRR is ${r.irr_pct ?? "n/a"}%${r.payback_years ? `, with payback in ${r.payback_years} years` : ", with no payback within the GPU's life"}.
- Break-even starting price: ${r.breakeven_price == null ? "n/a" : "$" + r.breakeven_price.toFixed(2) + "/hr"}.
- Year-1 operating margin: ${r.y1_ebit_margin_pct_economic_life}%.
So what: ${r.npv_per_gpu >= 0 ? "this case earns more than its cost of capital." : `this case destroys value at a ${Math.round(r.assumptions.wacc * 1000) / 10}% cost of capital unless prices or utilization improve.`}`
  };
}

async function ask(q) {
  if (busy || !q.trim()) return;
  const sample = SAMPLES.find(s => s.q === q);
  if (sample) return runSample(sample);
  if (!live) return runSample(offline(q));
  busy = true; $("#cp-steps").innerHTML = ""; $("#cp-chart-card").hidden = true;
  step("question", `<span class="k">${label.question}</span>${esc(q)}`);
  const wait = step("plan", `<span class="k">Thinking</span>Choosing a tool and its inputs…`);
  try {
    const res = await fetch("api/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
    const data = await res.json();
    wait.remove();
    if (!res.ok) {
      step("plan", `<span class="k">Note</span>${esc(data.error || "Live mode is unavailable.")} Showing an offline run instead.`);
      busy = false; await sleep(400); return runSample(offline(q));
    }
    const toolSteps = [];
    for (const s of data.steps) {
      if (s.type === "plan") step("plan", `<span class="k">${label.plan}</span>${esc(s.text)}`);
      if (s.type === "tool") { toolSteps.push(s); step("tool", toolHtml(s.name, s.args, s.result)); }
      if (s.type === "answer") step("answer", `<span class="k">${label.answer} · live</span>${renderAnswer(s.text)}`);
      await sleep(250);
    }
    drawChart(toolSteps);
  } catch {
    wait.remove(); step("plan", `<span class="k">Note</span>Could not reach the live copilot. Showing an offline run instead.`);
    busy = false; return runSample(offline(q));
  }
  busy = false;
}

export async function initCopilot(chartFns) {
  charts = chartFns;
  $("#cp-samples").innerHTML = SAMPLES.map((s, i) => `<button type="button" data-i="${i}">${esc(s.q)}</button>`).join("");
  $("#cp-samples").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { location.hash = "copilot"; ask(SAMPLES[+b.dataset.i].q); } });
  $("#cp-form").addEventListener("submit", e => { e.preventDefault(); ask($("#cp-q").value); });
  try {
    const r = await fetch("api/copilot", { method: "GET" });
    live = r.ok && (await r.json()).live === true;
  } catch { live = false; }
  $("#cp-pill").textContent = live ? "Live: answers come from Claude calling the model's tools" : "Sample mode: scripted agent steps, real calculations in your browser";
  if (!live) $("#cp-mode").insertAdjacentHTML("beforeend", `<span>Typed questions use a simple offline parser until live mode is switched on.</span>`);
}
