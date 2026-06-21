/**
 * WPay Payment Routes
 * ---------------------------------------------------------------------------
 * Defines the Express router for all WPay-related endpoints.
 *
 * Route map:
 *   POST  /api/payments/wpay/initiate       — Create a payin order
 *   POST  /api/payments/wpay/callback        — Receive WPay server callback
 *   GET   /api/payments/wpay/status/:orderNo — Query order status
 *
 * The callback route is protected by IP whitelist and signature verification
 * middleware. The initiate and status routes should be protected by your
 * existing JWT auth middleware in production.
 *
 * @module routes/paymentRoutes
 */

import { Router } from "express";
import {
  validateWPayIP,
  verifyWPayCallbackSignature,
} from "../middleware/wpaySecurityMiddleware.js";
import {
  handleWPayPayinCallback,
  initiateWPayPayin,
  getWPayOrderStatus,
  initiateWPayPayout,
  handleWPayPayoutCallback
} from "../controllers/paymentController.js";

const paymentRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/payments/wpay/initiate
// ---------------------------------------------------------------------------
// Called by the authenticated frontend to create a new deposit order.
// TODO: Add your JWT auth middleware here in production:
//   paymentRouter.post("/initiate", requireAuth, initiateWPayPayin);
paymentRouter.post("/initiate", initiateWPayPayin);

// ---------------------------------------------------------------------------
// POST /api/payments/wpay/callback
// ---------------------------------------------------------------------------
// Called by WPay servers to notify us of payment results.
// Protected by IP whitelist + signature verification — no JWT needed.
paymentRouter.post(
  "/callback",
  validateWPayIP,
  verifyWPayCallbackSignature,
  handleWPayPayinCallback
);

// ---------------------------------------------------------------------------
// GET /api/payments/wpay/status/:orderNo
// ---------------------------------------------------------------------------
// Called by the frontend to poll for order completion after checkout.
// TODO: Add your JWT auth middleware here in production.
paymentRouter.get("/status/:orderNo", getWPayOrderStatus);

// ---------------------------------------------------------------------------
// POST /api/payments/wpay/payout/initiate
// ---------------------------------------------------------------------------
// Called by the authenticated frontend to create a new withdrawal order.
paymentRouter.post("/payout/initiate", initiateWPayPayout);

// ---------------------------------------------------------------------------
// POST /api/payments/wpay/payout/callback
// ---------------------------------------------------------------------------
// Called by WPay servers to notify us of payout results.
paymentRouter.post(
  "/payout/callback",
  validateWPayIP,
  verifyWPayCallbackSignature,
  handleWPayPayoutCallback
);

export default paymentRouter;
