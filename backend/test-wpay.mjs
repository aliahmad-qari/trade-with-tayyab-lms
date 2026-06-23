/**
 * WPay PayIn (H2C / cashier) sandbox verification harness.
 * ---------------------------------------------------------------------------
 * Implements the OFFICIAL WPay spec (Pakistan PayIn H2C):
 *   POST https://sandbox.wpay.one/v1/Collect
 *   Content-Type: application/x-www-form-urlencoded
 *   Fields: mchId, currency, out_trade_no, pay_type, money, notify_url, returnUrl, sign
 *   Sign: ASCII-sorted key=value&… + &key=<secret>, MD5 lowercase (empty values skipped)
 *   Success: { code: 0, msg: "success", data: { url, transaction_Id, host } }
 *
 * Usage (PowerShell) — falls back to sandbox test creds below if env unset:
 *   node test-wpay.mjs
 * ---------------------------------------------------------------------------
 */
import crypto from "crypto";

// ── Sandbox test config (official WPay test environment) ─────────────────────
const HOST   = process.env.WPAY_PAYIN_URL  || "https://sandbox.wpay.one/v1/Collect";
const MCH    = process.env.WPAY_MCH_ID     || "1000";
const SECRET = process.env.WPAY_SECRET_KEY || "eb6080dbc8dc429ab86a1cd1c337975d";
const NOTIFY = process.env.WPAY_NOTIFY_URL || "https://trade-with-tayyab-lms.onrender.com/api/wpay/callback";
const RETURN = process.env.WPAY_RETURN_URL || "https://trade-with-tayyab-lms.vercel.app/payment-success";
const PAY_TYPE = process.env.WPAY_PAY_TYPE || "JAZZCASH"; // JAZZCASH | EASYPAISA | SCANCODE
const CURRENCY = process.env.WPAY_CURRENCY || "PKR";
const MONEY    = process.env.WPAY_TEST_MONEY || "100";    // integer, within 100–50000

// WPay MD5 signature: ASCII-sorted key=value&…, skip empty/sign, append &key=SECRET.
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

// Exact spec field names — mchId (not mch_id), returnUrl (not return_url), NO goods_name.
const params = {
  mchId:        MCH,
  currency:     CURRENCY,
  out_trade_no: `test_${Date.now()}`,
  pay_type:     PAY_TYPE,
  money:        MONEY,
  notify_url:   NOTIFY,
  returnUrl:    RETURN,
};
params.sign = wpaySign(params, SECRET);

const body = new URLSearchParams(params).toString();

console.log("\n[Request] POST", HOST);
console.log("[Request] Content-Type: application/x-www-form-urlencoded");
console.log("[Request] Body:", body);

try {
  const resp = await fetch(HOST, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await resp.text();
  console.log("\n→ STATUS:", resp.status);
  console.log("→ RESPONSE:", text.slice(0, 2000));
  try {
    const json = JSON.parse(text);
    if (Number(json.code) === 0 && json.data?.url) {
      console.log("\n✅ SUCCESS — checkout URL:", json.data.url);
      console.log("   platform txn id:", json.data.transaction_Id);
      console.log("   → Sandbox will auto-fire a success callback to notify_url in ~10s.");
    } else {
      console.log(`\n⚠️  Non-success code=${json.code} msg=${json.msg}`);
    }
  } catch {
    console.log("\n⚠️  Response was not JSON (see raw body above).");
  }
} catch (e) {
  console.error("\n❌ ERROR:", e.message);
}
