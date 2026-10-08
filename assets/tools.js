// tomphan. — tools the agent may call. Every number it reports comes from here.
// ctx.market is data/market.json, the harness's latest published output.
import { evaluate, scenario, tornado, CLUSTER, SCENARIO_LABELS, getBase } from "./model.js";

const r0 = x => (x === null || x === undefined || !Number.isFinite(x)) ? null : Math.round(x);
const pct = x => (x === null || x === undefined || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 10;
const r2 = x => (x === null || x === undefined || !Number.isFinite(x)) ? null : Math.round(x * 100) / 100;

const modelProps = {
  price: { type: "number", description: "Year-1 rent, USD per GPU-hour (1–5)." },
  lock: { type: "integer", description: "Years the year-1 rent is fixed by contract (0–6)." },
  decline: { type: "number", description: "Annual fall in market rent as a fraction (0–0.45)." },
  util: { type: "number", description: "Utilization as a fraction (0.4–1)." },
  capex: { type: "number", description: "All-in capex per GPU, USD (10000–60000)." },
  life: { type: "integer", description: "Economic life in years (2–8)." },
  wacc: { type: "number", description: "Cost of capital as a fraction (0.05–0.2)." },
  elec: { type: "number", description: "Electricity, USD per kWh." }
};

export const TOOL_DEFS = [
  { name: "run_model", description: "Value one GPU bought today and rented out. Omitted fields keep the research-based base case. Returns NPV, IRR, payback, break-even rent and break-even capex.", input_schema: { type: "object", properties: modelProps } },
  { name: "sensitivity", description: "Rank which assumptions move NPV the most around a case.", input_schema: { type: "object", properties: modelProps } },
  { name: "compare_scenarios", description: "NPV, IRR and payback for the bull, base and bear cases.", input_schema: { type: "object", properties: {} } },
  { name: "market_snapshot", description: "Latest market research figures: rents and 12-month change by GPU model, the price ladder (rent lost per year of age), contract-term prices, and the base-case assumptions with their evidence.", input_schema: { type: "object", properties: {} } },
  { name: "coreweave_benchmark", description: "CoreWeave reported figures (revenue, depreciation, operating income, capex) and contract facts.", input_schema: { type: "object", properties: {} } }
];

export function runTool(name, args = {}, ctx = {}) {
  const mk = ctx.market;
  switch (name) {
    case "run_model": {
      const e = evaluate(args);
      return {
        assumptions: e.inputs, base_case: getBase(),
        npv_per_gpu: r0(e.npv), npv_per_1000_gpus_musd: r2(e.npv * CLUSTER / 1e6),
        irr_pct: pct(e.irr), payback_years: r2(e.payback),
        breakeven_rent: r2(e.breakevenPrice), breakeven_capex: r0(e.breakevenCapex), cash_cost_per_hour: r2(e.cashCost),
        y1_ebit_margin_pct: pct(e.ebitMarginEcon), y1_ebit_margin_pct_6yr_books: pct(e.ebitMargin6y),
        fcf_by_year: e.rows.map(r => r0(r.fcf)), capex: e.inputs.capex
      };
    }
    case "sensitivity": {
      const t = tornado(args);
      return { base_npv: r0(t.baseNpv), drivers: t.bars.map(b => ({ driver: b.label, low_case: b.lowLabel, npv_low: r0(b.low), high_case: b.highLabel, npv_high: r0(b.high), swing: r0(b.swing) })) };
    }
    case "compare_scenarios":
      return ["bull", "base", "bear"].map(s => { const e = scenario(s); return { scenario: s, description: SCENARIO_LABELS[s], rent: e.inputs.price, lock_years: e.inputs.lock, decline_pct: pct(e.inputs.decline), util_pct: pct(e.inputs.util), life: e.inputs.life, npv_per_gpu: r0(e.npv), irr_pct: pct(e.irr), payback_years: r2(e.payback) }; });
    case "market_snapshot":
      if (!mk) return { error: "Market data not loaded" };
      return {
        as_of: mk.asOf,
        rents: mk.models.map(m => ({ gpu: m.label, on_demand_usd_hr: m.latest, change_12m_pct: pct(m.change), providers: m.providers, spot_vs_on_demand: m.spotRatio })),
        price_ladder: { rent_lost_per_year_of_age_pct: pct(mk.ladder?.annualDecline), r2: mk.ladder?.r2 },
        h100_contract_terms: mk.terms.map(t => ({ months: t.months, listed_usd_hr: t.price, discount_vs_on_demand_pct: pct(t.discount), providers: t.providers })),
        h100_1yr_contract_index_usd_hr: mk.manual?.contract1y?.value,
        base_case: Object.fromEntries(Object.entries(mk.assumptions || {}).map(([k, v]) => [k, { value: v.value, basis: v.basis }]))
      };
    case "coreweave_benchmark": {
      const c = mk?.coreweave; if (!c) return { error: "CoreWeave data not loaded" };
      return { unit: "USD millions", periods: c.periods, dna_to_revenue_pct: c.periods.map(p => pct(p.dna / p.revenue)), capex_to_revenue_x: c.periods.map(p => r2(p.capex / p.revenue)), facts: c.facts };
    }
    default: return { error: `Unknown tool ${name}` };
  }
}
