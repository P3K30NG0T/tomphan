# tomphan.

Portfolio of Tom Phan (Phan Nguyen Hong Quang). Static HTML/CSS/JS plus one Vercel serverless function.

## Projects
- **What is an H100 really worth?** NPV/IRR model of renting out one GPU (`assets/model.js`, `downloads/tomphan-h100-model.xlsx`).
- **Paid channels without the 30% toll.** Strategy memo with a payment-route calculator (`assets/memo.js`).
- **Analyst Copilot.** Claude calls the model's functions as tools (`api/copilot.js`, `assets/tools.js`).

## Deploy on Vercel
1. Push this folder to a GitHub repo.
2. In Vercel: Add New → Project → import the repo. Framework preset: **Other**. No build command. Output directory: leave empty (root).
3. Settings → Environment Variables:
   - `ANTHROPIC_API_KEY` (required for live copilot)
   - `COPILOT_DAILY_CAP` (optional, default 300 questions/day)
   - `COPILOT_PER_IP_HOUR` (optional, default 8)
   - `COPILOT_MODEL` (optional, default `claude-haiku-4-5-20251001`)
4. Redeploy. The copilot page switches from "Sample mode" to "Live" automatically.
5. In the Anthropic Console, set a monthly spend limit on the key as a hard stop.

Without the API key the site still works: sample questions replay the agent steps and compute every number in the browser.

## Add later, no code changes
- `assets/portrait.jpg`: a square photo (about 600×600). It replaces the "TP" circle on the home page.
- `resume.pdf` in the repo root: the Résumé links in the nav and hero appear on their own.
- `ANTHROPIC_API_KEY` in Vercel: the copilot switches to live mode.

## Change the site after it is live
Vercel redeploys on every commit to `main`, usually within a minute.
- Small text edits: open the file on github.com, click the pencil icon, edit, **Commit changes**.
- New files: **Add file → Upload files**, drop them into the right folder, commit.
- Where things live: page text in `index.html`; model assumptions in `assets/model.js`; memo inputs and Telegram facts in `assets/memo.js`; sample copilot questions in `assets/copilot.js`; CoreWeave figures in `data/gpu.json`; colors and fonts at the top of `assets/style.css`.
- If Vercel gives the project a domain other than `tomphan.vercel.app`, update the `og:image` URL in the `<head>` of `index.html` so link previews show the image.

## Local check
`python3 -m http.server` then open http://localhost:8000 (the copilot runs in sample mode locally).

## Data
All inputs and sources are in `data/gpu.json` and `assets/memo.js`. Independent analysis on public data; not investment advice.
