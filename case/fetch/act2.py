"""Acts 2-4 data fetch (runs on GitHub Actions).

- BLS QCEW county pharmacy counts for Q3 2023 and the latest quarter (7 Weis states)
- CDC/ATSDR Social Vulnerability Index 2022, county (population, 65+, no vehicle, poverty)
- CDC PLACES county estimates (diabetes, high blood pressure), latest release
- BLS OEWS pharmacist and pharmacy technician wages (US + 7 states) via the public API
- CMS Medicare Part D claims by state (latest year)
- Census ACS probe (to see whether the API answers from here)
"""
import csv, io, json, os, sys, datetime, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(__file__))
from act1 import get, log, STATES

OUT = "case/data/act2"
ABBR = {"42": "PA", "24": "MD", "36": "NY", "51": "VA", "34": "NJ", "10": "DE", "54": "WV"}
NAMES = {"42": "Pennsylvania", "24": "Maryland", "36": "New York", "51": "Virginia", "34": "New Jersey", "10": "Delaware", "54": "West Virginia"}


def save_csv(name, rows, cols):
    with open(f"{OUT}/{name}", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)


def qcew_county():
    rows = []
    for year, q in [("2023", "3"), ("2026", "1"), ("2025", "4"), ("2026", "2")]:
        b = get(f"https://data.bls.gov/cew/data/api/{year}/{q}/industry/456110.csv")
        if not b:
            continue
        for r in csv.DictReader(io.StringIO(b.decode("utf-8", "replace"))):
            a = r["area_fips"]
            if r.get("own_code") == "5" and a[:2] in STATES and a[2:].isdigit() and not a.endswith("000"):
                rows.append({"year": year, "qtr": q, "fips": a, "estabs": r["qtrly_estabs"], "jobs": r["month3_emplvl"],
                             "wages": r["total_qtrly_wages"], "disclosure": r.get("disclosure_code", "")})
    save_csv("qcew_county_quarterly.csv", rows, ["year", "qtr", "fips", "estabs", "jobs", "wages", "disclosure"])
    return {"rows": len(rows)}


def svi():
    for url in ["https://svi.cdc.gov/Documents/Data/2022/csv/states_counties/SVI_2022_US_county.csv",
                "https://www.atsdr.cdc.gov/placeandhealth/centroid/data/SVI_2022_US_county.csv"]:
        b = get(url)
        if b and b[:4] != b"<htm" and b"FIPS" in b[:2000]:
            break
    else:
        return {"error": "SVI not reachable"}
    keep = ["STATE", "ST_ABBR", "COUNTY", "FIPS", "E_TOTPOP", "E_HU", "E_HH", "E_AGE65", "EP_AGE65", "E_NOVEH", "EP_NOVEH",
            "EP_POV150", "EP_UNINSUR", "EP_DISABL", "AREA_SQMI"]
    rows = []
    for r in csv.DictReader(io.StringIO(b.decode("utf-8-sig", "replace"))):
        if str(r.get("FIPS", "")).zfill(5)[:2] in STATES:
            r["FIPS"] = str(r["FIPS"]).zfill(5)
            rows.append(r)
    save_csv("svi_2022_county.csv", rows, keep)
    return {"rows": len(rows)}


def places():
    cat = json.loads(get("https://api.us.socrata.com/api/catalog/v1?domains=data.cdc.gov&q=PLACES%20County%20Data&limit=50") or b"{}")
    cands = []
    for res in cat.get("results", []):
        n = res["resource"]["name"]
        if n.startswith("PLACES: Local Data for Better Health, County Data") and "GIS" not in n:
            cands.append((n, res["resource"]["id"]))
    cands.sort(reverse=True)
    if not cands:
        return {"error": "PLACES not found", "names": [r["resource"]["name"] for r in cat.get("results", [])][:20]}
    name, rid = cands[0]
    st = ",".join(f"'{a}'" for a in ABBR.values())
    q = urllib.parse.quote(f"stateabbr in({st}) AND measureid in('DIABETES','BPHIGH','DISABILITY','LACKTRPT') AND datavaluetypeid='CrdPrv'")
    b = get(f"https://data.cdc.gov/resource/{rid}.json?$where={q}&$limit=50000")
    data = json.loads(b or b"[]")
    rows = [{"year": d.get("year"), "fips": d.get("locationid"), "county": d.get("locationname"), "state": d.get("stateabbr"),
             "measure": d.get("measureid"), "value": d.get("data_value"), "population": d.get("totalpopulation")} for d in data]
    save_csv("places_county.csv", rows, ["year", "fips", "county", "state", "measure", "value", "population"])
    return {"release": name, "id": rid, "rows": len(rows)}


def oews():
    series = {}
    for occ, tag in [("291051", "pharmacist"), ("292052", "technician")]:
        series[f"OEUN0000000000000{occ}04"] = ("US", tag, "annual_mean_wage")
        series[f"OEUN0000000000000{occ}01"] = ("US", tag, "employment")
        for s in STATES:
            series[f"OEUS{s}00000000000{occ}04"] = (ABBR[s], tag, "annual_mean_wage")
    ids = list(series)
    rows = []
    for i in range(0, len(ids), 25):
        body = json.dumps({"seriesid": ids[i:i + 25]}).encode()
        req = urllib.request.Request("https://api.bls.gov/publicAPI/v1/timeseries/data/", data=body,
                                     headers={"Content-Type": "application/json", "User-Agent": "tomphan-research/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                res = json.loads(r.read())
            log.append({"url": "api.bls.gov v1", "status": res.get("status"), "msg": res.get("message", [])[:3]})
        except Exception as e:
            log.append({"url": "api.bls.gov v1", "error": str(e)[:200]})
            continue
        for s in res.get("Results", {}).get("series", []):
            area, tag, kind = series[s["seriesID"]]
            for d in s.get("data", []):
                rows.append({"series": s["seriesID"], "area": area, "occupation": tag, "measure": kind, "year": d["year"], "value": d["value"]})
    save_csv("oews_wages.csv", rows, ["series", "area", "occupation", "measure", "year", "value"])
    return {"rows": len(rows)}


def partd_states():
    cat = json.loads(get("https://data.cms.gov/data.json"))
    hits = [d for d in cat["dataset"] if "part d prescribers" in d.get("title", "").lower() and "geography and drug" in d.get("title", "").lower()]
    dists = [x for h in hits for x in h.get("distribution", []) if "data-api/v1/dataset" in (x.get("accessURL") or "")]
    dists.sort(key=lambda x: str(x.get("temporal")))
    out = []
    for dist in dists[-2:]:
        api = dist["accessURL"].split("?")[0]
        per = str(dist.get("temporal"))[-12:]
        for s, name in NAMES.items():
            clms = fills = cost = 0.0
            off = 0
            while True:
                b = get(f"{api}?filter[Prscrbr_Geo_Lvl]=State&filter[Prscrbr_Geo_Desc]={urllib.parse.quote(name)}&size=5000&offset={off}")
                page = json.loads(b or b"[]")
                if not isinstance(page, list) or not page:
                    break
                for r in page:
                    clms += float(r.get("Tot_Clms") or 0); fills += float(r.get("Tot_30day_Fills") or 0); cost += float(r.get("Tot_Drug_Cst") or 0)
                off += len(page)
                if len(page) < 5000:
                    break
            out.append({"period": per, "state": ABBR[s], "claims": round(clms), "fills_30day": round(fills), "drug_cost_usd": round(cost)})
    save_csv("partd_states.csv", out, ["period", "state", "claims", "fills_30day", "drug_cost_usd"])
    return {"rows": len(out)}


def census_probe():
    b = get("https://api.census.gov/data/2023/acs/acs5?get=NAME,B01003_001E&for=county:*&in=state:10")
    return {"first_400": (b or b"")[:400].decode("utf-8", "replace")}


if __name__ == "__main__":
    import urllib.parse
    os.makedirs(OUT, exist_ok=True)
    s = {"ran_at": datetime.datetime.utcnow().isoformat() + "Z"}
    for k, fn in [("qcew_county", qcew_county), ("svi", svi), ("places", places), ("oews", oews), ("partd_states", partd_states), ("census_probe", census_probe)]:
        try:
            s[k] = fn()
        except Exception as e:
            s[k] = {"error": repr(e)[:300]}
    s["requests"] = log
    json.dump(s, open(f"{OUT}/fetchlog.json", "w"), indent=1)
    print(json.dumps({k: v for k, v in s.items() if k != "requests"}, indent=1)[:4000])
