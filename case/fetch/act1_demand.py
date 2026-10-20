"""Act 1, demand side: how many prescriptions Medicare Part D pays for each year.

Finds the CMS dataset 'Medicare Part D Prescribers - by Geography and Drug' in the
data.cms.gov catalog (one API distribution per year) and sums national claims.
Also probes the Census CBP API once and records what it answered (it returned HTML last run).
"""
import csv, json, sys, os, datetime
sys.path.insert(0, os.path.dirname(__file__))
from act1 import get, log, OUT  # same request helper and log

def partd():
    cat = json.loads(get("https://data.cms.gov/data.json"))
    titles = [d.get("title", "") for d in cat.get("dataset", [])]
    hits = [d for d in cat["dataset"] if "part d prescribers" in d.get("title", "").lower() and "geography and drug" in d.get("title", "").lower()]
    info = {"catalog_titles_with_part_d": [t for t in titles if "part d" in t.lower()][:40]}
    if not hits:
        return info
    out = []
    for dist in hits[0].get("distribution", []):
        url = dist.get("accessURL") or dist.get("downloadURL") or ""
        if "data-api/v1/dataset" not in url:
            continue
        year = (dist.get("temporal") or dist.get("title") or "")
        api = url.split("?")[0].rstrip("/")
        if not api.endswith("/data"):
            api += "/data" if "/data" not in api.split("/dataset/")[1] else ""
        clms = fills = cost = 0.0
        n = offset = 0
        while True:
            b = get(f"{api}?filter[Prscrbr_Geo_Lvl]=National&size=5000&offset={offset}")
            if not b:
                break
            page = json.loads(b)
            if not isinstance(page, list) or not page:
                break
            for r in page:
                # national rows: one per drug, plus overall rows; keep each drug once
                clms += float(r.get("Tot_Clms") or 0)
                fills += float(r.get("Tot_30day_Fills") or 0)
                cost += float(r.get("Tot_Drug_Cst") or 0)
                n += 1
            offset += len(page)
            if len(page) < 5000:
                break
        out.append({"period": year, "api": api, "rows": n, "claims": round(clms), "fills_30day": round(fills), "drug_cost_usd": round(cost)})
    with open(f"{OUT}/partd_national.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["period", "rows", "claims", "fills_30day", "drug_cost_usd", "api"])
        w.writeheader(); w.writerows(out)
    info["years"] = [r["period"] for r in out]
    info["dataset_title"] = hits[0].get("title")
    return info

def census_probe():
    b = get("https://api.census.gov/data/2022/cbp?get=ESTAB&for=us:*&NAICS2017=446110")
    return {"first_300": (b or b"")[:300].decode("utf-8", "replace")}

if __name__ == "__main__":
    s = {"ran_at": datetime.datetime.utcnow().isoformat() + "Z"}
    for k, fn in [("partd", partd), ("census_probe", census_probe)]:
        try:
            s[k] = fn()
        except Exception as e:
            s[k] = {"error": repr(e)[:300]}
    s["requests"] = log
    json.dump(s, open(f"{OUT}/fetchlog_demand.json", "w"), indent=1)
    print(json.dumps({k: v for k, v in s.items() if k != "requests"}, indent=1)[:3000])
