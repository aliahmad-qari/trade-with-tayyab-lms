/**
 * WPay endpoint verification / discovery harness.
 * ---------------------------------------------------------------------------
 * Usage (PowerShell):
 *   $env:WPAY_PAYIN_URL="https://api.wpay.one/api/<Controller>/<Action>"; `
 *   $env:WPAY_SECRET_KEY="b42f28b0f5844f77bffcc86cc28882f4"; `
 *   node test-wpay.mjs
 *
 * Reads config from env (falls back to the live values below) and POSTs one
 * signed Payin request, printing the sign string, full payload, HTTP status
 * and raw gateway body so you can confirm the endpoint + field names match the
 * WPay merchant dashboard spec. Uses built-in fetch (Node 18+), no deps.
 */
import crypto from "crypto";

const MCH    = process.env.WPAY_MCH_ID     || "2794";
const SECRET = process.env.WPAY_SECRET_KEY || "b42f28b0f5844f77bffcc86cc28882f4";
const URL    = process.env.WPAY_PAYIN_URL  || ""; // set to the REAL endpoint
const NOTIFY = process.env.WPAY_NOTIFY_URL || "https://trade-with-tayyab-lms.onrender.com/api/wpay/callback";

// Field-name overrides (defaults match server.ts defaults).
const F = {
  mch:      process.env.WPAY_FIELD_MCH      || "mch_id",
  order:    process.env.WPAY_FIELD_ORDER    || "out_trade_no",
  amount:   process.env.WPAY_FIELD_AMOUNT   || "money",
  currency: process.env.WPAY_FIELD_CURRENCY || "currency",
  payType:  process.env.WPAY_FIELD_PAYTYPE  || "pay_type",
  notify:   process.env.WPAY_FIELD_NOTIFY   || "notify_url",
  goods:    process.env.WPAY_FIELD_GOODS    || "goods_name",
};
const PAY_TYPE = process.env.WPAY_PAY_TYPE || "8001";
const CURRENCY = process.env.WPAY_CURRENCY || "PKR";

function wpaySign(params, secret) {
  const s = Object.entries(params)
    .filter(([k, v]) => k !== "sign" && v !== undefined && v !== "" && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&") + `&key=${secret}`;
  console.log("\n[Sign] String to MD5:", s);
  const sig = crypto.createHash("md5").update(s).digest("hex");
  console.log("[Sign] Result (lowercase md5):", sig);
  return sig;
}

const params = {
  [F.mch]:      MCH,
  [F.order]:    `test_${Date.now()}`,
  [F.amount]:   5000,
  [F.currency]: CURRENCY,
  [F.payType]:  PAY_TYPE,
  [F.notify]:   NOTIFY,
  [F.goods]:    "Trade With Tayyab",
};
params.sign = wpaySign(params, SECRET);

console.log("\n[Request] POST", URL || "(WPAY_PAYIN_URL not set!)");
console.log("[Request] Body:", JSON.stringify(params, null, 2));

if (!URL) {
  console.error("\n❌ Set WPAY_PAYIN_URL to the real Payin endpoint from mch.wpay.one and re-run.");
  process.exit(1);
}

try {
  const resp = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const text = await resp.text();
  console.log("\n→ STATUS:", resp.status);
  console.log("→ RESPONSE:", text.slice(0, 2000));
} catch (e) {
  console.error("\n❌ ERROR:", e.message);
}
