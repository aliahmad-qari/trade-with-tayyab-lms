import axios from "axios";
import crypto from "crypto";

const WPAY_MERCHANT_ID = "2794";
const WPAY_SECRET      = "eb6080dbc8dc429ab86a1cd1c337975d";
const WPAY_API_BASE    = "https://api.wpay.one";

function wpaySign(params, secret) {
  const sorted = Object.entries(params)
    .filter(([k, v]) => k !== "sign" && v !== undefined && v !== "" && v !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  const str = sorted.map(([k, v]) => `${k}=${v}`).join("&") + `&key=${secret}`;
  console.log("\n[Sign] String to MD5:", str);
  const sig = crypto.createHash("md5").update(str).digest("hex");
  console.log("[Sign] Result:", sig);
  return sig;
}

const orderId = `test_${Date.now()}`;
const params = {
  mch_id:       WPAY_MERCHANT_ID,
  out_trade_no: orderId,
  money:        5000,
  currency:     "PKR",
  pay_type:     "8001",
  notify_url:   "https://trade-with-tayyab-lms.onrender.com/api/wpay/callback",
  goods_name:   "Trade With Tayyab",
};
params.sign = wpaySign(params, WPAY_SECRET);

console.log("\n[Request] POST", WPAY_API_BASE + "/v1/Payin");
console.log("[Request] Body:", JSON.stringify(params, null, 2));

try {
  const resp = await axios.post(`${WPAY_API_BASE}/v1/Payin`, params, {
    timeout: 15000,
    headers: { "Content-Type": "application/json" },
  });
  console.log("\n✅ STATUS:", resp.status);
  console.log("✅ RESPONSE:", JSON.stringify(resp.data, null, 2));
} catch (e) {
  console.error("\n❌ ERROR:", e.message);
  if (e.response) {
    console.error("❌ HTTP STATUS:", e.response.status);
    console.error("❌ RESPONSE DATA:", JSON.stringify(e.response.data, null, 2));
    console.error("❌ RESPONSE HEADERS:", JSON.stringify(e.response.headers, null, 2));
  } else if (e.code) {
    console.error("❌ ERROR CODE:", e.code, "(network/timeout)");
  }
}
