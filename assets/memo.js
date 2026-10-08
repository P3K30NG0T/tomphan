// tomphan. — Paid content payment-route calculator
// Fees are shares of the gross amount a fan pays. Sources and caveats are listed in the memo.

export const ROUTES = {
  iap:     { label: "App store in-app purchase", fee: 0.30, note: "Apple and Google standard rate on digital goods" },
  iapSmall:{ label: "App store, reduced tier", fee: 0.15, note: "Small-developer and year-2 subscription tiers" },
  link:    { label: "Link-out to web checkout", fee: 0.03, note: "Card processing only; commission-free on iOS in the US since Apr 2025, rate still in court" },
  wallet:  { label: "Local e-wallet / bank QR", fee: 0.015, note: "Typical merchant rate, assumption" },
  crypto:  { label: "Crypto top-up (Fragment-style)", fee: 0.01, note: "Network fee plus FX spread, assumption" }
};

export const MEMO_DEFAULTS = {
  mau: 70,          // millions of monthly active users (hypothetical SEA messaging app)
  payers: 0.015,    // share of MAU paying for any creator content (Telegram Premium ≈ 1–1.5% of users)
  arppu: 3.0,       // USD per paying user per month
  iosShare: 0.30,   // share of payments started on iOS (assumption)
  iosRoute: "iap",
  otherRoute: "wallet",
  take: 0.20        // platform's cut of what remains after payment fees
};

export function computeRoutes(input = {}) {
  const p = { ...MEMO_DEFAULTS, ...input };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v)));
  p.mau = clamp(p.mau, 1, 1000); p.payers = clamp(p.payers, 0.001, 0.2);
  p.arppu = clamp(p.arppu, 0.2, 50); p.iosShare = clamp(p.iosShare, 0, 1); p.take = clamp(p.take, 0, 0.5);
  if (!ROUTES[p.iosRoute]) p.iosRoute = "iap";
  if (!ROUTES[p.otherRoute]) p.otherRoute = "wallet";

  const gross = p.mau * 1e6 * p.payers * p.arppu;            // USD per month
  const iosGross = gross * p.iosShare, otherGross = gross - iosGross;
  const fees = iosGross * ROUTES[p.iosRoute].fee + otherGross * ROUTES[p.otherRoute].fee;
  const net = gross - fees;
  const platform = net * p.take;
  const creators = net - platform;
  const allIap = gross * ROUTES.iap.fee;
  return {
    inputs: p, gross, fees, net, platform, creators,
    effectiveFee: fees / gross,
    creatorShare: creators / gross,
    platformShare: platform / gross,
    savedVsAllIap: allIap - fees,                         // per month
    annualPlatform: platform * 12, annualGross: gross * 12
  };
}

export const TELEGRAM_FACTS = [
  { metric: "Monthly active users", value: "1 billion (Mar 2025)", source: "Pavel Durov via Voxbooster", url: "https://voxbooster.com/blog/telegram-statistics-2026", grade: "Company statement" },
  { metric: "Revenue 2024", value: "> $1 billion; net profit $547M (first profitable year)", source: "TechCrunch via Voxbooster", url: "https://voxbooster.com/blog/telegram-statistics-2026", grade: "Press, from investor documents" },
  { metric: "Revenue H1 2025", value: "$870M (+65% YoY)", source: "Financial Times via Voxbooster", url: "https://voxbooster.com/blog/telegram-statistics-2026", grade: "Press, from bond documents" },
  { metric: "Premium subscribers", value: "15M (May 2025) ≈ 1–1.5% of users", source: "Pavel Durov via Voxbooster", url: "https://voxbooster.com/blog/telegram-statistics-2026", grade: "Company statement" },
  { metric: "Stars purchase route", value: "In-app purchase on iOS and Android; stores take 30%", source: "ForkLog, Durov announcement", url: "https://forklog.com/en/pavel-durov-announces-launch-of-telegram-stars/", grade: "Company statement" },
  { metric: "Fee workaround", value: "Ads bought with Stars are subsidized, so reinvested Stars cost creators ~0%", source: "Decrypt", url: "https://decrypt.co/234246/telegram-ton-linked-stars-currency-toncoin-all-time-high", grade: "Company statement" },
  { metric: "Paid posts in channels", value: "Creators post content unlocked with Stars; withdraw as Toncoin via Fragment", source: "TechCrunch", url: "https://techcrunch.com/2024/07/03/telegram-lets-creators-share-paid-content-to-channels", grade: "Press" },
  { metric: "Mini App reach", value: "Peak 1.44B monthly (Sep 2024), 150–190M by mid-2025", source: "PropellerAds via Voxbooster", url: "https://voxbooster.com/blog/telegram-statistics-2026", grade: "Third-party estimate" }
];
