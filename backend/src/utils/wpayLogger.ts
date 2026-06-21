/**
 * WPay Logger — console-only (file writes are skipped in production
 * because Render's filesystem is ephemeral / read-only outside /tmp).
 */

export const wpayLogger = {
  log: (action: string, data: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [WPAY] [${action}]`, JSON.stringify(data));
  },

  error: (action: string, error: any, context?: any) => {
    const timestamp = new Date().toISOString();
    console.error(
      `[${timestamp}] [WPAY] [ERROR] [${action}]`,
      error?.message || error,
      context ? JSON.stringify(context) : ""
    );
  },
};
