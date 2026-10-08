# tomphan.

Portfolio of Tom Phan (Phan Nguyen Hong Quang). One business question, answered on open data:
**is buying AI GPUs to rent out still a good business, and for whom?**

Live: https://tomphann.vercel.app

## The case in three steps
1. **Market research** (`#research`): rents by GPU model, the price ladder (rent lost per year of age), contract prices, CoreWeave benchmarks, Southeast Asia capacity. Built from `data/market.json`.
2. **Financial evaluation** (`#model`): NPV, IRR, payback, break-even rent and capex for one H100, scenarios, sensitivity, and a recommendation for four perspectives. Model in `assets/model.js`; Excel version in `downloads/`.
3. **Agent harness** (`#agent`): the pipeline in `harness/` that fetches, checks and computes the data above, plus an agent you can question (`api/copilot.js`).

## The research harness
`harness/run.mjs` runs on GitHub Actions every Monday and on demand (Actions → Research harness → Run workflow):

| Step | Tool | What it does |
| --- | --- | --- |
| 1 | `fetch_gpu_prices` | Downloads the GetDeploying GPU price dataset (CC BY 4.0) for A100, H100, H200, B200, B300 |
| 2 | `fetch_sec_facts` | Pulls CoreWeave revenue, D&A, operating income and capex from SEC XBRL (falls back to a recorded copy if SEC is unreachable) |
| 3 | `run_checks` | Schema, units, coverage, freshness, week-on-week jumps, cross-source agreement |
| 4 | `market_stats` | Latest rents, yearly change, contract-term prices, price-ladder fit |
| 5 | `set_assumptions` | Turns evidence into the model's base case; analyst inputs are labelled |
| 6 | `run_model + reconcile` | Runs the model in JavaScript and in `harness/reconcile.py`; blocks if they differ by more than $1 |
| 7 | `draft_findings` | Optional: Claude drafts key findings; any number not in the evidence is rejected |
| 8 | `write_outputs` | Publishes `data/market.json` only if no blocking check failed; always writes `data/runlog.json` and `data/runs.json` |

Sources and analyst inputs live in `harness/sources.mjs`.

## Deploy (Vercel)
Framework preset **Other**, no build command. Environment variables (Settings → Environment Variables):
- `ANTHROPIC_API_KEY`: turns on the live agent on `#agent` (otherwise sample mode). Set a monthly spend limit on the key in the Anthropic Console.
- Optional: `COPILOT_DAILY_CAP` (default 300), `COPILOT_PER_IP_HOUR` (default 8), `COPILOT_MODEL` (default `claude-haiku-4-5-20251001`).

For agent-drafted findings in the weekly run, add the same key as a GitHub secret named `ANTHROPIC_API_KEY` (Settings → Secrets and variables → Actions).

## Add later, no code changes
- `assets/portrait.jpg`: a square photo; it replaces the "TP" circle.
- `resume.pdf` in the repo root: the Résumé links appear on their own.

## Change the site
Vercel redeploys on every commit to `main`. Small text edits: open the file on github.com, click the pencil, commit.
Page text: `index.html`. Exhibit wording: `assets/research.js`. Recommendations: `assets/modelpage.js`. Agent sample questions: `assets/copilot.js`. Colors and fonts: top of `assets/style.css`.
Rebuild the Excel file after a data refresh: `python3 scripts/build_excel.py`, then recalculate in Excel or LibreOffice.

Independent analysis on open data. Not investment advice. GPU price data: GetDeploying (getdeploying.com), CC BY 4.0.
