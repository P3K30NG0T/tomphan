"""Builds the case data for the website (data/case.json) from the fetched open data.

Every number on the site comes from this file. Facts that come from filings or reports
(not from a downloadable dataset) live in case/build/facts.json with their source.
Run: python3 case/build/build.py
"""
import csv, json, statistics
from collections import defaultdict

D = "case/data"
ST = {"42": "PA", "24": "MD", "36": "NY", "51": "VA", "34": "NJ", "10": "DE", "54": "WV"}
NAME = {"42": "Pennsylvania", "24": "Maryland", "36": "New York", "51": "Virginia", "34": "New Jersey", "10": "Delaware", "54": "West Virginia"}
WEIS_STORES = {"PA": 120, "MD": 52, "NY": 8, "VA": 9, "NJ": 6, "DE": 4, "WV": 3}
facts = json.load(open("case/build/facts.json"))


def rd(p):
    return list(csv.DictReader(open(f"{D}/{p}")))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


# ---------- Act 1 ----------
q = rd("act1/qcew_quarterly.csv")
us_q = [{"q": f"{r['year']}Q{r['qtr']}", "estabs": int(r["estabs"]), "jobs": int(r["jobs"])} for r in q if r["area_fips"] == "US000"]
st_q = defaultdict(list)
for r in q:
    if r["area_fips"] != "US000":
        st_q[ST[r["area_fips"][:2]]].append({"q": f"{r['year']}Q{r['qtr']}", "estabs": int(r["estabs"]), "jobs": int(r["jobs"])})
ann = rd("act1/qcew_annual.csv")
us_a = [{"year": int(r["year"]), "estabs": int(r["estabs"]), "jobs": int(r["jobs"]), "wages": int(r["wages"]), "avg_pay": int(r["avg_pay"])} for r in ann if r["area_fips"] == "US000"]
pd = {}
for r in rd("act1/partd_national.csv"):
    y = int(r["period"][:4]) if r["period"][:4].isdigit() else int([t for t in r["period"].split("'") if t[:2] == "20"][-1][:4])
    pd[y] = {"year": y, "claims": int(r["claims"]), "fills": int(r["fills_30day"]), "cost": int(r["drug_cost_usd"])}
first_year = min(r["year"] for r in us_a)
partd = [pd[y] for y in sorted(pd) if y >= first_year]  # compare only years with both datasets

BASE, LAST = "2023Q3", us_q[-1]["q"]
gv = lambda rows, k: next(r for r in rows if r["q"] == k)
states_change = []
for s, rows in st_q.items():
    b, l = gv(rows, BASE), gv(rows, LAST)
    states_change.append({"state": s, "name": NAME[[k for k, v in ST.items() if v == s][0]], "weis": WEIS_STORES[s],
                          "base": b["estabs"], "latest": l["estabs"], "jobs_base": b["jobs"], "jobs_latest": l["jobs"]})
usb, usl = gv(us_q, BASE), gv(us_q, LAST)
act1 = {"base": BASE, "last": LAST, "us_quarterly": us_q, "states_quarterly": st_q, "us_annual": us_a, "partd": partd,
        "states_change": states_change, "us_change": {"base": usb["estabs"], "latest": usl["estabs"], "jobs_base": usb["jobs"], "jobs_latest": usl["jobs"]},
        "timeline": facts["timeline"], "context": facts["act1_context"]}

# ---------- Act 2 ----------
svi = {r["FIPS"]: r for r in rd("act2/svi_2022_county.csv")}
cq = defaultdict(dict)
for r in rd("act2/qcew_county_quarterly.csv"):
    cq[r["fips"]][f"{r['year']}Q{r['qtr']}"] = int(r["estabs"])
pl = defaultdict(dict)
for r in rd("act2/places_county.csv"):
    pl[r["fips"].zfill(5)][r["measure"]] = num(r["value"])
weis = [r for r in rd("act4/weis_npi.csv") if r["taxonomy_code"].startswith("3336")]
weis_by_c = defaultdict(int)
for r in weis:
    if r.get("county_fips"):
        weis_by_c[r["county_fips"].zfill(5)] += 1
geo = json.load(open(f"{D}/geo_counties.json"))
counties = []
for g in geo["counties"]:
    f = g["fips"]
    s = svi.get(f, {})
    pop = int(float(s.get("E_TOTPOP") or 0))
    a65 = int(float(s.get("E_AGE65") or 0))
    p0, p1 = cq[f].get(BASE, 0), cq[f].get(LAST, 0)
    counties.append({
        "fips": f, "name": g["name"], "state": ST[f[:2]], "pop": pop, "age65": a65,
        "pct65": num(s.get("EP_AGE65")), "noveh": num(s.get("EP_NOVEH")), "pov150": num(s.get("EP_POV150")),
        "uninsured": num(s.get("EP_UNINSUR")), "sqmi": round(num(s.get("AREA_SQMI")) or 0),
        "ph_base": p0, "ph_latest": p1,
        "diabetes": pl[f].get("DIABETES"), "bphigh": pl[f].get("BPHIGH"), "lacktrpt": pl[f].get("LACKTRPT"),
        "weis_rx": weis_by_c.get(f, 0)})
for c in counties:
    c["per10k"] = round(c["ph_latest"] / c["pop"] * 1e4, 2) if c["pop"] else None
    c["res_per_ph"] = round(c["pop"] / c["ph_latest"]) if c["ph_latest"] else None
    c["a65_per_ph"] = round(c["age65"] / c["ph_latest"]) if c["ph_latest"] else None
    c["change"] = c["ph_latest"] - c["ph_base"]

# state Part D fills per stand-alone pharmacy (2024 fills / 2024 average quarterly count)
pds = {}
for r in rd("act2/partd_states.csv"):
    pds[r["state"]] = {"claims": int(r["claims"]), "fills": int(r["fills_30day"]), "cost": int(r["drug_cost_usd"])}
state_demand = []
for s, rows in st_q.items():
    ph24 = statistics.mean(r["estabs"] for r in rows if r["q"].startswith("2024"))
    pop = sum(c["pop"] for c in counties if c["state"] == s)
    a65 = sum(c["age65"] for c in counties if c["state"] == s)
    state_demand.append({"state": s, "name": NAME[[k for k, v in ST.items() if v == s][0]], "fills_2024": pds[s]["fills"],
                         "ph_2024": round(ph24), "pop": pop, "age65": a65, "weis": WEIS_STORES[s]})
us_ph24 = statistics.mean(r["estabs"] for r in us_q if r["q"].startswith("2024"))
act2 = {"counties": counties, "state_demand": state_demand,
        "us_fills_per_ph_2024": round(pd[2024]["fills"] / us_ph24), "places_release": "CDC PLACES 2025 release (2023 estimates)",
        "svi_release": "CDC/ATSDR Social Vulnerability Index 2022 (ACS 2018-2022)"}

# ---------- Act 3 ----------
oews = defaultdict(dict)
for r in rd("act2/oews_wages.csv"):
    oews[(r["occupation"], r["measure"])][r["area"]] = int(r["value"])
act3 = {"payroll_per_ph": [{"year": r["year"], "payroll": round(r["wages"] / r["estabs"]), "jobs": round(r["jobs"] / r["estabs"], 1), "avg_pay": r["avg_pay"]} for r in us_a],
        "oews": {"pharmacist": oews[("pharmacist", "annual_mean_wage")], "technician": oews[("technician", "annual_mean_wage")],
                 "pharmacist_jobs_us": oews[("pharmacist", "employment")].get("US"), "technician_jobs_us": oews[("technician", "employment")].get("US")},
        **facts["act3"]}

# ---------- Act 4 ----------
wst = defaultdict(int)
for r in weis:
    wst[r["state"]] += 1
act4 = {**facts["act4"], "npi_pharmacies": len(weis), "npi_by_state": dict(wst),
        "npi_placed": sum(1 for r in weis if r.get("county_fips")),
        "weis_pharmacies": [{"npi": r["npi"], "city": r["city"].title(), "state": r["state"], "county_fips": (r.get("county_fips") or "").zfill(5) if r.get("county_fips") else "",
                             "lat": num(r.get("lat")), "lon": num(r.get("lon"))} for r in weis],
        "stores_by_state": WEIS_STORES}

out = {"built": facts["as_of"], "act1": act1, "act2": act2, "act3": act3, "act4": act4, "sources": facts["sources"]}
json.dump(out, open("data/case.json", "w"), separators=(",", ":"))
print("data/case.json", round(len(json.dumps(out)) / 1024), "KB")
