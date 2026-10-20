"""Act 1 data fetch: how many pharmacies exist, and how much medicine Americans use.

Runs on GitHub Actions (the dev shell cannot reach these sites). Writes small filtered
CSV/JSON files to case/data/act1/ plus fetchlog.json describing every request.

Sources
- BLS QCEW open data (establishments, jobs, wages), NAICS 446110 (to 2021) / 456110 (2022+),
  annual averages and quarters, US + Weis's 7 states + their counties.
- Census County Business Patterns API (cross-check of establishment counts).
- CMS Medicare Part D Prescribers by Geography and Drug (national claims per year).
"""
import csv, io, json, sys, time, hashlib, datetime, urllib.request, urllib.error

OUT = "case/data/act1"
UA = {"User-Agent": "tomphan-research/1.0 (89442471+P3K30NG0T@users.noreply.github.com)"}
STATES = {"42": "PA", "24": "MD", "36": "NY", "51": "VA", "34": "NJ", "10": "DE", "54": "WV"}
log = []


def get(url, tries=3):
    for i in range(tries):
        t = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                b = r.read()
            log.append({"url": url, "status": 200, "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()[:16], "s": round(time.time() - t, 1)})
            return b
        except urllib.error.HTTPError as e:
            log.append({"url": url, "status": e.code, "try": i + 1})
            if e.code == 404:
                return None
        except Exception as e:  # network hiccup
            log.append({"url": url, "error": str(e)[:200], "try": i + 1})
        time.sleep(3 * (i + 1))
    return None


def write_csv(path, rows, cols):
    with open(f"{OUT}/{path}", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def qcew():
    """Annual averages 2001+ and quarters 2019+ for private-sector pharmacies."""
    this_year = datetime.date.today().year
    annual, quarterly, county = [], [], []
    keep_area = {"US000"} | {f"{s}000" for s in STATES}
    for year in range(2001, this_year + 1):
        code = "446110" if year < 2022 else "456110"
        for q in (["a"] + (["1", "2", "3", "4"] if year >= 2019 else [])):
            b = get(f"https://data.bls.gov/cew/data/api/{year}/{q}/industry/{code}.csv")
            if not b:
                continue
            for r in csv.DictReader(io.StringIO(b.decode("utf-8", "replace"))):
                if r.get("own_code") != "5":
                    continue
                a = r["area_fips"]
                base = {"year": year, "naics": code, "area_fips": a, "disclosure": r.get("disclosure_code", "")}
                if q == "a":
                    row = {**base, "estabs": r["annual_avg_estabs"], "jobs": r["annual_avg_emplvl"],
                           "wages": r["total_annual_wages"], "avg_pay": r["avg_annual_pay"]}
                    if a in keep_area:
                        annual.append(row)
                    elif a[:2] in STATES and not a.endswith("000") and a[2:].isdigit():
                        county.append(row)
                elif a in keep_area:
                    quarterly.append({**base, "qtr": q, "estabs": r["qtrly_estabs"], "jobs": r["month3_emplvl"],
                                      "wages": r["total_qtrly_wages"]})
    cols = ["year", "naics", "area_fips", "estabs", "jobs", "wages", "avg_pay", "disclosure"]
    write_csv("qcew_annual.csv", annual, cols)
    write_csv("qcew_county_annual.csv", county, cols)
    write_csv("qcew_quarterly.csv", quarterly, ["year", "qtr", "naics", "area_fips", "estabs", "jobs", "wages", "disclosure"])
    return {"annual_rows": len(annual), "county_rows": len(county), "quarter_rows": len(quarterly)}


def cbp():
    rows = []
    for year in range(2012, datetime.date.today().year):
        var = "NAICS2012" if year < 2017 else ("NAICS2017" if year < 2023 else "NAICS2022")
        code = "446110" if year < 2023 else "456110"
        for geo in ["us:*", "state:" + ",".join(STATES)]:
            b = get(f"https://api.census.gov/data/{year}/cbp?get=ESTAB,EMP,PAYANN&for={geo}&{var}={code}")
            if not b:
                continue
            try:
                data = json.loads(b)
            except ValueError:
                continue
            head = data[0]
            for d in data[1:]:
                r = dict(zip(head, d))
                rows.append({"year": year, "naics": code, "geo": r.get("state", "US"), "estab": r["ESTAB"], "emp": r["EMP"], "payann_k": r["PAYANN"]})
    write_csv("cbp.csv", rows, ["year", "naics", "geo", "estab", "emp", "payann_k"])
    return {"rows": len(rows)}


def partd():
    """National Part D claims per year: sum Tot_Clms over drugs at the national level."""
    b = get("https://data.cms.gov/data.json")
    if not b:
        return {"error": "catalog unreachable"}
    cat = json.loads(b)
    ds = [d for d in cat.get("dataset", []) if d.get("title", "").strip().lower() == "medicare part d prescribers - by geography and drug"]
    if not ds:
        return {"error": "dataset not found in catalog"}
    out = []
    for dist in ds[0].get("distribution", []):
        url = dist.get("accessURL", "")
        if "data-api/v1/dataset" not in url or dist.get("format") != "API":
            continue
        year = (dist.get("temporal") or "")[:4]
        api = url.split("?")[0]
        total_clms = total_fills = total_cost = 0.0
        n = 0
        offset = 0
        while True:
            b = get(f"{api}?filter[Prscrbr_Geo_Lvl]=National&size=5000&offset={offset}")
            if not b:
                break
            page = json.loads(b)
            if not page:
                break
            for r in page:
                if r.get("Brnd_Name") and r.get("Gnrc_Name") and r.get("Prscrbr_Geo_Lvl") == "National":
                    total_clms += float(r.get("Tot_Clms") or 0)
                    total_fills += float(r.get("Tot_30day_Fills") or 0)
                    total_cost += float(r.get("Tot_Drug_Cst") or 0)
                    n += 1
            offset += len(page)
            if len(page) < 5000:
                break
        out.append({"year": year, "drug_rows": n, "claims": round(total_clms), "fills_30day": round(total_fills), "drug_cost_usd": round(total_cost)})
    out.sort(key=lambda r: r["year"])
    write_csv("partd_national.csv", out, ["year", "drug_rows", "claims", "fills_30day", "drug_cost_usd"])
    return {"years": [r["year"] for r in out]}


if __name__ == "__main__":
    import os
    os.makedirs(OUT, exist_ok=True)
    summary = {"ran_at": datetime.datetime.utcnow().isoformat() + "Z"}
    for name, fn in [("qcew", qcew), ("cbp", cbp), ("partd", partd)]:
        try:
            summary[name] = fn()
        except Exception as e:
            summary[name] = {"error": repr(e)[:300]}
    summary["requests"] = log
    with open(f"{OUT}/fetchlog.json", "w") as f:
        json.dump(summary, f, indent=1)
    print(json.dumps({k: v for k, v in summary.items() if k != "requests"}, indent=1))
