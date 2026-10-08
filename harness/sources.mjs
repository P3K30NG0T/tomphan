// tomphan. harness — registry of every source the pipeline may use.
// "auto" sources are fetched on each run; "manual" ones are cited figures a person checked by hand.

export const GPU_SLUGS = [
  { slug: "nvidia-a100", label: "A100", available: 2020.4 },
  { slug: "nvidia-h100", label: "H100", available: 2022.9 },
  { slug: "nvidia-h200", label: "H200", available: 2024.3 },
  { slug: "nvidia-b200", label: "B200", available: 2025.1 },
  { slug: "nvidia-b300", label: "B300", available: 2025.8 }
];
// `available` = first volume cloud availability, as a decimal year (analyst input, from NVIDIA launch announcements).

export const AUTO = {
  getdeploying: {
    title: "GetDeploying GPU Rental Price History (CC BY 4.0)",
    url: "https://getdeploying.com/dataset/gpu-prices",
    file: slug => `https://getdeploying.com/dataset/gpu-prices/${slug}.json`,
    license: "CC BY 4.0"
  },
  sec: {
    title: "SEC EDGAR XBRL API, CoreWeave Inc. (CIK 0001769628)",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001769628",
    file: tag => `https://data.sec.gov/api/xbrl/companyconcept/CIK0001769628/us-gaap/${tag}.json`,
    tags: {
      revenue: "RevenueFromContractWithCustomerExcludingAssessedTax",
      dna: "DepreciationDepletionAndAmortization",
      operatingIncome: "OperatingIncomeLoss",
      capex: "PaymentsToAcquirePropertyPlantAndEquipment"
    }
  }
};

export const MANUAL = {
  contract1y: {
    label: "H100 1-year contract price, Mar 2026", value: 2.35, unit: "USD/GPU-hr",
    prior: { label: "Oct 2025 low", value: 1.70 },
    title: "SemiAnalysis, The Great GPU Shortage (H100 1-yr rental index)",
    url: "https://newsletter.semianalysis.com/p/the-great-gpu-shortage-rental-capacity"
  },
  hyperscalerGap: {
    label: "H100 on-demand: dedicated GPU clouds vs hyperscalers (Oct 2026)", gpuClouds: 4.50, hyperscalers: 7.89, unit: "USD/GPU-hr",
    title: "GetDeploying GPU Price Trends", url: "https://getdeploying.com/gpu-price-trends"
  },
  trendsSnapshot: {
    label: "H100 on-demand median, 41 providers (week of Oct 5, 2026)", value: 3.47, unit: "USD/GPU-hr",
    title: "GetDeploying GPU Price Trends", url: "https://getdeploying.com/gpu-price-trends"
  },
  power: {
    label: "US industrial electricity, May 2026", value: 0.0871, unit: "USD/kWh",
    title: "EIA Monthly Energy Review, Table 9.8 (Aug 2026)", url: "https://www.eia.gov/TOTALENERGY/data/monthly/pdf/sec9_10.pdf"
  },
  coreweave: {
    title: "CoreWeave Form 10-K, FY2025", url: "https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm",
    facts: [
      { key: "topCustomer", label: "Revenue from top customer (Microsoft), 2025", value: "~67%" },
      { key: "rpo", label: "Remaining performance obligations, end 2025", value: "$60.7bn" },
      { key: "contractLength", label: "Weighted-average contract length", value: "~5 years" },
      { key: "life", label: "GPU depreciation life (accounting)", value: "6 years" },
      { key: "power", label: "Active power, end 2025", value: "850+ MW" }
    ]
  },
  seaPipeline: {
    title: "Cushman & Wakefield, APAC Data Centre H1 2026 Update (5 Aug 2026)",
    url: "https://www.cushmanwakefield.com/en/vietnam/news/2026/08/asia-pacific-data-centre-development-pipeline",
    apacPipelineGW: 26.5, seaShareUnderConstruction: 0.5,
    markets: [
      { market: "Johor, Malaysia", operational: 1110, underConstruction: 602, pipeline: 3088 },
      { market: "Bangkok, Thailand", operational: 134, underConstruction: 859, pipeline: 2084 },
      { market: "Jakarta, Indonesia", operational: null, underConstruction: 395, pipeline: 1699 },
      { market: "Ho Chi Minh City, Vietnam", operational: null, underConstruction: null, pipeline: 68 }
    ]
  },
  depreciationDebate: {
    title: "Nasdaq / Motley Fool on the GPU depreciation debate",
    url: "https://www.nasdaq.com/articles/michael-burrys-latest-warning-could-be-bad-news-coreweave"
  }
};

// Values recorded when the case was first built; the pipeline compares fresh SEC data against them.
export const SEC_BASELINE = { FY2025: { revenue: 5131, dna: 2454, operatingIncome: -46, capex: 10309 } };
