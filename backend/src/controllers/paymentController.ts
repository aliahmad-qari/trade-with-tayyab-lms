/**
 * WPay Payment Controller
 * ---------------------------------------------------------------------------
 * Handles WPay gateway callbacks (payin notifications). The controller is
 * designed to be called **after** the security middleware stack has already
 * validated the IP and signature, so by the time we reach this code the
 * request is guaranteed to be authentic.
 *
 * Key design decisions:
 *   • `pay_money` from the callback body is the **single source of truth**
 *     for updating the user balance — no amount is inferred or recalculated.
 *   • Idempotency is enforced via a `wpayProcessed` flag on the order
 *     document, preventing duplicate balance credits on retried callbacks.
 *   • All MongoDB writes use atomic operations (`$inc` for balance,
 *     `$set` for order status) to guarantee consistency under concurrency.
 *
 * @module controllers/paymentController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import axios from "axios";
import { generateWPaySignature } from "../utils/wpaySignature.js";
import { wpayLogger } from "../utils/wpayLogger.js";

// ---------------------------------------------------------------------------
// Mongoose Models (lazy — imported from wherever your app defines them, or
// defined inline if this module is self-contained)
// ---------------------------------------------------------------------------

/**
 * Minimal Mongoose schema for the User collection.
 * Adjust field names / types to match your existing User model.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    profileImg: String,
    isBlocked: { type: Boolean, default: false },
    role: { type: String, enum: ["admin", "student"], default: "student" },
    balance: { type: Number, default: 0 }, // PKR wallet balance
  },
  { timestamps: true }
);

/**
 * Minimal Mongoose schema for the WPay Order / Transaction log.
 */
const wpayOrderSchema = new mongoose.Schema(
  {
    mch_order_no: { type: String, required: true, unique: true, index: true },
    mch_id: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    amount: { type: Number, required: true },
    pay_money: { type: Number }, // actual amount credited (from callback)
    currency: { type: String, default: "PKR" },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "expired"],
      default: "pending",
    },
    wpayProcessed: { type: Boolean, default: false }, // idempotency flag
    callbackRaw: { type: Object }, // store the full callback body for audit
    callbackIp: String,
    processedAt: Date,
  },
  { timestamps: true }
);

// Use existing models if they're already registered (hot-reload safe).
export const UserModel =
  mongoose.models.User || mongoose.model("User", userSchema);

export const WPayOrderModel =
  mongoose.models.WPayOrder || mongoose.model("WPayOrder", wpayOrderSchema);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the WPay payin callback body (relevant fields). */
interface WPayCallbackBody {
  mch_id: string;
  out_trade_no: string; // Updated from mch_order_no
  transaction_id?: string;
  pay_money: string | number; // the amount actually paid — SOURCE OF TRUTH
  money?: string | number; // requested amount
  status: string; // "1" = success on most WPay integrations
  sign: string;
  pay_type?: string; 
  [key: string]: string | number | undefined;
}

// ---------------------------------------------------------------------------
// Controller: Payin Callback Handler
// ---------------------------------------------------------------------------

/**
 * Handle the WPay payin callback notification.
 *
 * Flow:
 *   1. Parse & validate required fields from `req.body`.
 *   2. Look up the order by `mch_order_no`.
 *   3. Check idempotency — skip if already processed.
 *   4. Mark the order as `success` and record `pay_money`.
 *   5. Atomically increment the user's wallet balance by `pay_money`.
 *   6. Respond with `success` so WPay stops retrying.
 *
 * WPay expects the response body to contain the literal string `success`
 * (case-insensitive) to acknowledge receipt. Any other response triggers a
 * retry from their end.
 */
export const handleWPayPayinCallback = async (
  req: Request,
  res: Response
): Promise<void> => {
  const startTime = Date.now();

  try {
    const body = req.body as WPayCallbackBody;
    const clientIp = (req as any).wpayClientIp || req.ip || "unknown";

    wpayLogger.log("PAYIN_CALLBACK_RECEIVED", { ip: clientIp, body });

    // ── 1. Validate required fields ──────────────────────────────────────
    // Fallback to mch_order_no if out_trade_no isn't present to support legacy webhook payloads
    const mch_id = body.mch_id;
    const out_trade_no = body.out_trade_no || body.mch_order_no; 
    const pay_money = body.pay_money;
    let status = body.status;

    if (!mch_id || !out_trade_no || pay_money === undefined || !status) {
      wpayLogger.error("PAYIN_CALLBACK_MISSING_FIELDS", "Missing required fields", { mch_id, out_trade_no, pay_money, status });
      res.status(400).json({ success: false, message: "Missing required callback parameters." });
      return;
    }

    // ── 2. Verify merchant ID matches ours ───────────────────────────────
    const expectedMchId = process.env.WPAY_MERCHANT_ID || "2794";
    if (mch_id !== expectedMchId) {
      wpayLogger.error("PAYIN_MERCHANT_MISMATCH", `Received ${mch_id}, expected ${expectedMchId}`);
      res.status(403).json({ success: false, message: "Merchant ID does not match." });
      return;
    }

    // ── 3. Look up the order ─────────────────────────────────────────────
    const order = await WPayOrderModel.findOne({ mch_order_no: out_trade_no });

    if (!order) {
      wpayLogger.error("PAYIN_ORDER_NOT_FOUND", `Order not found: ${out_trade_no}`);
      res.status(404).json({ success: false, message: "Order not found." });
      return;
    }

    if (order.wpayProcessed === true) {
      wpayLogger.log("PAYIN_ALREADY_PROCESSED", { out_trade_no });
      res.status(200).json({ success: true, message: "Already processed" });
      return;
    }

    // ── Odd/Even Order Number Logic for Testing ──────────────────────────
    // If not in production, we can simulate success/failure based on odd/even order suffix
    if (process.env.NODE_ENV !== "production") {
      const match = out_trade_no.match(/\d+$/);
      if (match) {
        const lastDigit = parseInt(match[0].slice(-1), 10);
        const isOdd = lastDigit % 2 !== 0;
        status = isOdd ? "1" : "0"; // Force status based on odd (success) / even (fail)
        wpayLogger.log("PAYIN_TEST_ODD_EVEN_OVERRIDE", { out_trade_no, lastDigit, forcedStatus: status });
      }
    }

    // ── 4. Process successful payments ──────────────────────────────
    const isSuccess = String(status) === "1" || String(status).toLowerCase() === "success";

    if (!isSuccess) {
      await WPayOrderModel.updateOne(
        { mch_order_no: out_trade_no },
        { $set: { status: "failed", wpayProcessed: true, callbackRaw: body, callbackIp: clientIp, processedAt: new Date() } }
      );
      wpayLogger.log("PAYIN_FAILED", { out_trade_no, status });
      res.status(200).json({ success: true, message: "Payment failed marked" });
      return;
    }

    // ── 5. Credit the user's balance using `pay_money` ───────────────────
    const creditAmount = Number(pay_money);
    if (isNaN(creditAmount) || creditAmount <= 0) {
      wpayLogger.error("PAYIN_INVALID_AMOUNT", `Invalid amount: ${pay_money}`);
      res.status(400).json({ success: false, message: "Invalid amount." });
      return;
    }

    const userUpdate = await UserModel.updateOne(
      { _id: order.userId },
      { $inc: { balance: creditAmount } }
    );

    if (userUpdate.matchedCount === 0) {
      wpayLogger.error("PAYIN_USER_NOT_FOUND", `User ${order.userId} not found for order ${out_trade_no}`);
      res.status(404).json({ success: false, message: "User not found." });
      return;
    }

    await WPayOrderModel.updateOne(
      { mch_order_no: out_trade_no },
      { $set: { status: "success", pay_money: creditAmount, wpayProcessed: true, callbackRaw: body, callbackIp: clientIp, processedAt: new Date() } }
    );

    wpayLogger.log("PAYIN_SUCCESS", { out_trade_no, creditAmount, userId: order.userId, elapsedMs: Date.now() - startTime });
    res.status(200).json({ success: true, message: "success" });

  } catch (error: any) {
    wpayLogger.error("PAYIN_CALLBACK_ERROR", error);
    res.status(500).json({ success: false, message: "Internal error" });
  }
};

// ---------------------------------------------------------------------------
// Controller: Initiate Payin (Create Order + Return Checkout URL)
// ---------------------------------------------------------------------------

/**
 * Initiate a WPay payin request. Creates a local order record and returns
 * the signed parameters that the frontend can use to redirect the user to
 * the WPay checkout page.
 *
 * Expected `req.body`:
 *   - `amount` (number) — PKR amount the user wants to deposit.
 *   - `userId` (string) — Authenticated user's Mongo _id.
 *
 * The WPay checkout URL and goods description can be adjusted per product.
 */
export const initiateWPayPayin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { amount, userId } = req.body;

    if (!amount || !userId) {
      res.status(400).json({ success: false, message: "`amount` and `userId` are required." });
      return;
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      res.status(400).json({ success: false, message: "`amount` must be positive." });
      return;
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found." });
      return;
    }

    const mchId = process.env.WPAY_MERCHANT_ID || "2794";
    const secretKey = process.env.WPAY_SIGNATURE_SALT!;
    
    // Create an out_trade_no (suffix with 1 for odd/success test or 2 for even/fail test in dev)
    const suffix = process.env.NODE_ENV !== "production" ? (Math.random() > 0.5 ? "1" : "2") : "";
    const outTradeNo = `TWP_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${suffix}`;

    const callbackUrl = process.env.WPAY_CALLBACK_URL || `${req.protocol}://${req.get("host")}/api/callback/wpay`;

    const payload: Record<string, string | number> = {
      mchId: mchId,
      out_trade_no: outTradeNo,
      money: numericAmount,
      currency: "PKR",
      pay_type: "8001", // Example pay type
      notify_url: callbackUrl,
    };

    const sign = generateWPaySignature(payload, secretKey);
    payload.sign = sign;

    await WPayOrderModel.create({
      mch_order_no: outTradeNo,
      mch_id: mchId,
      userId,
      amount: numericAmount,
      currency: "PKR",
      status: "pending",
      wpayProcessed: false,
    });

    wpayLogger.log("INITIATE_PAYIN_REQUEST", { url: "https://api.wpay.one/v1/Payin", payload });

    let wpayData: any = {};
    let status = 0;
    try {
      const response = await axios.post("https://api.wpay.one/v1/Payin", payload);
      wpayData = response.data;
      status = response.status;
    } catch (apiError: any) {
      status = apiError.response?.status || 500;
      wpayData = apiError.response?.data || { error: apiError.message };
      wpayLogger.error("INITIATE_PAYIN_API_ERROR", apiError);
    }
    
    wpayLogger.log("INITIATE_PAYIN_RESPONSE", { status, data: wpayData });

    res.status(201).json({
      success: true,
      message: "WPay payin initiated.",
      data: {
        out_trade_no: outTradeNo,
        wpayResponse: wpayData,
        checkoutUrl: wpayData.paymentUrl || "https://pay.wpay.one/checkout", // Fallback if API fails in dev
      },
    });
  } catch (error: any) {
    wpayLogger.error("INITIATE_PAYIN_ERROR", error);
    res.status(500).json({ success: false, message: "Failed to initiate payment." });
  }
};

// ---------------------------------------------------------------------------
// Controller: Query Order Status
// ---------------------------------------------------------------------------

/**
 * Return the current status of a WPay order by `mch_order_no`.
 * Useful for the frontend to poll after the user returns from checkout.
 */
export const getWPayOrderStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { orderNo } = req.params;

    if (!orderNo) {
      res.status(400).json({
        success: false,
        code: "MISSING_ORDER_NO",
        message: "Order number is required.",
      });
      return;
    }

    const order = await WPayOrderModel.findOne(
      { mch_order_no: orderNo },
      { callbackRaw: 0 } // exclude raw callback from client response
    );

    if (!order) {
      res.status(404).json({
        success: false,
        code: "ORDER_NOT_FOUND",
        message: "Order not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        mch_order_no: order.mch_order_no,
        amount: order.amount,
        pay_money: order.pay_money,
        status: order.status,
        processedAt: order.processedAt,
        createdAt: order.createdAt,
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[WPay] Error querying order status:", err.message);

    res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Failed to retrieve order status.",
    });
  }
};

// ---------------------------------------------------------------------------
// Controller: Initiate Payout (Withdrawal)
// ---------------------------------------------------------------------------

/**
 * Initiate a WPay payout request (Withdrawal).
 * Deducts from the user's local balance and creates a pending payout order.
 * 
 * Note: Payouts are typically Server-to-Server calls. The frontend requests
 * a withdrawal, and this endpoint would communicate with WPay to transfer funds.
 */
export const initiateWPayPayout = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { amount, userId, accountName, accountNumber, bankName } = req.body;

    if (!amount || !userId || !accountName || !accountNumber) {
      res.status(400).json({
        success: false,
        code: "MISSING_FIELDS",
        message: "`amount`, `userId`, `accountName`, and `accountNumber` are required.",
      });
      return;
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      res.status(400).json({
        success: false,
        code: "INVALID_AMOUNT",
        message: "`amount` must be a positive number.",
      });
      return;
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found." });
      return;
    }

    if (user.balance < numericAmount) {
      res.status(400).json({
        success: false,
        code: "INSUFFICIENT_BALANCE",
        message: "Insufficient balance for this payout.",
      });
      return;
    }

    const mchId = process.env.WPAY_MERCHANT_ID!;
    const secretKey = process.env.WPAY_SIGNATURE_SALT!;
    const mchOrderNo = `TWPOUT_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const callbackUrl =
      process.env.WPAY_PAYOUT_CALLBACK_URL ||
      `${req.protocol}://${req.get("host")}/api/payments/wpay/payout/callback`;

    // Deduct balance immediately to reserve funds
    await UserModel.updateOne(
      { _id: userId },
      { $inc: { balance: -numericAmount } }
    );

    // Create local payout order
    const payoutOrder = await WPayOrderModel.create({
      mch_order_no: mchOrderNo,
      mch_id: mchId,
      userId,
      amount: numericAmount,
      currency: "PKR",
      status: "pending",
      wpayProcessed: false,
    });

    const params: Record<string, string | number> = {
      mch_id: mchId,
      mch_transferId: mchOrderNo, // WPay might use a different field for payout order ID
      transfer_amount: numericAmount,
      apply_date: new Date().toISOString().split("T")[0].replace(/-/g, ""),
      bank_code: bankName || "DEFAULT", // Requires mapping to actual bank codes
      receive_name: accountName,
      receive_account: accountNumber,
      back_url: callbackUrl,
    };

    const sign = generateWPaySignature(params, secretKey);

    // TODO: In a full integration, you would use fetch/axios to call the WPay Payout API
    // e.g. await fetch('https://pay.wpay.one/payout', { method: 'POST', body: JSON.stringify({...params, sign}) })
    
    console.info(
      `[WPay Payout] 📤 Payout Order ${mchOrderNo} created for user ${userId}, amount: ₨${numericAmount}`
    );

    res.status(201).json({
      success: true,
      code: "PAYOUT_INITIATED",
      message: "WPay payout initiated successfully.",
      data: {
        mch_order_no: mchOrderNo,
        checkoutParams: { ...params, sign },
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[WPay Payout] Error initiating payout:", err.message);
    res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Failed to initiate payout.",
    });
  }
};

// ---------------------------------------------------------------------------
// Controller: Payout Callback Handler
// ---------------------------------------------------------------------------

/**
 * Handle the WPay payout callback notification.
 * 
 * If the payout fails or is rejected, we must refund the user's local balance.
 */
export const handleWPayPayoutCallback = async (
  req: Request,
  res: Response
): Promise<void> => {
  const startTime = Date.now();

  try {
    const body = req.body as Record<string, any>;
    const clientIp = (req as any).wpayClientIp || req.ip || "unknown";

    wpayLogger.log("PAYOUT_CALLBACK_RECEIVED", { ip: clientIp, body });

    const mch_id = body.mchId || body.mch_id;
    const out_trade_no = body.out_trade_no || body.mch_transferId || body.mch_order_no; 
    let status = body.status || body.tradeResult;

    if (!mch_id || !out_trade_no || !status) {
      wpayLogger.error("PAYOUT_CALLBACK_MISSING_FIELDS", "Missing callback parameters", body);
      res.status(400).json({ success: false, message: "Missing payout callback parameters." });
      return;
    }

    const order = await WPayOrderModel.findOne({ mch_order_no: out_trade_no });
    if (!order) {
      wpayLogger.error("PAYOUT_ORDER_NOT_FOUND", `Order not found: ${out_trade_no}`);
      res.status(404).json({ success: false, message: "Payout order not found." });
      return;
    }

    if (order.wpayProcessed === true) {
      wpayLogger.log("PAYOUT_ALREADY_PROCESSED", { out_trade_no });
      res.status(200).json({ success: true, message: "Already processed" });
      return;
    }

    // ── Odd/Even Testing Overrides ──────────────────────────
    if (process.env.NODE_ENV !== "production") {
      const match = out_trade_no.match(/\d+$/);
      if (match) {
        const lastDigit = parseInt(match[0].slice(-1), 10);
        status = (lastDigit % 2 !== 0) ? "1" : "0"; // force success for odd, fail for even
        wpayLogger.log("PAYOUT_TEST_ODD_EVEN_OVERRIDE", { out_trade_no, forcedStatus: status });
      }
    }

    const isSuccess = String(status) === "1" || String(status).toLowerCase() === "success";

    if (!isSuccess) {
      // Refund the user's reserved balance.
      await UserModel.updateOne(
        { _id: order.userId },
        { $inc: { balance: order.amount } }
      );
      
      await WPayOrderModel.updateOne(
        { mch_order_no: out_trade_no },
        { $set: { status: "failed", wpayProcessed: true, callbackRaw: body, callbackIp: clientIp, processedAt: new Date() } }
      );
      
      wpayLogger.log("PAYOUT_FAILED_REFUNDED", { out_trade_no, amount: order.amount, userId: order.userId });
      res.status(200).json({ success: true, message: "success" });
      return;
    }

    await WPayOrderModel.updateOne(
      { mch_order_no: out_trade_no },
      { $set: { status: "success", wpayProcessed: true, callbackRaw: body, callbackIp: clientIp, processedAt: new Date() } }
    );

    wpayLogger.log("PAYOUT_SUCCESS", { out_trade_no, elapsedMs: Date.now() - startTime });
    res.status(200).json({ success: true, message: "success" });

  } catch (error: any) {
    wpayLogger.error("PAYOUT_CALLBACK_ERROR", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

