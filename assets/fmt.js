// tomphan. — shared formatting helpers
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const usd = (v, d = 0) => v === null || v === undefined || !Number.isFinite(v) ? "n/a" : (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
export const usdK = v => !Number.isFinite(v) ? "n/a" : (v < 0 ? "−$" : "$") + (Math.abs(v) / 1000).toFixed(Math.abs(v) >= 9950 ? 0 : 1) + "k";
export const usdM = v => !Number.isFinite(v) ? "n/a" : (v < 0 ? "−$" : "$") + (Math.abs(v) / 1e6).toFixed(Math.abs(v) >= 1e7 ? 1 : 2) + "M";
export const pc = (v, d = 0) => v === null || v === undefined || !Number.isFinite(v) ? "n/a" : (v * 100).toFixed(d) + "%";
export const spc = (v, d = 0) => !Number.isFinite(v) ? "n/a" : (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(d) + "%";
export const hr = (v, d = 2) => !Number.isFinite(v) ? "n/a" : `$${v.toFixed(d)}/hr`;
export const mw = v => `${Math.round(v).toLocaleString("en-US")} MW`;
export const dateLabel = iso => { const d = new Date(iso + "T00:00:00Z"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };
