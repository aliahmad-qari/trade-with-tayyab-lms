/**
 * WPay Signature Utility
 * ---------------------------------------------------------------------------
 * Generates the MD5 hash signature required by the WPay Payment Gateway.
 *
 * Algorithm (per WPay docs):
 *   1. Take all request parameters (excluding `sign` itself and any empty values).
 *   2. Sort them **alphabetically** by key name.
 *   3. Concatenate as `key1=value1&key2=value2&…`
 *   4. Append `&key=<SECRET_KEY>` (the merchant secret salt).
 *   5. MD5-hash the resulting string → lowercase hex digest.
 *
 * @module utils/wpaySignature
 */

import crypto from "crypto";

/**
 * Generate an MD5 signature for WPay API requests / callback verification.
 *
 * @param params  - Key/value map of request parameters (plain object).
 * @param secretKey - The merchant's WPay secret salt (WPAY_SIGNATURE_SALT).
 * @returns Lowercase hex MD5 digest.
 *
 * @example
 * ```ts
 * const sig = generateWPaySignature(
 *   { mch_id: "2794", mch_order_no: "ord_abc", pay_money: "3999" },
 *   process.env.WPAY_SIGNATURE_SALT!
 * );
 * ```
 */
export const generateWPaySignature = (
  params: Record<string, string | number | undefined>,
  secretKey: string
): string => {
  // 1. Filter out the `sign` field and any keys with empty / undefined values.
  const filtered = Object.entries(params).filter(
    ([key, value]) =>
      key !== "sign" && value !== undefined && value !== null && String(value) !== ""
  );

  // 2. Sort alphabetically by key name (case-sensitive, ASCII order).
  filtered.sort(([a], [b]) => a.localeCompare(b));

  // 3. Build the query string: key1=value1&key2=value2&…
  const queryString = filtered
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");

  // 4. Append the secret key.
  const stringToSign = `${queryString}&key=${secretKey}`;

  // 5. MD5 hash → lowercase hex.
  return crypto.createHash("md5").update(stringToSign).digest("hex");
};

/**
 * Verify an incoming WPay callback signature against the expected one.
 *
 * @param params    - The full callback body (includes `sign`).
 * @param secretKey - Merchant secret salt.
 * @returns `true` if the provided `sign` matches the computed signature.
 */
export const verifyWPaySignature = (
  params: Record<string, string | number | undefined>,
  secretKey: string
): boolean => {
  const receivedSign = String(params.sign ?? "").toLowerCase();
  if (!receivedSign) return false;

  const computedSign = generateWPaySignature(params, secretKey);
  // Constant-time comparison to prevent timing attacks.
  return crypto.timingSafeEqual(
    Buffer.from(receivedSign, "utf8"),
    Buffer.from(computedSign, "utf8")
  );
};
