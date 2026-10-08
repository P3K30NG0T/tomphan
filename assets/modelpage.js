// tomphan. — Step 2: financial evaluation + recommendation by perspective. Everything recomputes from the current inputs.
import { $, esc, usd, usdK, usdM, pc, spc, hr, mw } from "./fmt.js";
import { LIMITS, evaluate, tornado, lockCapexGrid, getBase, scenarioInputs, SCENARIO_LABELS, CLUSTER } from "./model.js";
import { barLineChart, tornadoChart, lockCapexChart } from "./charts.js";

const SLIDERS = [
  { k: "price", label: "Rent, year 1", step: .05, fmt: v => hr(v), note: "Volume 1-yr contract index: $2.35" },
  { k: "lock", label: "Years locked by contract", step: 1, fmt: v => v === 0 ? "none" : `${v} yr`, min: 0 },
  { k: "decline", label: "Rent decline per year", step: .01, fmt: v => pc(v) },
  { k: "util", label: "Utilization", step: .01, fmt: v => pc(v) },
  { k: "capex", label: "Capex per GPU, all-in", step: 1000, fmt: v => usdK(v) },
  { k: "life", label: "Economic life", step: 1, fmt: v => `${v} yrs`, note: "Accounting life at CoreWeave: 6 years" },
  { k: "wacc", label: "Cost of capital", step: .005, fmt: v => pc(v, 1) },
  { k: "elec", label: "Electricity", step: .002, fmt: v => `${(v * 100).toFixed(1)}¢/kWh` }
];
const EX_LINK = { price: ["Exhibit 3", "#ex-price"], decline: ["Exhibit 2", "#ex-ladder"], lock: ["Exhibit 4", "#ex-buyers"], elec: ["Exhibit 5", "#ex-sea"], life: ["Exhibit 4", "#ex-buyers"] };
let state = {}, market = null, recTab = "entrant";

function setPressed(name) { document.querySelectorAll("[data-sc]").forEach(b => b.setAttribute("aria-pressed", b.dataset.sc === name ? "true" : "false")); $("#sc-desc").textContent = name ? SCENARIO_LABELS[name] : "Custom case"; }
function applyScenario(name) {
  state = { ...getBase(), ...scenarioInputs(name) };
  SLIDERS.forEach(s => { $(`#s-${s.k}`).value = state[s.k]; });
  setPressed(name); render();
}

export function initModel(mk) {
  market = mk;
  state = getBase();
  $("#sliders").innerHTML = SLIDERS.map(s => `<div class="ctl"><label for="s-${s.k}">${s.label}<output id="o-${s.k}"></output></label>
    <input type="range" id="s-${s.k}" min="${s.min ?? LIMITS[s.k][0]}" max="${LIMITS[s.k][1]}" step="${s.step}" value="${state[s.k]}">${s.note ? `<small>${s.note}</small>` : ""}</div>`).join("");
  SLIDERS.forEach(s => $(`#s-${s.k}`).addEventListener("input", e => { state[s.k] = Number(e.target.value); setPressed(null); render(); }));
  document.querySelectorAll("[data-sc]").forEach(b => b.addEventListener("click", () => applyScenario(b.dataset.sc)));
  $("#gpu-reset").addEventListener("click", () => applyScenario("base"));
  if (mk?.assumptions) {
    $("#evidence").innerHTML = `<tr><th>Input</th><th>Base</th><th>Why this value</th></tr>` + Object.entries(mk.assumptions).map(([k, a]) => {
      const s = SLIDERS.find(x => x.k === k); const ex = EX_LINK[k];
      return `<tr><td>${esc(s ? s.label : k)}</td><td class="mono">${s ? s.fmt(a.value) : a.value}</td><td>${esc(a.why)} ${ex ? `<a href="${ex[1]}">${ex[0]}</a>` : a.basis === "analyst" ? `<span class="tag">analyst input</span>` : ""}</td></tr>`;
    }).join("");
  }
  const tabs = [["entrant", "New entrant buying today"], ["owner", "Owner of an existing fleet"], ["site", "Site owner in Southeast Asia"], ["lender", "Lender or investor"]];
  $("#rec-tabs").innerHTML = tabs.map(([id, l]) => `<button type="button" role="tab" data-rec="${id}" aria-selected="${id === recTab}">${l}</button>`).join("");
  $("#rec-tabs").addEventListener("click", e => { const b = e.target.closest("[data-rec]"); if (!b) return; recTab = b.dataset.rec; document.querySelectorAll("[data-rec]").forEach(x => x.setAttribute("aria-selected", x.dataset.rec === recTab)); renderRec(evaluate(state)); });
  setPressed("base"); render();
}

function solveDecline(st) {
  const f = d => evaluate({ ...st, decline: d }).npv;
  let lo = 0, hi = .45; if (f(lo) < 0) return null; if (f(hi) > 0) return .45;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

function render() {
  const e = evaluate(state); const p = e.inputs;
  SLIDERS.forEach(s => { $(`#o-${s.k}`).textContent = s.fmt(p[s.k]); });
  const set = (id, txt, cls = "") => { const el = $(id); el.textContent = txt; el.className = cls; };
  set("#k-npv", usd(Math.round(e.npv)), e.npv >= 0 ? "pos" : "neg");
  set("#k-npvc", usdM(e.npv * CLUSTER), e.npv >= 0 ? "pos" : "neg");
  set("#k-irr", e.irr === null ? "n/a" : pc(e.irr, 1), e.irr !== null && e.irr >= p.wacc ? "pos" : "neg");
  set("#k-pay", e.payback === null ? "Not within life" : `${e.payback.toFixed(1)} yrs`);
  set("#k-be", e.breakevenPrice === null ? "n/a" : hr(e.breakevenPrice));
  set("#k-bec", e.breakevenCapex === null ? "n/a" : usdK(e.breakevenCapex));
  const ok = e.npv >= 0;
  $("#gpu-answer").innerHTML = `<b>${ok ? (e.npv < 2000 ? "Yes, but only just." : "Yes.") : "No, not on these terms."}</b> At ${hr(p.price)} ${p.lock ? `locked for ${p.lock} year${p.lock > 1 ? "s" : ""}` : "with no contract"}, rent falling ${pc(p.decline)} a year after that, ${pc(p.utilization ?? p.util)} utilization and ${usdK(p.capex)} per GPU, one H100 is worth <b class="num">${usd(Math.round(e.npv))}</b> after a ${pc(p.wacc, 1)} cost of capital (IRR ${e.irr === null ? "n/a" : pc(e.irr, 1)}). ${ok ? "" : `It needs year-1 rent of at least <b class="num">${hr(e.breakevenPrice ?? 0)}</b>, or a price of no more than <b class="num">${usdK(e.breakevenCapex ?? 0)}</b> per GPU.`}`;
  let cum = 0; const line = e.flows.map(f => (cum += f));
  $("#ch-fcf").innerHTML = barLineChart({ labels: e.flows.map((_, i) => "Y" + i), bars: e.flows, line, tips: e.flows.map((f, i) => i === 0 ? `Purchase: ${usd(Math.round(f))}` : `Year ${i}: rent ${hr(e.rows[i - 1].price)}, cash flow ${usd(Math.round(f))}`) });
  $("#ch-tornado").innerHTML = tornadoChart(tornado(state));
  const g = lockCapexGrid(state);
  const cur = { lock: p.lock, capex: g.capexes.reduce((b, c) => Math.abs(c - p.capex) < Math.abs(b - p.capex) ? c : b) };
  $("#ch-grid").innerHTML = lockCapexChart(g, cur);
  const gap = e.ebitMargin6y - e.ebitMarginEcon;
  $("#acct-callout").innerHTML = `<b>Accounting versus economics</b><p>Booked with CoreWeave's 6-year depreciation, this GPU shows a year-1 operating margin of <b class="num">${pc(e.ebitMargin6y, 1)}</b>. With the ${p.life}-year economic life used here, the margin is <b class="num">${pc(e.ebitMarginEcon, 1)}</b>. ${Math.abs(gap) < .005 ? "The two lives match, so there is no gap." : gap > 0 ? `The ${pc(gap, 1)} gap is profit that shows up in the accounts only if the GPU really earns for six years.` : "A life longer than six years would make reported margins look lower than the economics."}</p>`;
  renderRec(e);
}

function renderRec(e) {
  const p = e.inputs;
  const minLock = (() => { for (let L = p.lock; L <= p.life; L++) { const n = evaluate({ ...state, lock: L }).npv; if (n >= 0) return { L, n }; } return null; })();
  const dStar = solveDecline(state);
  const yrsAboveCash = p.price > e.cashCost && p.decline > 0 ? Math.log(e.cashCost / p.price) / Math.log(1 - p.decline) : null;
  const H = market?.models?.find(m => m.label === "H100");
  const t = tornado(state); const elec = t.bars.find(b => b.key === "elec"); const elecRank = t.bars.findIndex(b => b.key === "elec") + 1;
  const sea = market?.manual?.seaPipeline; const seaTotal = sea ? sea.markets.reduce((s, m) => s + (m.pipeline || 0), 0) : null;
  const keep3 = Math.pow(1 - p.decline, 3);
  const R = {
    entrant: () => {
      const v = e.npv >= 0 ? ["go", "Go, carefully"] : minLock && minLock.L <= 3 ? ["cond", "Only with a contract"] : ["stop", "Don't buy on these terms"];
      return { v, head: e.npv >= 0 ? `The numbers work: ${usd(Math.round(e.npv))} per GPU above an ${pc(p.wacc, 1)} return, but the margin depends on how fast rent falls.` : `Buying H100s to rent on ${p.lock <= 1 ? "1-year" : `${p.lock}-year`} terms loses ${usd(Math.round(-e.npv))} per GPU, or ${usdM(-e.npv * CLUSTER)} on a 1,000-GPU cluster.`,
        do: [
          minLock ? (minLock.L > p.lock ? `Sign before you buy: locking ${hr(p.price)} for ${minLock.L} years turns NPV positive (${usd(Math.round(minLock.n))} per GPU).` : `Keep at least ${p.lock} year${p.lock > 1 ? "s" : ""} of contracted rent; it is what makes the case work.`) : `Even a contract for the GPU's whole life does not reach an ${pc(p.wacc, 1)} return at ${hr(p.price)}.`,
          `Or buy cheaper: pay no more than ${usdK(e.breakevenCapex)} per GPU all-in (the case assumes ${usdK(p.capex)}).`,
          `Or price higher: year-1 rent must be at least ${hr(e.breakevenPrice)}${H ? `; on-demand is ${hr(H.latest)} today but volume buyers pay less` : ""}.`
        ],
        flip: dStar !== null ? `If rent fell only ${pc(dStar)} a year instead of ${pc(p.decline)}, the base terms would break even. A long shortage could do that; the price ladder says it has not so far.` : "No realistic rent decline makes these terms work." };
    },
    owner: () => ({
      v: ["go", "Keep renting, lock it in"],
      head: `The purchase is sunk. What matters now is whether each hour earns more than it costs to run: ${hr(e.cashCost)} per billed hour.`,
      do: [
        yrsAboveCash !== null ? `At ${pc(p.decline)} a year, rent stays above that cash floor for about ${Math.max(0, yrsAboveCash).toFixed(1)} more years from ${hr(p.price)} today. Keep the fleet working until then.` : `Rent is already near the cash floor; idle capacity costs little, so price to fill.`,
        H && H.change > 0 ? `Rents are up ${spc(H.change)} this year. Pre-sell capacity on 2–3 year contracts now, before the ageing curve catches up.` : `Rents are soft; lengthen contracts with existing customers rather than cutting list prices.`,
        `Hold a price floor at the cash cost on spot and short deals; below it, every hour loses money.`
      ],
      flip: `Sell instead if a used GPU fetches more than the rent it has left to earn, which is more likely when a new generation drives used prices up.` }),
    site: () => ({
      v: ["cond", "Host first, buy GPUs only against contracts"],
      head: `Power and space are not a moat on their own: electricity ranks ${elecRank} of ${t.bars.length} value drivers in the model.`,
      do: [
        elec ? `A power price from ${elec.lowLabel} to ${elec.highLabel} moves NPV by only ${usd(Math.round(elec.swing))} per GPU, against ${usd(Math.round(t.bars[0].swing))} for ${t.bars[0].label.toLowerCase()}.` : "Power cost moves NPV less than rent and capex do.",
        seaTotal ? `${mw(seaTotal)} of new capacity is in the pipeline across Johor, Bangkok, Jakarta and Ho Chi Minh City. Expect competition for tenants.` : "Regional capacity is growing fast; expect competition for tenants.",
        `Lease space and power to GPU operators on long terms, or buy current-generation GPUs only once a customer has signed for them.`
      ],
      flip: `Rules that keep AI workloads and data in-country would favour local capacity and justify owning GPUs earlier.` }),
    lender: () => ({
      v: e.npv >= 0 ? ["cond", "Lend against contracts"] : ["stop", "Underwrite the contract, not the chip"],
      head: `On ${p.lock <= 1 ? "1-year" : `${p.lock}-year`} terms the project returns ${e.irr === null ? "n/a" : pc(e.irr, 1)}, ${e.irr !== null && e.irr >= p.wacc ? "above" : "below"} the ${pc(p.wacc, 1)} hurdle. The cash that repays debt is the contracted rent.`,
      do: [
        `Size the loan to contracted cash flow, and keep its term no longer than the contract.`,
        `Haircut the collateral: at ${pc(p.decline)} a year, a GPU's rent falls to ${pc(keep3)} of today's level in three years.`,
        `Set covenants on contract coverage, not on the 6-year life used in the borrower's accounts.`
      ],
      flip: `A deep, liquid market for used GPUs would support higher collateral values and longer loans.` })
  };
  const r = R[recTab]();
  $("#rec-body").innerHTML = `<div class="rec-card"><span class="verdict ${r.v[0]}">${esc(r.v[1])}</span><p class="rec-head">${esc(r.head)}</p>
    <div class="rec-cols"><div><span class="eyebrow">What to do</span><ul>${r.do.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div><span class="eyebrow">What would change this</span><p>${esc(r.flip)}</p></div></div></div>`;
}
