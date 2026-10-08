// tomphan. research harness — one run = fetch open data → validate → compute → set assumptions → model + cross-check → (agent review) → publish.
// Runs on GitHub Actions (weekly and on demand). Writes data/market.json, data/runlog.json, data/runs.json and data/raw/*.
// Blocking checks stop the publish step: the site keeps the last good data.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GPU_SLUGS, AUTO, MANUAL, SEC_BASELINE } from "./sources.mjs";
import { setBase, evaluate, scenario, tornado, SCENARIO_LABELS } from "../assets/model.js";
import { reviewWithAgent } from "./agent.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const UA = "tomphan-portfolio-harness/1.0 (+https://github.com/P3K30NG0T/tomphan)";
// SEC asks automated clients to name a contact in the User-Agent (sec.gov/os/accessing-edgar-data).
const SEC_UA = `tomphan-portfolio-harness ${process.env.SEC_CONTACT || "89442471+P3K30NG0T@users.noreply.github.com"}`;
const now = new Date();
const sha = buf => createHash("sha256").update(buf).digest("hex").slice(0, 16);
const round = (x, d = 2) => x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d;
const median = a => { const s = [...a].filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

const log = {
  schema: 1,
  runId: process.env.GITHUB_RUN_ID || `local-${now.getTime()}`,
  runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  trigger: process.env.GITHUB_EVENT_NAME === "schedule" ? "weekly schedule" : process.env.GITHUB_EVENT_NAME === "workflow_dispatch" ? "manual" : "local",
  startedAt: now.toISOString(),
  steps: [], checks: [], sources: [], outcome: null
};

async function step(id, title, kind, tool, fn) {
  const t0 = Date.now();
  const entry = { id, title, kind, tool, status: "running" };
  log.steps.push(entry);
  try {
    const out = await fn();
    Object.assign(entry, { status: out?.status || "ok", ms: Date.now() - t0, summary: out?.summary || "", detail: out?.detail ?? null });
    return out;
  } catch (e) {
    Object.assign(entry, { status: "error", ms: Date.now() - t0, summary: e.message });
    return null;
  }
}
function check(id, label, pass, { blocking = false, detail = null, stepId } = {}) {
  log.checks.push({ id, label, result: pass ? "pass" : blocking ? "fail" : "warn", blocking, detail, step: stepId });
  return pass;
}
async function fetchBytes(url, tries = 3, ua = UA) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": ua, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 1500 * (i + 1))); }
  }
  throw last;
}
const prev = existsSync(join(DATA, "market.json")) ? JSON.parse(readFileSync(join(DATA, "market.json"), "utf8")) : null;
mkdirSync(join(DATA, "raw"), { recursive: true });

/* 1. Fetch GPU rental prices (open dataset) */
const gpu = {};
await step("fetch-gpu", "Fetch GPU rental price history", "tool", "fetch_gpu_prices", async () => {
  const got = [];
  for (const g of GPU_SLUGS) {
    const url = AUTO.getdeploying.file(g.slug);
    try {
      const buf = await fetchBytes(url);
      const json = JSON.parse(buf.toString("utf8"));
      writeFileSync(join(DATA, "raw", `gpu-${g.slug}.json`), buf);
      gpu[g.slug] = { ...g, meta: json.meta || {}, rows: json.data || [] };
      log.sources.push({ id: `gpu-${g.slug}`, title: `${AUTO.getdeploying.title}: ${g.label}`, url, bytes: buf.length, sha256: sha(buf), rows: (json.data || []).length, license: json.meta?.license || AUTO.getdeploying.license, kind: "auto" });
      got.push(`${g.label} ${(json.data || []).length} rows`);
    } catch (e) {
      log.sources.push({ id: `gpu-${g.slug}`, title: `${AUTO.getdeploying.title}: ${g.label}`, url, error: e.message, kind: "auto" });
    }
  }
  return { status: got.length === GPU_SLUGS.length ? "ok" : got.length ? "partial" : "error", summary: `Downloaded ${got.length} of ${GPU_SLUGS.length} files: ${got.join(", ")}` };
});

/* 2. Fetch CoreWeave filings (SEC XBRL) */
let coreweave = null;
await step("fetch-sec", "Fetch CoreWeave figures from SEC filings", "tool", "fetch_sec_facts", async () => {
  const out = { periods: [], unit: "USD millions" };
  const series = {};
  for (const [key, tag] of Object.entries(AUTO.sec.tags)) {
    const url = AUTO.sec.file(tag);
    const buf = await fetchBytes(url, 3, SEC_UA);
    const units = JSON.parse(buf.toString("utf8")).units?.USD || [];
    log.sources.push({ id: `sec-${key}`, title: `${AUTO.sec.title}: ${tag}`, url, bytes: buf.length, sha256: sha(buf), kind: "auto" });
    series[key] = units;
  }
  const fy = y => k => series[k].find(u => u.frame === `CY${y}` && u.form === "10-K");
  const years = [2023, 2024, 2025].filter(y => fy(y)("revenue"));
  for (const y of years) out.periods.push({ label: `FY${y}`, ...Object.fromEntries(Object.keys(series).map(k => [k, round((fy(y)(k)?.val ?? NaN) / 1e6, 0)])) });
  const ytdYear = Math.max(...series.revenue.map(u => +u.start.slice(0, 4)));
  const ytd = k => series[k].filter(u => u.form === "10-Q" && u.start === `${ytdYear}-01-01`).sort((a, b) => b.end.localeCompare(a.end))[0];
  const r = ytd("revenue");
  if (r) {
    const months = { "03": "Q1", "06": "H1", "09": "9M" }[r.end.slice(5, 7)] || "YTD";
    out.periods.push({ label: `${months} ${ytdYear}`, ...Object.fromEntries(Object.keys(series).map(k => [k, round((ytd(k)?.end === r.end ? ytd(k).val : NaN) / 1e6, 0)])) });
  }
  coreweave = out;
  return { summary: `${out.periods.map(p => p.label).join(", ")}: revenue, D&A, operating income, capex` };
});
if (!coreweave) {
  const cached = prev?.coreweave?.periods?.length ? { ...prev.coreweave, cached: "last good run" } : { ...JSON.parse(readFileSync(join(ROOT, "harness", "cache", "coreweave.json"), "utf8")), cached: "copy recorded 2026-10-07" };
  coreweave = cached;
  check("sec-fallback", `SEC API unreachable: using CoreWeave figures from the ${cached.cached}`, false, { stepId: "fetch-sec" });
}

/* 3. Validate */
await step("validate", "Validate the data before using it", "check", "run_checks", async () => {
  const h = gpu["nvidia-h100"];
  check("gpu-present", "H100 price file downloaded", !!h, { blocking: true, stepId: "validate" });
  if (h) {
    const okRows = h.rows.every(r => r.date && r.billing_type && Number.isFinite(+(r.provider_median_price ?? r.median_price)));
    check("gpu-schema", "Every row has a date, billing type and numeric price", okRows, { blocking: true, stepId: "validate" });
    const od = onDemand(h);
    check("gpu-units", "H100 on-demand prices are in a plausible USD/GPU-hr range (0.05–60)", od.every(r => r.p > 0.05 && r.p < 60), { blocking: true, stepId: "validate" });
    check("gpu-coverage", "At least 40 weeks of H100 on-demand history and 4+ providers in the latest week", od.length >= 40 && (od.at(-1)?.n ?? 0) >= 4, { blocking: true, stepId: "validate", detail: `${od.length} weeks; ${od.at(-1)?.n} providers` });
    const ageDays = od.length ? (now - new Date(od.at(-1).d)) / 864e5 : 999;
    check("gpu-fresh", "Latest complete week is under 21 days old", ageDays < 21, { stepId: "validate", detail: od.at(-1)?.d });
    const jumps = od.slice(1).map((r, i) => ({ d: r.d, chg: r.p / od[i].p - 1 })).filter(x => Math.abs(x.chg) > 0.25);
    check("gpu-jumps", "No week-on-week H100 price move above 25%", jumps.length === 0, { stepId: "validate", detail: jumps.length ? jumps.map(j => `${j.d}: ${Math.round(j.chg * 100)}%`).join("; ") : null });
    const latest = mean(od.slice(-4).map(r => r.p));
    const gap = latest / MANUAL.trendsSnapshot.value - 1;
    check("gpu-cross", `Dataset agrees with the published H100 median ($${MANUAL.trendsSnapshot.value}) within 15%`, Math.abs(gap) < 0.15, { stepId: "validate", detail: `dataset 4-week avg $${round(latest)} (${gap >= 0 ? "+" : ""}${Math.round(gap * 100)}%)` });
  }
  if (coreweave) {
    const fy25 = coreweave.periods.find(p => p.label === "FY2025");
    const same = fy25 && Object.entries(SEC_BASELINE.FY2025).every(([k, v]) => Math.abs((fy25[k] ?? NaN) - v) <= 1);
    check("sec-match", "CoreWeave FY2025 figures match the values first recorded (no restatement)", !!same, { stepId: "validate", detail: fy25 ? `revenue ${fy25.revenue}, D&A ${fy25.dna}` : "FY2025 missing" });
  }
  const fails = log.checks.filter(c => c.result === "fail").length, warns = log.checks.filter(c => c.result === "warn").length;
  return { status: fails ? "error" : warns ? "warn" : "ok", summary: `${log.checks.filter(c => c.result === "pass").length} passed, ${warns} warnings, ${fails} blocking failures` };
});

function onDemand(g) {
  const prov = g.meta?.provisional_week;
  return g.rows.filter(r => r.billing_type === "ON_DEMAND" && r.date !== prov)
    .map(r => ({ d: r.date, p: +(r.provider_median_price ?? r.median_price), lo: +r.min_price, hi: +r.max_price, n: r.provider_count }))
    .sort((a, b) => a.d.localeCompare(b.d));
}

/* 4. Compute market statistics */
let stats = null;
await step("stats", "Compute market statistics", "tool", "market_stats", async () => {
  const models = [];
  for (const g of GPU_SLUGS) {
    const x = gpu[g.slug]; if (!x) continue;
    const od = onDemand(x); if (od.length < 8) continue;
    const latest = mean(od.slice(-4).map(r => r.p)), first = mean(od.slice(0, 4).map(r => r.p));
    const weeks = (new Date(od.at(-1).d) - new Date(od[0].d)) / (7 * 864e5);
    const spot = x.rows.filter(r => r.billing_type === "SPOT" && od.slice(-4).some(o => o.d === r.date)).map(r => +(r.provider_median_price ?? r.median_price));
    models.push({ slug: g.slug, label: g.label, available: g.available, latest: round(latest), first: round(first), weeks: Math.round(weeks), change: weeks >= 40 ? round(latest / first - 1, 3) : null, providers: od.at(-1).n, spotRatio: spot.length ? round(median(spot) / latest, 2) : null, series: od.map(r => [r.d, round(r.p, 3)]) });
  }
  // Price ladder: today's rent vs. how long each GPU has been on the market
  const asOf = now.getFullYear() + now.getMonth() / 12;
  const pts = models.map(m => ({ age: asOf - m.available, y: Math.log(m.latest), label: m.label }));
  let ladder = null;
  if (pts.length >= 3) {
    const mx = mean(pts.map(p => p.age)), my = mean(pts.map(p => p.y));
    const b = pts.reduce((s, p) => s + (p.age - mx) * (p.y - my), 0) / pts.reduce((s, p) => s + (p.age - mx) ** 2, 0);
    const a = my - b * mx;
    const ssr = pts.reduce((s, p) => s + (p.y - (a + b * p.age)) ** 2, 0), sst = pts.reduce((s, p) => s + (p.y - my) ** 2, 0);
    ladder = { annualDecline: round(1 - Math.exp(b), 3), r2: round(1 - ssr / sst, 2), points: pts.map(p => ({ label: p.label, age: round(p.age, 1), price: round(Math.exp(p.y)) })), intercept: round(a, 4), slope: round(b, 4) };
  }
  // Contract terms: H100 reserved prices vs on-demand, last 8 complete weeks
  const h = gpu["nvidia-h100"];
  const terms = [];
  if (h) {
    const od = onDemand(h), recent = new Set(od.slice(-8).map(r => r.d)), odRecent = mean(od.slice(-8).map(r => r.p));
    for (const m of [1, 3, 6, 12, 24, 36]) {
      const rows = h.rows.filter(r => r.billing_type === "RESERVATION" && r.reservation_months === m && recent.has(r.date));
      if (!rows.length) continue;
      const p = median(rows.map(r => +(r.provider_median_price ?? r.median_price)));
      terms.push({ months: m, price: round(p), discount: round(1 - p / odRecent, 3), providers: Math.max(...rows.map(r => r.provider_count)) });
    }
  }
  stats = { models, ladder, terms };
  const H = models.find(m => m.label === "H100");
  if (!H) return { status: "error", summary: "No usable price history, nothing computed" };
  return { summary: `${models.length} GPU models; H100 on-demand $${H?.latest}/hr (${H?.change >= 0 ? "+" : ""}${Math.round((H?.change ?? 0) * 100)}% over ${H?.weeks} weeks); price ladder implies ${Math.round((ladder?.annualDecline ?? 0) * 100)}% a year (R² ${ladder?.r2}); ${terms.length} contract terms` };
});

/* 5. Set evidence-based assumptions */
let assumptions = null;
await step("assumptions", "Turn evidence into model assumptions", "tool", "set_assumptions", async () => {
  const lad = stats?.ladder;
  const decline = lad && lad.r2 >= 0.6 ? Math.min(0.40, Math.max(0.08, lad.annualDecline)) : 0.15;
  const r12 = stats?.terms.find(t => t.months === 12);
  assumptions = {
    price: { value: MANUAL.contract1y.value, basis: "contract", why: "Year-1 rent = the H100 1-year contract index: what a buyer of capacity actually signs.", source: "contract1y", crossCheck: r12 ? `Dataset 12-month reserved median $${r12.price} (${r12.providers} providers)` : null },
    decline: { value: round(decline, 2), basis: lad ? "price ladder" : "fallback", why: lad ? `Older GPUs rent for less: across ${lad.points.length} models, rent falls about ${Math.round(lad.annualDecline * 100)}% per year of age (R² ${lad.r2}).` : "Ladder fit too weak; analyst fallback.", source: "getdeploying" },
    lock: { value: 1, basis: "analyst", why: "Base case signs 1-year contracts and re-prices at market each year." },
    util: { value: 0.85, basis: "analyst", why: "No open data on fleet utilization; 85% leaves room for maintenance and gaps between contracts." },
    capex: { value: 35000, basis: "analyst", why: "All-in cost per GPU incl. server share, network and storage. No open price series; tested from $20k to $40k." },
    elec: { value: round(MANUAL.power.value, 3), basis: "source", why: "US industrial average.", source: "power" },
    life: { value: 5, basis: "analyst", why: "Between the 2–3 years critics argue and the 6 years used in accounts." },
    wacc: { value: 0.11, basis: "analyst", why: "Equity-heavy financing for a new operator." }
  };
  setBase(Object.fromEntries(Object.entries(assumptions).map(([k, v]) => [k, v.value])));
  return { summary: `rent $${assumptions.price.value}/hr (${assumptions.price.basis}), decline ${Math.round(assumptions.decline.value * 100)}%/yr (${assumptions.decline.basis}), life ${assumptions.life.value} yrs, capex $${assumptions.capex.value / 1000}k` };
});

/* 6. Run the model and cross-check it */
let results = null;
await step("model", "Run the model and cross-check it in Python", "tool", "run_model + reconcile", async () => {
  const base = evaluate({});
  const py = JSON.parse(execFileSync("python3", [join(ROOT, "harness", "reconcile.py"), JSON.stringify(base.inputs)]).toString());
  const diff = Math.abs(py.npv - base.npv);
  check("model-reconcile", "JavaScript and Python give the same NPV (within $1)", diff < 1, { blocking: true, stepId: "model", detail: `JS ${round(base.npv)} vs Python ${round(py.npv)}` });
  const sc = Object.fromEntries(["bull", "base", "bear"].map(s => { const e = scenario(s); return [s, { label: SCENARIO_LABELS[s], npv: round(e.npv, 0), irr: round(e.irr, 4), payback: round(e.payback, 2), inputs: e.inputs }]; }));
  const t = tornado({});
  results = { base: { npv: round(base.npv, 0), irr: round(base.irr, 4), payback: round(base.payback, 2), breakevenPrice: round(base.breakevenPrice), breakevenCapex: round(base.breakevenCapex, -2), cashCost: round(base.cashCost) }, scenarios: sc, topDrivers: t.bars.slice(0, 3).map(b => ({ driver: b.label, swing: round(b.swing, 0) })) };
  return { summary: `Base NPV $${results.base.npv} per GPU, IRR ${round(base.irr * 100, 1)}%; Python check differs by $${round(diff, 4)}`, detail: { py: { npv: round(py.npv), irr: round(py.irr, 4) } } };
});

/* 7. Agent review (needs ANTHROPIC_API_KEY; numbers it writes must exist in the evidence) */
let findings = null;
await step("agent-review", "Agent drafts key findings; every number is checked against the evidence", "agent", "draft_findings + grounding_check", async () => {
  const evidence = { stats: { models: stats?.models.map(({ series, ...m }) => m), ladder: stats?.ladder, terms: stats?.terms }, assumptions: Object.fromEntries(Object.entries(assumptions || {}).map(([k, v]) => [k, v.value])), results, manual: { contract1y: MANUAL.contract1y, hyperscalerGap: MANUAL.hyperscalerGap } };
  const r = await reviewWithAgent(evidence);
  if (r.skipped) return { status: "skipped", summary: r.reason };
  findings = r.accepted;
  check("agent-grounding", "Every number in the agent's draft appears in the evidence", r.rejected.length === 0, { stepId: "agent-review", detail: r.rejected.length ? r.rejected.map(x => `rejected: "${x.title}" (${x.unmatched.join(", ")})`).join("; ") : `${r.accepted.length} findings accepted` });
  return { summary: `${r.accepted.length} findings accepted, ${r.rejected.length} rejected by the grounding check (${r.model})`, detail: { accepted: r.accepted, rejected: r.rejected } };
});

/* 8. Publish */
const blocking = log.checks.filter(c => c.result === "fail");
log.finishedAt = new Date().toISOString();
log.outcome = blocking.length ? "held" : "published";
await step("publish", blocking.length ? "Hold: blocking checks failed, site keeps last good data" : "Publish data for the site", "tool", "write_outputs", async () => {
  if (blocking.length) return { status: "error", summary: blocking.map(c => c.label).join("; ") };
  const H = stats.models.find(m => m.label === "H100");
  const market = {
    asOf: H.series.at(-1)[0], generatedAt: log.finishedAt, runId: log.runId,
    models: stats.models, ladder: stats.ladder, terms: stats.terms, assumptions, results, findings,
    coreweave: { ...coreweave, facts: MANUAL.coreweave.facts },
    manual: MANUAL,
    attribution: "GPU price data: GetDeploying (getdeploying.com), CC BY 4.0. CoreWeave figures: SEC EDGAR."
  };
  writeFileSync(join(DATA, "market.json"), JSON.stringify(market, null, 1));
  return { summary: `Wrote data/market.json (as of ${market.asOf})` };
});
writeFileSync(join(DATA, "runlog.json"), JSON.stringify(log, null, 1));
const hist = existsSync(join(DATA, "runs.json")) ? JSON.parse(readFileSync(join(DATA, "runs.json"), "utf8")) : [];
hist.unshift({ runId: log.runId, at: log.startedAt, trigger: log.trigger, outcome: log.outcome, passed: log.checks.filter(c => c.result === "pass").length, warnings: log.checks.filter(c => c.result === "warn").length, failed: blocking.length, url: log.runUrl });
writeFileSync(join(DATA, "runs.json"), JSON.stringify(hist.slice(0, 12), null, 1));
console.log(JSON.stringify({ outcome: log.outcome, steps: log.steps.map(s => `${s.status.padEnd(7)} ${s.title}: ${s.summary}`), checks: log.checks.map(c => `${c.result} ${c.label}${c.detail ? " — " + c.detail : ""}`) }, null, 1));
if (blocking.length) process.exitCode = 1;
