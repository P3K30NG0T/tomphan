// tomphan. harness — the LLM step. The agent drafts findings; a deterministic check rejects any finding
// that states a number not present in the evidence it was given. No key → the step is skipped, nothing breaks.

const MODEL = process.env.HARNESS_MODEL || "claude-haiku-4-5-20251001";

const PROMPT = `You are the research agent in a market study of renting out AI GPUs.
Write exactly 3 key findings for a business reader, from the evidence JSON only.
Rules:
- Each finding: a "title" (max 9 words, states the conclusion) and a "text" (max 35 words).
- Use only numbers that appear in the evidence. Fractions may be written as percentages (0.16 -> 16%). Round as the evidence is rounded.
- No advice, no hype, no numbers you derived yourself.
Return only a JSON array: [{"title": "...", "text": "..."}]`;

export function allowedNumbers(evidence) {
  const vals = [];
  const walk = v => {
    if (typeof v === "number" && Number.isFinite(v)) {
      vals.push(v, Math.abs(v));
      if (Math.abs(v) <= 1.5) vals.push(v * 100, Math.abs(v * 100));
      if (Math.abs(v) >= 1000) vals.push(v / 1000, Math.abs(v / 1000), v / 1e6, Math.abs(v / 1e6));
    } else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(evidence);
  return vals;
}

export function numbersIn(text) {
  const out = [];
  const re = /(-|−)?\$?(\d[\d,]*(?:\.\d+)?)\s*(%|k\b|bn\b|m\b|M\b)?/g;
  let m;
  while ((m = re.exec(text))) {
    let n = parseFloat(m[2].replace(/,/g, ""));
    if (m[1]) n = -n;
    out.push({ raw: m[0].trim(), n });
  }
  return out;
}

export function grounded(n, allowed) {
  if (Number.isInteger(n) && ((n >= 0 && n <= 12) || (n >= 2019 && n <= 2031))) return true; // counts, years
  return allowed.some(a => [0, 1, 2].some(d => Math.abs(n - Math.round(a * 10 ** d) / 10 ** d) < 1e-9) || Math.abs(n - a) < 1e-9);
}

export async function reviewWithAgent(evidence) {
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: true, reason: "Skipped: no ANTHROPIC_API_KEY set for the harness. Deterministic steps still ran." };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 800, system: PROMPT, messages: [{ role: "user", content: JSON.stringify(evidence) }] }),
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`Model API returned ${res.status}`);
  const body = await res.json();
  const text = body.content.filter(c => c.type === "text").map(c => c.text).join("");
  const json = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  const allowed = allowedNumbers(evidence);
  const accepted = [], rejected = [];
  for (const f of json.slice(0, 3)) {
    const unmatched = numbersIn(`${f.title} ${f.text}`).filter(x => !grounded(x.n, allowed)).map(x => x.raw);
    (unmatched.length ? rejected : accepted).push(unmatched.length ? { ...f, unmatched } : { title: f.title, text: f.text });
  }
  return { accepted, rejected, model: MODEL };
}
