# tomphan.

Portfolio of Tom Phan (Phan Nguyen Hong Quang). One real business decision, followed on public data:
**after Rite Aid, what should Weis Markets do about pharmacy deserts?**

Live: https://tomphann.vercel.app · Independent analysis on public data; not affiliated with Weis Markets; not investment advice.

## The case in seven acts
| Act | Question | Status |
| --- | --- | --- |
| 1 · The shock | One-time event or lasting shift? | Published |
| 2 · Demand | Who is left behind, and where? | Published |
| 3 · Economics | Why does the old model lose money? | Published |
| 4 · Weis | What does Weis have to win with? | Published |
| 5 · New model | Can technology change the cost, and where first? | In progress |
| 6 · The money | Which of three options is worth it? | In progress |
| 7 · Decision | What to do, how to track it, when to stop? | In progress |

## How the data flows
1. `case/fetch/*.py` download open data on GitHub Actions (Actions → Case data fetch → Run workflow, input `act1`, `act1_demand`, `act2` or `act4`). Files and a request log land in `case/data/`.
2. `case/build/facts.json` holds facts from filings and reports, each with its source link.
3. `python3 case/build/build.py` writes `data/case.json`, the only file the site reads.
4. `python3 case/build/excel.py` writes `downloads/pharmacy-deserts-data.xlsx` (recalculate in Excel or LibreOffice to cache formula values).
5. Map shapes: `NODE_PATH=<dir with us-atlas, topojson-client, d3-geo> node case/build/geo.mjs`, then copy `case/data/geo_counties.json` to `data/geo.json`.

## Site
Static HTML/CSS/JS, no build step; Vercel framework preset **Other**. Pages: `index.html` + `assets/app.js` (all act pages), `assets/charts.js`, `assets/map.js`, `assets/style.css`.

Add later, no code changes: `assets/portrait.jpg` (square photo) and `resume.pdf` in the repo root.
