/**
 * paymentController.ts — stub.
 * All WPay payment logic is handled directly in server.ts using the
 * in-memory db + MongoDB persistence pattern used throughout the app.
 * This file is kept to satisfy the import in wpaySecurityMiddleware.
 */
import type { Request, Response } from "express";

export const handleWPayPayinCallback = (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, message: "handled" });
};
export const initiateWPayPayin = (_req: Request, res: Response): void => {
  res.status(200).json({ success: true });
};
export const getWPayOrderStatus = (_req: Request, res: Response): void => {
  res.status(200).json({ success: true });
};
export const initiateWPayPayout = (_req: Request, res: Response): void => {
  res.status(200).json({ success: true });
};
export const handleWPayPayoutCallback = (_req: Request, res: Response): void => {
  res.status(200).json({ success: true });
};
