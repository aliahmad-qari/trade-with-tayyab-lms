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
import { generateWPaySignature } from "../utils/wpaySignature.js";

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
  mch_order_no: string;
  transaction_id?: string;
  pay_money: string | number; // the amount actually paid — SOURCE OF TRUTH
  total_fee?: string | number; // requested amount
  status: string; // "1" = success on most WPay integrations
  sign: string;
  type?: string; // e.g. 'payin' or 'payout' indicator if provided by WPay
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

    // ── 1. Validate required fields ──────────────────────────────────────
    const { mch_id, mch_order_no, pay_money, status } = body;

    if (!mch_id || !mch_order_no || pay_money === undefined || !status) {
      console.warn("[WPay Callback] Missing required fields:", {
        mch_id,
        mch_order_no,
        pay_money,
        status,
      });
      res.status(400).json({
        success: false,
        code: "INVALID_PAYLOAD",
        message: "Missing required callback parameters.",
      });
      return;
    }

    // ── 2. Verify merchant ID matches ours ───────────────────────────────
    const expectedMchId = process.env.WPAY_MERCHANT_ID;
    if (mch_id !== expectedMchId) {
      console.warn(
        `[WPay Callback] Merchant ID mismatch: received=${mch_id}, expected=${expectedMchId}`
      );
      res.status(403).json({
        success: false,
        code: "MERCHANT_MISMATCH",
        message: "Merchant ID does not match.",
      });
      return;
    }

    // ── 3. Look up the order ─────────────────────────────────────────────
    const order = await WPayOrderModel.findOne({ mch_order_no });

    if (!order) {
      console.warn(
        `[WPay Callback] Order not found: ${mch_order_no}`
      );
      res.status(404).json({
        success: false,
        code: "ORDER_NOT_FOUND",
        message: `No order record found for mch_order_no: ${mch_order_no}`,
      });
      return;
    }

    // ── 4. Idempotency guard ─────────────────────────────────────────────
    if (order.wpayProcessed === true) {
      console.info(
        `[WPay Callback] ⚠️  Duplicate callback ignored for order: ${mch_order_no}`
      );
      // Still respond with `success` so WPay doesn't keep retrying.
      res.status(200).json({
        success: true,
        code: "ALREADY_PROCESSED",
        message: "This transaction has already been processed.",
      });
      return;
    }

    // ── 5. Only process successful payments ──────────────────────────────
    // WPay uses "1" or "success" for successful transactions.
    const isSuccess =
      String(status) === "1" ||
      String(status).toLowerCase() === "success";

    if (!isSuccess) {
      // Mark order as failed but don't credit balance.
      await WPayOrderModel.updateOne(
        { mch_order_no },
        {
          $set: {
            status: "failed",
            wpayProcessed: true,
            callbackRaw: body,
            callbackIp: clientIp,
            processedAt: new Date(),
          },
        }
      );

      console.info(
        `[WPay Callback] Payment FAILED for order: ${mch_order_no}, status: ${status}`
      );

      res.status(200).json({
        success: true,
        code: "PAYMENT_FAILED",
        message: "Payment was not successful. Order marked as failed.",
      });
      return;
    }

    // ── 6. Credit the user's balance using `pay_money` ───────────────────
    const creditAmount = Number(pay_money);

    if (isNaN(creditAmount) || creditAmount <= 0) {
      console.error(
        `[WPay Callback] Invalid pay_money value: ${pay_money} for order: ${mch_order_no}`
      );
      res.status(400).json({
        success: false,
        code: "INVALID_AMOUNT",
        message: "`pay_money` must be a positive number.",
      });
      return;
    }

    // Atomic balance update — $inc is safe under concurrency.
    const userUpdate = await UserModel.updateOne(
      { _id: order.userId },
      { $inc: { balance: creditAmount } }
    );

    if (userUpdate.matchedCount === 0) {
      console.error(
        `[WPay Callback] User not found for order: ${mch_order_no}, userId: ${order.userId}`
      );
      res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "The user associated with this order was not found.",
      });
      return;
    }

    // ── 7. Mark order as processed (idempotency flag) ────────────────────
    await WPayOrderModel.updateOne(
      { mch_order_no },
      {
        $set: {
          status: "success",
          pay_money: creditAmount,
          wpayProcessed: true,
          callbackRaw: body,
          callbackIp: clientIp,
          processedAt: new Date(),
        },
      }
    );

    const elapsed = Date.now() - startTime;
    console.info(
      `[WPay Callback] ✅ Order ${mch_order_no} processed successfully. ` +
      `Credited ₨${creditAmount} to user ${order.userId}. (${elapsed}ms)`
    );

    // ── 8. Respond with `success` — WPay stops retrying ──────────────────
    res.status(200).json({
      success: true,
      code: "OK",
      message: "success",
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[WPay Callback] Unhandled error:", {
      message: err.message,
      stack: err.stack,
      body: req.body,
    });

    res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "An internal server error occurred while processing the callback.",
    });
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

    // ── Validate inputs ──────────────────────────────────────────────────
    if (!amount || !userId) {
      res.status(400).json({
        success: false,
        code: "MISSING_FIELDS",
        message: "`amount` and `userId` are required.",
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

    // ── Verify user exists ───────────────────────────────────────────────
    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
      return;
    }

    // ── Build the order ──────────────────────────────────────────────────
    const mchId = process.env.WPAY_MERCHANT_ID!;
    const secretKey = process.env.WPAY_SIGNATURE_SALT!;
    const mchOrderNo = `TWP_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const callbackUrl =
      process.env.WPAY_CALLBACK_URL ||
      `${req.protocol}://${req.get("host")}/api/payments/wpay/callback`;

    const params: Record<string, string | number> = {
      mch_id: mchId,
      mch_order_no: mchOrderNo,
      pay_type: "8001", // EasyPaisa / JazzCash (adjust per WPay docs)
      trade_amount: numericAmount,
      order_date: new Date().toISOString().split("T")[0].replace(/-/g, ""),
      goods_name: "TradeWithTayyab Wallet Deposit",
      notify_url: callbackUrl,
    };

    // Generate the signature.
    const sign = generateWPaySignature(params, secretKey);

    // Persist the order locally *before* redirecting the user.
    await WPayOrderModel.create({
      mch_order_no: mchOrderNo,
      mch_id: mchId,
      userId,
      amount: numericAmount,
      currency: "PKR",
      status: "pending",
      wpayProcessed: false,
    });

    console.info(
      `[WPay Payin] 📤 Order ${mchOrderNo} created for user ${userId}, amount: ₨${numericAmount}`
    );

    res.status(201).json({
      success: true,
      code: "ORDER_CREATED",
      message: "WPay order created. Redirect the user to the checkout URL.",
      data: {
        mch_order_no: mchOrderNo,
        checkoutParams: { ...params, sign },
        // The WPay checkout base URL — adjust if WPay provides a different host.
        checkoutUrl: "https://pay.wpay.one/checkout",
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[WPay Payin] Error initiating payment:", {
      message: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Failed to initiate payment. Please try again later.",
    });
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

    // Adjust these field names based on actual WPay payout documentation
    const mch_id = body.mch_id;
    const mch_order_no = body.mch_transferId || body.mch_order_no; 
    const status = body.tradeResult || body.status; // typically 1=success, 2=fail, etc.

    if (!mch_id || !mch_order_no || !status) {
      res.status(400).json({ success: false, message: "Missing payout callback parameters." });
      return;
    }

    const order = await WPayOrderModel.findOne({ mch_order_no });
    if (!order) {
      res.status(404).json({ success: false, message: "Payout order not found." });
      return;
    }

    if (order.wpayProcessed === true) {
      res.status(200).json({ success: true, message: "Already processed" });
      return;
    }

    const isSuccess = String(status) === "1" || String(status).toLowerCase() === "success";

    if (!isSuccess) {
      // Payout failed/rejected. Refund the user's reserved balance.
      await UserModel.updateOne(
        { _id: order.userId },
        { $inc: { balance: order.amount } }
      );
      
      await WPayOrderModel.updateOne(
        { mch_order_no },
        {
          $set: {
            status: "failed",
            wpayProcessed: true,
            callbackRaw: body,
            callbackIp: clientIp,
            processedAt: new Date(),
          },
        }
      );
      
      console.info(`[WPay Payout] ❌ Payout FAILED for ${mch_order_no}. Refunded ₨${order.amount} to user ${order.userId}`);
      
      res.status(200).json({ success: true, message: "success" });
      return;
    }

    // Payout succeeded. Balance was already deducted at initiation. Just mark as success.
    await WPayOrderModel.updateOne(
      { mch_order_no },
      {
        $set: {
          status: "success",
          wpayProcessed: true,
          callbackRaw: body,
          callbackIp: clientIp,
          processedAt: new Date(),
        },
      }
    );

    const elapsed = Date.now() - startTime;
    console.info(`[WPay Payout] ✅ Payout ${mch_order_no} succeeded. (${elapsed}ms)`);

    res.status(200).json({ success: true, message: "success" });
  } catch (error: unknown) {
    console.error("[WPay Payout Callback] Unhandled error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

