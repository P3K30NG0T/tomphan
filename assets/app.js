// tomphan. — router and boot. Loads the harness outputs, sets the model's base case from them, renders each view.
import { $, usd, usdK, pc, spc, hr } from "./fmt.js";
import { setBase, evaluate } from "./model.js";
import { initTips } from "./charts.js";
import { renderResearch, researchFacts } from "./research.js";
import { initModel } from "./modelpage.js";
import { renderAgent, renderHomeRun } from "./agentpage.js";
import { initCopilot } from "./copilot.js";

/* ---------- router ---------- */
const VIEWS = ["home", "research", "model", "agent"];
const ALIAS = { gpu: "model", copilot: "agent", work: "home", about: "home" };
const ANCHORS = { "ex-trend": "research", "ex-ladder": "research", "ex-price": "research", "ex-buyers": "research", "ex-sea": "research", rec: "model", "ex-tornado": "model", "run-log": "agent", ask: "agent" };
function route() {
  const h = (location.hash || "#home").slice(1);
  const view = VIEWS.includes(h) ? h : ALIAS[h] || ANCHORS[h] || "home";
  VIEWS.forEach(v => { $(`#view-${v}`).hidden = v !== view; });
  document.querySelectorAll("[data-nav]").forEach(a => { if (a.dataset.nav === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (VIEWS.includes(h)) window.scrollTo(0, 0);
  else requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView());
}
window.addEventListener("hashchange", route);
document.addEventListener("click", e => {
  const s = e.target.closest("[data-scroll]");
  if (s) { e.preventDefault(); if (location.hash && location.hash !== "#home") location.hash = "home"; setTimeout(() => document.getElementById(s.dataset.scroll)?.scrollIntoView({ behavior: "smooth" }), 30); }
  const c = e.target.closest("[data-copy]");
  if (c) {
    const el = document.getElementById(c.dataset.copy);
    const select = () => { const r = document.createRange(); r.selectNodeContents(el); const g = getSelection(); g.removeAllRanges(); g.addRange(r); };
    try { navigator.clipboard.writeText(el.textContent).then(() => { c.textContent = "Copied"; setTimeout(() => c.textContent = "Copy", 1500); }, select); } catch { select(); }
  }
});

/* ---------- home ---------- */
function renderHome(mk) {
  const f = researchFacts(mk);
  const e = evaluate({});
  $("#q-answers").innerHTML = `
    <div><b>Rents are rising</b><span>H100 ${spc(f.H.change)} in a year; the newest chips faster still.</span></div>
    <div><b>Each GPU ages fast</b><span>About ${pc(f.decline)} of its rent lost per year on the market.</span></div>
    <div><b>Buying today: ${e.npv >= 0 ? "it works" : "only with conditions"}</b><span>${e.npv >= 0 ? `NPV ${usd(Math.round(e.npv))} per GPU` : `NPV ${usd(Math.round(e.npv))} per GPU on 1-year deals; contracts and price decide it`}.</span></div>`;
  $("#home-research-metrics").innerHTML = `<div><b>${spc(f.H.change)}</b><span>H100 rent, 12 months</span></div><div><b>${pc(f.decline)}/yr</b><span>rent lost with age</span></div><div><b>R² ${f.r2}</b><span>ladder fit, 5 models</span></div>`;
  $("#home-model-metrics").innerHTML = `<div><b>${usd(Math.round(e.npv))}</b><span>base NPV per GPU</span></div><div><b>${hr(e.breakevenPrice)}</b><span>break-even rent</span></div><div><b>${usdK(e.breakevenCapex)}</b><span>max capex</span></div>`;
}

/* ---------- optional files: add assets/portrait.jpg or resume.pdf and they appear ---------- */
function optionalFiles() {
  const img = new Image(); img.alt = "Portrait of Tom Phan";
  img.onload = () => { const p = $(".portrait"); p.textContent = ""; p.removeAttribute("aria-hidden"); p.appendChild(img); };
  img.src = "assets/portrait.jpg";
  fetch("resume.pdf", { method: "HEAD" }).then(r => { if (r.ok && (r.headers.get("content-type") || "").includes("pdf")) document.querySelectorAll("[data-resume]").forEach(a => { a.hidden = false; }); }).catch(() => {});
}

/* ---------- boot ---------- */
const getJSON = url => fetch(url, { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
initTips();
route();
optionalFiles();
const [market, runlog, runs] = await Promise.all([getJSON("data/market.json"), getJSON("data/runlog.json"), getJSON("data/runs.json")]);
if (market) setBase(Object.fromEntries(Object.entries(market.assumptions).map(([k, v]) => [k, v.value])));
if (market) { renderHome(market); renderResearch(market); }
initModel(market);
renderHomeRun(runlog);
renderAgent(runlog, runs);
initCopilot({ market });
route();
