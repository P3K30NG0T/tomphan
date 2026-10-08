"""Independent re-implementation of the GPU rental model, used by the harness to cross-check the JavaScript.
Usage: python3 harness/reconcile.py '<json of model inputs>'  -> prints {"npv":..., "irr":..., "breakeven_price":...}
Written separately from assets/model.js on purpose: if both agree, a formula slip in one is unlikely."""
import json
import sys

HOURS = 8760


def cash_flows(p):
    dep = p["capex"] / p["life"]
    flows = [-p["capex"]]
    for t in range(1, p["life"] + 1):
        rent = p["price"] if t <= p["lock"] else p["price"] * (1 - p["decline"]) ** (t - 1)
        ebitda = rent * HOURS * p["util"] - p["kw"] * HOURS * p["util"] * p["elec"] - p["otherOpex"] * HOURS
        tax = (ebitda - dep) * p["tax"]
        flows.append(ebitda - tax + (p["residual"] * p["capex"] if t == p["life"] else 0.0))
    return flows


def npv(flows, rate):
    return sum(cf / (1 + rate) ** t for t, cf in enumerate(flows))


def bisect(f, lo, hi, n=120):
    if f(lo) * f(hi) > 0:
        return None
    for _ in range(n):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def main():
    p = json.loads(sys.argv[1])
    flows = cash_flows(p)
    out = {
        "npv": npv(flows, p["wacc"]),
        "irr": bisect(lambda r: npv(flows, r), -0.99, 2.0),
        "breakeven_price": bisect(lambda x: npv(cash_flows({**p, "price": x}), p["wacc"]), 0.1, 12.0),
    }
    print(json.dumps(out))


if __name__ == "__main__":
    main()
