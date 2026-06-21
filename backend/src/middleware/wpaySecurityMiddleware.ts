/**
 * WPay Security Middleware
 * ---------------------------------------------------------------------------
 * Express middleware stack that protects the WPay callback endpoint with two
 * layers of verification:
 *
 *   1. **IP Whitelist** – Ensures the request originates from a known WPay
 *      server IP. Production and test IPs are maintained separately.
 *
 *   2. **Signature Verification** – Recomputes the MD5 signature from the
 *      callback body and compares it to the `sign` field, ensuring the
 *      payload has not been tampered with.
 *
 * These middlewares are designed to be stacked before the callback controller:
 *
 * ```ts
 * router.post("/callback", validateWPayIP, verifyWPayCallbackSignature, callbackHandler);
 * ```
 *
 * @module middleware/wpaySecurityMiddleware
 */

import type { Request, Response, NextFunction } from "express";
import { verifyWPaySignature } from "../utils/wpaySignature.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** WPay callback server IPs – sourced from WPay merchant dashboard. */
const WPAY_ALLOWED_IPS: Readonly<Record<string, readonly string[]>> = {
  production: ["27.124.46.151"],
  test: ["27.124.45.41"],
} as const;

/**
 * Build a flat set of all whitelisted IPs for fast O(1) lookups.
 * In production you may want to load *only* the production list,
 * but for safety we accept both during the integration phase.
 */
const ALLOWED_IP_SET: ReadonlySet<string> = new Set([
  ...WPAY_ALLOWED_IPS.production,
  ...WPAY_ALLOWED_IPS.test,
  // Always allow loopback for local development / testing.
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);

// ---------------------------------------------------------------------------
// Middleware: IP Whitelist
// ---------------------------------------------------------------------------

/**
 * Reject any request whose source IP is not in the WPay whitelist.
 *
 * Handles `X-Forwarded-For` (for reverse-proxied deployments like Render /
 * Railway / Vercel). When the header is present the **first** entry is treated
 * as the original client IP.
 *
 * ⚠️  In production behind a trusted proxy, set `app.set('trust proxy', 1)`
 *     so that `req.ip` already reflects the real client IP.
 */
export const validateWPayIP = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : req.ip || req.socket.remoteAddress || "";

  // Normalise IPv6-mapped IPv4 (e.g. "::ffff:27.124.46.151" → "27.124.46.151").
  const clientIp = rawIp.replace(/^::ffff:/, "");

  if (!ALLOWED_IP_SET.has(clientIp)) {
    console.warn(
      `[WPay Security] ❌ Blocked callback from unauthorized IP: ${clientIp}`
    );
    res.status(403).json({
      success: false,
      code: "IP_FORBIDDEN",
      message: "Request origin IP is not authorized for WPay callbacks.",
    });
    return;
  }

  // Attach the verified IP for downstream logging.
  (req as any).wpayClientIp = clientIp;
  next();
};

// ---------------------------------------------------------------------------
// Middleware: Signature Verification
// ---------------------------------------------------------------------------

/**
 * Verify the MD5 `sign` field in the request body against the locally
 * computed signature using WPAY_SIGNATURE_SALT.
 *
 * Must run **after** `express.json()` so that `req.body` is populated.
 */
export const verifyWPayCallbackSignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const secretKey = process.env.WPAY_SIGNATURE_SALT;

  if (!secretKey) {
    console.error(
      "[WPay Security] ❌ WPAY_SIGNATURE_SALT is not configured in environment."
    );
    res.status(500).json({
      success: false,
      code: "CONFIG_ERROR",
      message: "Payment gateway is not properly configured on the server.",
    });
    return;
  }

  const body = req.body as Record<string, string | number | undefined>;

  if (!body || !body.sign) {
    res.status(400).json({
      success: false,
      code: "MISSING_SIGNATURE",
      message: "Request is missing the required `sign` parameter.",
    });
    return;
  }

  const isValid = verifyWPaySignature(body, secretKey);

  if (!isValid) {
    console.warn(
      `[WPay Security] ❌ Signature verification failed for order: ${body.mch_order_no ?? "unknown"}`
    );
    res.status(401).json({
      success: false,
      code: "SIGNATURE_MISMATCH",
      message: "Signature verification failed. Request may be tampered with.",
    });
    return;
  }

  next();
};
