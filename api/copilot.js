// Vercel serverless function: Analyst Copilot (live mode)
// Needs the ANTHROPIC_API_KEY environment variable set in Vercel. The key never reaches the browser.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOL_DEFS, runTool } from "../assets/tools.js";
import { setBase } from "../assets/model.js";

// The latest market data published by the research harness; it also sets the model's base case.
let market = null;
try {
  market = JSON.parse(readFileSync(join(process.cwd(), "data", "market.json"), "utf8"));
  setBase(Object.fromEntries(Object.entries(market.assumptions || {}).map(([k, v]) => [k, v.value])));
} catch { market = null; }

const MODEL = process.env.COPILOT_MODEL || "claude-haiku-4-5-20251001";
const PER_IP_PER_HOUR = Number(process.env.COPILOT_PER_IP_HOUR || 8);
const DAILY_CAP = Number(process.env.COPILOT_DAILY_CAP || 300);
const MAX_QUESTION = 300;

const SYSTEM = `You are Analyst Copilot on the portfolio of Tom Phan (Phan Nguyen Hong Quang), a business planning analyst.
You answer questions about one case only: is buying AI GPUs (H100) to rent out a good business, and for whom?
It has a market study (rents by GPU model, the price ladder, contract prices, CoreWeave benchmarks, Southeast Asia capacity)
and a financial model of one H100 (NPV, IRR, payback, break-even rent and capex, scenarios, sensitivity).
Rules:
- Every number you state must come from a tool result in this conversation. Never estimate or recall figures.
- Translate the question into tool inputs. State the assumptions you changed.
- Answer in at most 90 words: one sentence with the answer, then up to three short bullets, then one line starting "So what:".
- Fractions in tools: 20% is 0.2. Money in USD.
- If the question is outside these projects, say so in one sentence and suggest a question you can answer.
- Reply in the language of the question (English or Vietnamese).`;

const hits = new Map();      // ip -> [timestamps]
let day = new Date().toISOString().slice(0, 10), dayCount = 0;

function limited(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= DAILY_CAP) return "The live copilot has reached today's limit. Try the sample questions.";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= PER_IP_PER_HOUR) return "You've asked a lot this hour. Try again later or use the sample questions.";
  list.push(now); hits.set(ip, list); dayCount++;
  return null;
}

async function callClaude(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, tools: TOOL_DEFS, messages })
  });
  if (!res.ok) throw new Error(`Model API returned ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method === "GET") { res.status(200).json({ live: Boolean(process.env.ANTHROPIC_API_KEY) }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: "Live mode is not configured yet.", fallback: true }); return; }
  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
  const question = String(body.question || "").trim().slice(0, MAX_QUESTION);
  if (!question) { res.status(400).json({ error: "Type a question first." }); return; }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const block = limited(ip);
  if (block) { res.status(429).json({ error: block, fallback: true }); return; }

  const steps = [];
  const messages = [{ role: "user", content: question }];
  try {
    for (let turn = 0; turn < 4; turn++) {
      const out = await callClaude(messages);
      const texts = out.content.filter(c => c.type === "text").map(c => c.text).join("\n").trim();
      const uses = out.content.filter(c => c.type === "tool_use");
      if (!uses.length) { steps.push({ type: "answer", text: texts }); break; }
      if (texts) steps.push({ type: "plan", text: texts });
      messages.push({ role: "assistant", content: out.content });
      const results = uses.map(u => {
        const result = runTool(u.name, u.input || {}, { market });
        steps.push({ type: "tool", name: u.name, args: u.input || {}, result });
        return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(result) };
      });
      messages.push({ role: "user", content: results });
    }
    if (!steps.some(s => s.type === "answer")) steps.push({ type: "answer", text: "I ran the tools above but stopped before writing a summary. Try a narrower question." });
    res.status(200).json({ mode: "live", steps });
  } catch (e) {
    res.status(502).json({ error: "The live model did not respond. The sample questions still work.", fallback: true });
  }
}
