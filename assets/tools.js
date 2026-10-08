// tomphan. — tools the Analyst Copilot may call. Every number the copilot reports comes from here.
import { evaluate, scenario, tornado, CLUSTER, DEFAULTS } from "./model.js";
import { computeRoutes, ROUTES, MEMO_DEFAULTS } from "./memo.js";

const r0 = x => Math.round(x);
const pct = x => (x === null || x === undefined) ? null : Math.round(x * 1000) / 10;

const COREWEAVE = {
  periods: ["FY2023", "FY2024", "FY2025", "H1 2026"],
  revenue: [229, 1915, 5131, 4653], dna: [103, 863, 2454, 2540],
  operatingIncome: [-14, 324, -46, -193], capex: [2943, 8702, 10309, 14117]
};

const modelProps = {
  capex: { type: "number", description: "All-in capex per GPU, USD (20000–60000). Default 35000." },
  price: { type: "number", description: "Year-1 rental price, USD per GPU-hour (1–5). Default 2.35." },
  decline: { type: "number", description: "Annual price decline as a fraction (0–0.4). Default 0.15." },
  util: { type: "number", description: "Utilization as a fraction (0.4–1). Default 0.85." },
  elec: { type: "number", description: "Electricity, USD per kWh. Default 0.087." },
  life: { type: "integer", description: "Economic life in years (2–8). Default 5." },
  wacc: { type: "number", description: "Discount rate as a fraction (0.05–0.2). Default 0.11." },
  residual: { type: "number", description: "Resale value as a share of capex (0–0.3). Default 0.05." }
};

export const TOOL_DEFS = [
  { name: "run_model", description: "Value one H100 GPU rented out over its economic life. Returns NPV, IRR, payback, break-even price and margins. Omit fields to keep base-case defaults.", input_schema: { type: "object", properties: modelProps } },
  { name: "sensitivity", description: "Rank which assumptions move NPV the most (tornado analysis) around a case.", input_schema: { type: "object", properties: modelProps } },
  { name: "compare_scenarios", description: "NPV, IRR and payback for the preset Bull, Base and Bear cases.", input_schema: { type: "object", properties: {} } },
  { name: "coreweave_benchmark", description: "CoreWeave reported financials from SEC filings: revenue, D&A, operating income, capex, and ratios.", input_schema: { type: "object", properties: {} } },
  { name: "payment_routes", description: "Monthly economics of paid channels for a hypothetical SEA messaging app, given payment routes. Routes: iap, iapSmall, link, wallet, crypto.", input_schema: { type: "object", properties: {
    mau: { type: "number", description: "Monthly active users, millions. Default 70." },
    payers: { type: "number", description: "Share of MAU paying, fraction. Default 0.015." },
    arppu: { type: "number", description: "USD per payer per month. Default 3." },
    iosShare: { type: "number", description: "Share of payments started on iOS. Default 0.3." },
    iosRoute: { type: "string", enum: Object.keys(ROUTES) },
    otherRoute: { type: "string", enum: Object.keys(ROUTES) },
    take: { type: "number", description: "Platform cut after fees. Default 0.2." }
  } } }
];

export function runTool(name, args = {}) {
  switch (name) {
    case "run_model": {
      const e = evaluate(args);
      return {
        assumptions: e.inputs,
        npv_per_gpu: r0(e.npv), npv_per_1000_gpus_musd: Math.round(e.npv * CLUSTER / 1e4) / 100,
        irr_pct: pct(e.irr), payback_years: e.payback === null ? null : Math.round(e.payback * 100) / 100,
        breakeven_price: e.breakevenPrice === null ? null : Math.round(e.breakevenPrice * 100) / 100,
        y1_ebit_margin_pct_economic_life: pct(e.ebitMarginEcon), y1_ebit_margin_pct_6yr_accounting: pct(e.ebitMargin6y),
        fcf_by_year: e.rows.map(r => r0(r.fcf)), capex: e.inputs.capex
      };
    }
    case "sensitivity": {
      const t = tornado(args);
      return { base_npv: r0(t.baseNpv), drivers: t.bars.map(b => ({ driver: b.label, low_case: b.lowLabel, npv_low: r0(b.low), high_case: b.highLabel, npv_high: r0(b.high), swing: r0(b.swing) })) };
    }
    case "compare_scenarios": {
      return ["bull", "base", "bear"].map(s => { const e = scenario(s); return { scenario: s, price: e.inputs.price, decline_pct: pct(e.inputs.decline), util_pct: pct(e.inputs.util), life: e.inputs.life, npv_per_gpu: r0(e.npv), irr_pct: pct(e.irr), payback_years: e.payback === null ? null : Math.round(e.payback * 10) / 10 }; });
    }
    case "coreweave_benchmark": {
      const c = COREWEAVE;
      return { unit: "USD millions", ...c, dna_to_revenue_pct: c.revenue.map((v, i) => pct(c.dna[i] / v)), operating_margin_pct: c.revenue.map((v, i) => pct(c.operatingIncome[i] / v)), capex_to_revenue_x: c.revenue.map((v, i) => Math.round(c.capex[i] / v * 10) / 10), accounting_life_years: 6, source: "CoreWeave 10-K FY2025 and 10-Q Q2 2026, SEC EDGAR" };
    }
    case "payment_routes": {
      const a = computeRoutes(args);
      return { assumptions: a.inputs, gross_musd_month: Math.round(a.gross / 1e4) / 100, payment_fees_pct: pct(a.effectiveFee), creators_pct_of_gross: pct(a.creatorShare), platform_pct_of_gross: pct(a.platformShare), creators_musd_month: Math.round(a.creators / 1e4) / 100, platform_musd_year: Math.round(a.annualPlatform / 1e4) / 100, saved_vs_all_iap_musd_month: Math.round(a.savedVsAllIap / 1e4) / 100 };
    }
    default: return { error: `Unknown tool ${name}` };
  }
}

export const DEFAULT_SNAPSHOT = { model: DEFAULTS, memo: MEMO_DEFAULTS };
