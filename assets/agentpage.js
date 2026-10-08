// tomphan. — Step 3: the harness page and the home-page run card, built from data/runlog.json and data/runs.json.
import { $, esc, dateLabel } from "./fmt.js";

const STATUS = { ok: ["ok", "Done"], warn: ["warn", "Done with warnings"], partial: ["warn", "Partly done"], skipped: ["skip", "Skipped"], error: ["err", "Failed"] };
const CHECK = { pass: ["ok", "Pass"], warn: ["warn", "Warning"], fail: ["err", "Blocking"] };
const KIND = { tool: "Tool", check: "Checks", agent: "Agent" };
const when = iso => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const kb = b => b ? `${Math.round(b / 1024)} KB` : "";

export function renderHomeRun(log) {
  if (!log) { $("#home-run").innerHTML = `<div class="mini-step"><span class="k">Run log</span>Not available.</div>`; return; }
  const passed = log.checks.filter(c => c.result === "pass").length;
  const show = log.steps.filter(s => ["fetch-gpu", "validate", "stats", "model"].includes(s.id));
  $("#home-run").innerHTML = `<div class="run-chip"><span class="pill">${log.outcome === "published" ? "Published" : "Held back"}</span><span>${esc(when(log.startedAt))} · ${passed}/${log.checks.length} checks passed</span></div>` +
    show.map(s => `<div class="mini-step"><span class="k">${esc(s.tool)}</span>${esc(s.summary)}</div>`).join("");
}

export function renderAgent(log, runs) {
  const tools = [
    ["fetch_gpu_prices", "Download weekly rents for 5 GPU models"],
    ["fetch_sec_facts", "Pull CoreWeave figures from SEC filings"],
    ["run_checks", "Validate units, coverage, freshness, jumps"],
    ["market_stats", "Rents, yearly change, ladder, contract terms"],
    ["set_assumptions", "Turn evidence into the model's base case"],
    ["run_model + reconcile", "NPV in JavaScript, re-checked in Python"],
    ["draft_findings", "Write findings; numbers checked against evidence"],
    ["write_outputs", "Publish only if no blocking check failed"]
  ];
  $("#h-tools").innerHTML = tools.map(([n, d]) => `<li><span class="mono">${esc(n)}</span><small>${esc(d)}</small></li>`).join("");
  if (!log) { $("#run-meta").textContent = "Run log not available."; return; }
  const passed = log.checks.filter(c => c.result === "pass").length, warns = log.checks.filter(c => c.result === "warn").length;
  $("#run-title").textContent = log.outcome === "published" ? "What the agent did last time" : "Last run was held back by a check";
  $("#run-meta").innerHTML = `${esc(when(log.startedAt))} · ${log.trigger === "manual" ? "started manually" : log.trigger === "weekly schedule" ? "weekly schedule" : esc(log.trigger)} · ${passed} checks passed, ${warns} warning${warns === 1 ? "" : "s"} · ${log.outcome === "published" ? "published to this site" : "site kept the previous data"}${log.runUrl ? ` · <a href="${log.runUrl}" target="_blank" rel="noopener">open on GitHub</a>` : ""}`;
  const stepHtml = s => { const st = STATUS[s.status] || ["skip", s.status]; return `<li class="r-step"><div class="r-top"><span class="chip ${st[0]}">${st[1]}</span><span class="k">${esc(KIND[s.kind] || s.kind)} · ${esc(s.tool)}</span>${s.ms !== undefined ? `<span class="ms">${(s.ms / 1000).toFixed(1)} s</span>` : ""}</div><b>${esc(s.title)}</b><p>${esc(s.summary)}</p></li>`; };
  const draw = () => { $("#run-steps").innerHTML = log.steps.map(stepHtml).join(""); };
  draw();
  $("#replay").onclick = async () => {
    const ol = $("#run-steps"); ol.innerHTML = ""; $("#replay").disabled = true;
    for (const s of log.steps) { ol.insertAdjacentHTML("beforeend", stepHtml(s)); await new Promise(r => setTimeout(r, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450)); }
    $("#replay").disabled = false;
  };
  $("#run-checks").innerHTML = log.checks.map(c => { const r = CHECK[c.result]; return `<li><span class="chip ${r[0]}">${r[1]}</span><span>${esc(c.label)}${c.detail ? `<small>${esc(c.detail)}</small>` : ""}</span></li>`; }).join("");
  $("#run-sources").innerHTML = `<tr><th>Source</th><th class="n">Size</th><th>Fingerprint</th></tr>` + log.sources.map(s => `<tr><td><a href="${s.url}" target="_blank" rel="noopener">${esc(s.title.replace("GetDeploying GPU Rental Price History (CC BY 4.0): ", "GetDeploying: "))}</a>${s.error ? `<small class="err-t">${esc(s.error)}</small>` : ""}</td><td class="n">${kb(s.bytes)}${s.rows ? `<small>${s.rows} rows</small>` : ""}</td><td class="mono">${s.sha256 || "–"}</td></tr>`).join("");
  $("#run-history").innerHTML = (runs || []).map(r => `<li><span class="chip ${r.outcome === "published" ? "ok" : "err"}">${r.outcome === "published" ? "Published" : "Held"}</span><span>${esc(when(r.at))} · ${esc(r.trigger)} · ${r.passed} passed${r.warnings ? `, ${r.warnings} warning${r.warnings > 1 ? "s" : ""}` : ""}</span>${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">log</a>` : ""}</li>`).join("");
}
