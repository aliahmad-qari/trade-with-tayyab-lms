/**
 * paymentRoutes.ts
 * ---------------------------------------------------------------------------
 * Express router for WPay payment endpoints.
 *
 * Routes registered here are mounted under /api in server.ts:
 *   POST /api/wpay/callback          → verify IP → verify signature → callback handler
 *   GET  /api/wpay/order-status/:id  → get live order status from WPay
 *   POST /api/wpay/initiate          → generic payin initiation (used by server.ts helpers)
 *
 * NOTE: The primary course/pdf enroll-wpay routes are registered inline in
 * server.ts (they need access to the in-memory `db`). This router handles the
 * callback + status endpoints that are fully self-contained.
 * ---------------------------------------------------------------------------
 */

import { Router } from "express";
import {
  handleWPayPayinCallback,
  getWPayOrderStatus,
  initiateWPayPayin,
} from "../controllers/paymentController.js";
import {
  validateWPayIP,
  verifyWPayCallbackSignature,
} from "../middleware/wpaySecurityMiddleware.js";

const paymentRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/wpay/callback
// ---------------------------------------------------------------------------
// Security stack:
//   1. validateWPayIP              — rejects non-WPay source IPs (+ localhost)
//   2. verifyWPayCallbackSignature — recomputes MD5 and validates against `sign`
//   3. handleWPayPayinCallback     — parses payload, updates order in DB
//
// ⚠️  server.ts registers its OWN inline handler for this path so it can access
//    the in-memory `db`. This route is provided as the modular alternative
//    when the code is refactored to a proper repository pattern.
// ---------------------------------------------------------------------------
paymentRouter.post(
  "/wpay/callback",
  validateWPayIP,
  verifyWPayCallbackSignature,
  handleWPayPayinCallback
);

// ---------------------------------------------------------------------------
// GET /api/wpay/order-status/:orderId
// ---------------------------------------------------------------------------
// Queries WPay for the live status of a specific order.
// Useful for admin reconciliation and debugging payment flows.
//
// [DEBUG] Add auth middleware here in production if exposing to frontend:
//   paymentRouter.get("/wpay/order-status/:orderId", requireAuth, getWPayOrderStatus);
// ---------------------------------------------------------------------------
paymentRouter.get("/wpay/order-status/:orderId", getWPayOrderStatus);

// ---------------------------------------------------------------------------
// POST /api/wpay/initiate
// ---------------------------------------------------------------------------
// Generic payin initiation — accepts { orderId, amount, callbackUrl } body.
// The primary enroll-wpay endpoints in server.ts call wpayInitiatePayin()
// directly; this route is for external / future consumers.
// ---------------------------------------------------------------------------
paymentRouter.post("/wpay/initiate", initiateWPayPayin);

export default paymentRouter;
