/**
 * paymentRoutes.ts — thin re-export shim.
 * All WPay logic lives in server.ts so this file just exports an empty router
 * to avoid any import-chain hangs from the old Mongoose-model-based controller.
 */
import { Router } from "express";
const paymentRouter = Router();
export default paymentRouter;
