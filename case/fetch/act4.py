"""Act 4 data fetch: Weis Markets pharmacy locations.

Weis does not publish a pharmacy count. Every US pharmacy needs a National Provider
Identifier (NPI); the public NPPES registry lists them with the practice address.
We pull every NPI registered to 'WEIS MARKETS' with a pharmacy taxonomy, then place each
address in its county with the Census geocoder.
"""
import csv, json, os, sys, datetime, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from act1 import get, log

OUT = "case/data/act4"


def npi():
    seen, rows = set(), []
    for name in ["WEIS MARKETS*", "WEIS MARKETS INC*", "WEIS PHARMACY*"]:
        for skip in range(0, 1200, 200):
            q = urllib.parse.urlencode({"version": "2.1", "organization_name": name, "enumeration_type": "NPI-2", "limit": 200, "skip": skip})
            b = get(f"https://npiregistry.cms.hhs.gov/api/?{q}")
            res = json.loads(b or b"{}").get("results", [])
            for r in res:
                n = r["number"]
                if n in seen:
                    continue
                seen.add(n)
                tax = [t for t in r.get("taxonomies", []) if t.get("primary")] or r.get("taxonomies", [{}])
                loc = next((a for a in r.get("addresses", []) if a.get("address_purpose") == "LOCATION"), {})
                rows.append({"npi": n, "name": r.get("basic", {}).get("organization_name", ""),
                             "status": r.get("basic", {}).get("status", ""), "enumerated": r.get("basic", {}).get("enumeration_date", ""),
                             "taxonomy_code": tax[0].get("code", ""), "taxonomy": tax[0].get("desc", ""),
                             "address": loc.get("address_1", ""), "city": loc.get("city", ""), "state": loc.get("state", ""),
                             "zip": (loc.get("postal_code", "") or "")[:5], "phone": loc.get("telephone_number", "")})
            if len(res) < 200:
                break
    return rows


def geocode(rows):
    for r in rows:
        q = urllib.parse.urlencode({"street": r["address"], "city": r["city"], "state": r["state"], "zip": r["zip"],
                                    "benchmark": "Public_AR_Current", "vintage": "Current_Current", "layers": "Counties", "format": "json"})
        b = get(f"https://geocoding.geo.census.gov/geocoder/geographies/address?{q}", tries=2)
        try:
            m = json.loads(b)["result"]["addressMatches"]
            if m:
                c = m[0]["geographies"]["Counties"][0]
                r["county_fips"] = c["STATE"] + c["COUNTY"]
                r["county"] = c["NAME"]
                r["lon"], r["lat"] = m[0]["coordinates"]["x"], m[0]["coordinates"]["y"]
        except Exception:
            pass


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    s = {"ran_at": datetime.datetime.utcnow().isoformat() + "Z"}
    try:
        rows = npi()
        geocode([r for r in rows if r["taxonomy_code"].startswith("3336")])
        cols = ["npi", "name", "status", "enumerated", "taxonomy_code", "taxonomy", "address", "city", "state", "zip", "phone", "county_fips", "county", "lat", "lon"]
        with open(f"{OUT}/weis_npi.csv", "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(rows)
        s["npi"] = {"rows": len(rows), "pharmacy_rows": sum(r["taxonomy_code"].startswith("3336") for r in rows),
                    "geocoded": sum(1 for r in rows if r.get("county_fips"))}
    except Exception as e:
        s["npi"] = {"error": repr(e)[:300]}
    s["requests"] = log[:50] + [{"note": f"{len(log)} requests in total"}]
    json.dump(s, open(f"{OUT}/fetchlog.json", "w"), indent=1)
    print(json.dumps({k: v for k, v in s.items() if k != "requests"}, indent=1))
