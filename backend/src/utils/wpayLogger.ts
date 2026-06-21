import fs from "fs";
import path from "path";

// Simple file-based logger for WPay requests and responses
const logFilePath = path.join(process.cwd(), "wpay-transactions.log");

export const wpayLogger = {
  log: (action: string, data: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${action}] ${JSON.stringify(data)}\n`;
    
    // Write to console
    console.log(logEntry.trim());
    
    // Write to file for audit
    fs.appendFile(logFilePath, logEntry, (err) => {
      if (err) console.error("Failed to write to WPay log file:", err);
    });
  },
  
  error: (action: string, error: any, context?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [ERROR] [${action}] ${error?.message || error} - Context: ${JSON.stringify(context || {})}\n`;
    
    console.error(logEntry.trim());
    
    fs.appendFile(logFilePath, logEntry, (err) => {
      if (err) console.error("Failed to write to WPay log file:", err);
    });
  }
};
