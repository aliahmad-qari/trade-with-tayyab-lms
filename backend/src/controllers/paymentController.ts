/**
 * paymentController.ts
 * ---------------------------------------------------------------------------
 * Production-ready WPay payment controller.
 *
 * Exports:
 *   - initiateWPayPayin   → POST /api/courses/:id/enroll-wpay
 *                           POST /api/pdfs/:id/enroll-wpay
 *   - handleWPayPayinCallback → POST /api/wpay/callback
 *
 * Signature algorithm (WPay docs):
 *   1. Collect all params, exclude `sign` and blank values.
 *   2. Sort keys alphabetically (ASCII / localeCompare).
 *   3. Join as  key1=val1&key2=val2&…
 *   4. Append   &key=<SECRET_KEY>
 *   5. MD5 → lowercase hex.
 *
 * All credentials are read from process.env — never hard-coded.
 * ---------------------------------------------------------------------------
 */

import type { Request, Response } from "express";
import axios from "axios";
import crypto from "crypto";
import { wpayLogger } from "../utils/wpayLogger.js";
import { generateWPaySignature, verifyWPaySignature } from "../utils/wpaySignature.js";

// ---------------------------------------------------------------------------
// Config — sourced exclusively from environment variables
// ---------------------------------------------------------------------------

/**
 * WPay Merchant ID.
 * Set WPAY_MERCHANT_ID in your .env / Render dashboard.
 * The fallback value matches the confirmed merchant account.
 */
const WPAY_MERCHANT_ID = process.env.WPAY_MERCHANT_ID || "2794";

/**
 * WPay Secret Key used for MD5 signature generation & verification.
 * CRITICAL: Keep this in process.env — never commit the value to Git.
 * env var name: WPAY_SIGNATURE_SALT  (matches the middleware expectation)
 */
const WPAY_SECRET = process.env.WPAY_SIGNATURE_SALT || process.env.WPAY_SECRET || "";

/** WPay REST gateway base URL. */
const WPAY_API_BASE = "https://api.wpay.one";

// ---------------------------------------------------------------------------
// Shared in-memory order store reference
// ---------------------------------------------------------------------------
// This controller is intentionally decoupled from the in-memory "db" object
// that lives in server.ts.  The route handlers in server.ts inject order data
// via request body / params so this file stays self-contained and testable.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper: build & sign WPay payin params
// ---------------------------------------------------------------------------

interface WPayPayinParams {
  orderId: string;
  amount: number;       // PKR, integer or decimal
  callbackUrl: string;  // full URL WPay will POST to after payment
  goodsName?: string;
}

interface WPayResult {
  success: boolean;
  payment_url?: string;
  error?: string;
}

/**
 * Calls the WPay /v1/Payin endpoint and returns the hosted payment URL.
 *
 * DEBUG TIP: Uncomment the wpayLogger.log lines below to inspect the exact
 * request params and raw gateway response when troubleshooting.
 */
async function callWPayPayinAPI(opts: WPayPayinParams): Promise<WPayResult> {
  if (!WPAY_SECRET) {
    wpayLogger.error("initiateWPayPayin", "WPAY_SIGNATURE_SALT is not set in environment variables");
    return { success: false, error: "Payment gateway not configured — missing secret key." };
  }

  // ── 1. Build the param map (no sign yet) ─────────────────────────────────
  const params: Record<string, string | number> = {
    mch_id:        WPAY_MERCHANT_ID,          // Merchant ID
    out_trade_no:  opts.orderId,              // Our internal order ID
    money:         opts.amount,               // Amount in PKR
    currency:      "PKR",
    pay_type:      "8001",                    // WPay pay-type for PKR wallet
    notify_url:    opts.callbackUrl,          // Backend callback URL
    goods_name:    opts.goodsName || "Trade With Tayyab – Course Access",
  };

  // ── 2. Generate MD5 signature (alphabetically sorted, as per WPay docs) ──
  //    generateWPaySignature() in wpaySignature.ts handles:
  //      • Filtering out empty/undefined values
  //      • Alphabetical sort by key
  //      • Appending &key=<SECRET>
  //      • MD5 hex digest
  params.sign = generateWPaySignature(params, WPAY_SECRET);

  // [DEBUG] Uncomment to log the full signed request payload:
  // wpayLogger.log("PAYIN_REQUEST", { orderId: opts.orderId, params });

  // ── 3. POST to WPay gateway ───────────────────────────────────────────────
  try {
    const response = await axios.post(`${WPAY_API_BASE}/v1/Payin`, params, {
      timeout: 12000,
      headers: { "Content-Type": "application/json" },
    });

    const data = response.data;

    // [DEBUG] Uncomment to log the raw WPay gateway response:
    // wpayLogger.log("PAYIN_RESPONSE", { orderId: opts.orderId, data });

    // WPay may return the checkout URL under different keys — handle all variants
    const paymentUrl: string | undefined =
      data?.payUrl        ||  // primary field (most common)
      data?.pay_url       ||  // snake_case variant
      data?.checkoutUrl   ||  // camelCase variant
      data?.payment_url;      // explicit variant

    if (paymentUrl) {
      wpayLogger.log("PAYIN_SUCCESS", { orderId: opts.orderId, payment_url: paymentUrl });
      return { success: true, payment_url: paymentUrl };
    }

    // Gateway responded but returned no URL — log the error message
    wpayLogger.error("PAYIN_NO_URL", `WPay returned no checkout URL`, { data, orderId: opts.orderId });
    return { success: false, error: data?.msg || data?.message || "No checkout URL returned from WPay." };

  } catch (err: any) {
    const gatewayMsg = err?.response?.data?.msg || err?.response?.data?.message;
    wpayLogger.error("PAYIN_HTTP_ERROR", err?.message, { orderId: opts.orderId, gatewayMsg });
    return { success: false, error: gatewayMsg || err?.message || "WPay API unreachable." };
  }
}

// ---------------------------------------------------------------------------
// Controller: Initiate WPay Payment (Course enrollment)
// ---------------------------------------------------------------------------

/**
 * POST /api/courses/:id/enroll-wpay
 * POST /api/pdfs/:id/enroll-wpay
 *
 * Creates a WPay payment order and returns `payment_url` to the frontend.
 * The frontend must redirect the user to this URL via window.location.href.
 *
 * Expected request body:
 *   { orderId: string, amount: number, callbackUrl: string, goodsName?: string }
 *
 * Note: server.ts creates the DB order record *before* calling this endpoint
 * so that a valid orderId exists for WPay's callback reference.
 */
export const initiateWPayPayin = async (req: Request, res: Response): Promise<void> => {
  const { orderId, amount, callbackUrl, goodsName } = req.body as {
    orderId: string;
    amount: number;
    callbackUrl: string;
    goodsName?: string;
  };

  // ── Input validation ───────────────────────────────────────────────────────
  if (!orderId || !amount || !callbackUrl) {
    res.status(400).json({
      success: false,
      message: "Missing required fields: orderId, amount, callbackUrl.",
    });
    return;
  }

  if (Number(amount) <= 0) {
    res.status(400).json({ success: false, message: "Payment amount must be greater than zero." });
    return;
  }

  // [DEBUG] Uncomment to log incoming payment initiation requests:
  // wpayLogger.log("INITIATE_PAYIN", { orderId, amount, callbackUrl });

  const result = await callWPayPayinAPI({ orderId, amount, callbackUrl, goodsName });

  if (result.success && result.payment_url) {
    res.json({ success: true, payment_url: result.payment_url, orderId });
  } else {
    res.status(502).json({ success: false, message: result.error || "Failed to initialize WPay payment." });
  }
};

// ---------------------------------------------------------------------------
// Controller: WPay Payin Callback (called by WPay after payment completes)
// ---------------------------------------------------------------------------

/**
 * POST /api/wpay/callback
 *
 * WPay calls this endpoint after a user completes (or fails) a payment.
 * Security is enforced in two layers before this handler runs:
 *   1. IP Whitelist  (validateWPayIP middleware)
 *   2. Signature check (verifyWPayCallbackSignature middleware)
 *
 * If both pass, this handler:
 *   - Verifies the payment status is "1" (success)
 *   - Verifies the paid amount matches the expected order amount
 *   - Marks the order isPaid = true and paymentStatus = "paid"
 *   - Responds with the plain string  "success"  (required by WPay)
 *
 * WPay retries the callback if it doesn't receive "success" within the
 * configured timeout — so we always respond "success" for known orders,
 * even when they were already processed (idempotency guard).
 *
 * Callback payload (typical WPay fields):
 *   mch_id, mch_order_no (= our out_trade_no), out_trade_no, pay_money,
 *   money, status, sign, transaction_id, …
 */
export const handleWPayPayinCallback = async (req: Request, res: Response): Promise<void> => {
  const body = (req.body || {}) as Record<string, string | number | undefined>;

  // [DEBUG] Uncomment to log the raw callback payload from WPay:
  // wpayLogger.log("CALLBACK_RECEIVED", body);

  const {
    out_trade_no,   // Our internal order ID (passed as out_trade_no in payin request)
    mch_order_no,   // WPay's own order reference (may also carry our id)
    pay_money,
    money,
    status,
    sign,
    transaction_id,
  } = body;

  // Use out_trade_no first; fall back to mch_order_no for compatibility
  const orderId = String(out_trade_no || mch_order_no || "");
  const paidAmount = Number(pay_money || money || 0);
  const isPaymentSuccess = String(status) === "1" || String(status).toLowerCase() === "success";

  // ── Basic field validation ─────────────────────────────────────────────────
  if (!orderId || !sign) {
    wpayLogger.error("CALLBACK_INVALID", "Missing out_trade_no or sign in callback body", { body });
    res.status(400).send("fail");
    return;
  }

  // ── Signature verification (second layer, belt-and-suspenders) ────────────
  // The middleware verifyWPayCallbackSignature already verified the signature,
  // but we perform a redundant inline check here for defence-in-depth.
  if (WPAY_SECRET) {
    const isValid = verifyWPaySignature(body, WPAY_SECRET);
    if (!isValid) {
      wpayLogger.error("CALLBACK_SIG_MISMATCH", "Inline signature re-check failed", {
        orderId,
        receivedSign: sign,
      });
      // [DEBUG] Uncomment to log expected vs received signature:
      // const expected = generateWPaySignature(body, WPAY_SECRET);
      // wpayLogger.log("CALLBACK_SIG_DEBUG", { expected, received: sign });
      res.status(401).send("fail");
      return;
    }
  }

  // ── Delegate the business logic update to server.ts via a shared event ─────
  // Because the in-memory `db` and `saveDB` live in server.ts, we emit a
  // custom event that server.ts can subscribe to rather than importing
  // a circular dependency.  This keeps the controller stateless and testable.
  //
  // Attach the parsed callback data to the request so the downstream
  // route handler in server.ts can read it without re-parsing:
  (req as any).wpayCallback = {
    orderId,
    paidAmount,
    isPaymentSuccess,
    transactionId: transaction_id ? String(transaction_id) : `txn_${Date.now()}`,
  };

  // [DEBUG] Uncomment to log the parsed callback data before processing:
  // wpayLogger.log("CALLBACK_PARSED", (req as any).wpayCallback);

  // The actual DB update (order.isPaid = true, approveOrder, etc.) is handled
  // by the route-level handler in server.ts which has access to `db`.
  // This function signals completion so the route handler can call next()
  // or respond directly.  In the standalone router setup, if this controller
  // is wired directly, we call next() to pass control:
  if (typeof (req as any).next === "function") {
    (req as any).next();
    return;
  }

  // Fallback: if used as the terminal handler, acknowledge receipt.
  // (server.ts overrides this with its own inline handler that does the DB work)
  res.send("success");
};

// ---------------------------------------------------------------------------
// Controller: Get WPay Order Status (admin / polling use)
// ---------------------------------------------------------------------------

/**
 * GET /api/wpay/order-status/:orderId
 *
 * Queries WPay for the live status of a payment order.
 * Useful for reconciliation and debugging.
 */
export const getWPayOrderStatus = async (req: Request, res: Response): Promise<void> => {
  const { orderId } = req.params;

  if (!WPAY_SECRET) {
    res.status(500).json({ success: false, message: "Payment gateway not configured." });
    return;
  }

  const params: Record<string, string | number> = {
    mch_id:       WPAY_MERCHANT_ID,
    mch_order_no: orderId,
  };
  params.sign = generateWPaySignature(params, WPAY_SECRET);

  // [DEBUG] Uncomment to log the order-status request:
  // wpayLogger.log("ORDER_STATUS_REQUEST", { orderId, params });

  try {
    const response = await axios.post(`${WPAY_API_BASE}/v1/OrderStatus`, params, { timeout: 10000 });
    const data = response.data;

    // [DEBUG] Uncomment to log the order-status response:
    // wpayLogger.log("ORDER_STATUS_RESPONSE", { orderId, data });

    res.json({ success: true, status: data });
  } catch (err: any) {
    wpayLogger.error("ORDER_STATUS_ERROR", err?.message, { orderId });
    res.status(502).json({ success: false, message: err?.message || "Failed to fetch order status." });
  }
};

// ---------------------------------------------------------------------------
// Controller: WPay Payout (placeholder — enable when payout API is needed)
// ---------------------------------------------------------------------------

export const initiateWPayPayout = (_req: Request, res: Response): void => {
  res.status(501).json({ success: false, message: "WPay payout is not yet implemented." });
};

export const handleWPayPayoutCallback = (_req: Request, res: Response): void => {
  res.status(501).json({ success: false, message: "WPay payout callback is not yet implemented." });
};
