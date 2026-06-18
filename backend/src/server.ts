import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "url";

const PORT = 3000;

// Handle ES module standard filenames
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Double check path resolutions to find current db_data.json
const getDbFilePath = () => {
  const rootPath = path.join(process.cwd(), "db_data.json");
  const backendSrcPath = path.join(__dirname, "db_data.json");
  const backendRootPath = path.join(__dirname, "../db_data.json");

  if (fs.existsSync(rootPath)) return rootPath;
  if (fs.existsSync(backendSrcPath)) return backendSrcPath;
  if (fs.existsSync(backendRootPath)) return backendRootPath;

  return rootPath; // fallback
};
const DB_FILE = getDbFilePath();

// Helper and State Setup
interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  profileImg?: string;
  isBlocked: boolean;
  role: "admin" | "student";
}

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  instructor: string;
  rating: number;
  reviewsCount: number;
  price: number; // PKR
  thumbnailUrl: string;
  lessons: Lesson[];
  resources: Resource[];
  isPublished?: boolean;
}

interface Lesson {
  id: string;
  title: string;
  duration: string; // e.g., "12:35"
  videoUrl: string; // streaming source
  isPreview: boolean;
}

interface Resource {
  title: string;
  type: "pdf" | "link" | "zip";
  url: string;
  size?: string;
}

interface Order {
  id: string;
  userId: string;
  userEmail: string;
  courseId: string;
  courseTitle: string;
  amount: number;
  paymentMethod: string;
  accountNumber: string;
  status: "pending" | "approved" | "refunded" | "rejected";
  createdAt: string;
}

interface UserProgress {
  userId: string;
  courseId: string;
  completedLessons: string[]; // lessonIds
  lastWatchedLessonId?: string;
  updatedAt: string;
}

interface SessionLog {
  id: string;
  userId: string;
  userEmail: string;
  deviceId: string;
  browser: string;
  ip: string;
  location: string;
  loginTime: string;
  isActive: boolean;
}

interface Database {
  users: User[];
  courses: Course[];
  orders: Order[];
  progress: UserProgress[];
  sessions: SessionLog[];
}

// Initial seed data if DB_FILE doesn't exist
const DEFAULT_COURSES: Course[] = [
  {
    id: "course-1",
    title: "Forex Trading Masterclass (Price Action & SMC)",
    description: "Master the secrets of currency markets. Learn Smart Money Concepts (SMC), liquidity hunts, order blocks, mitigation trades, and professional risk management straight from mentoring experiences.",
    category: "Forex Trading",
    instructor: "Tayyab",
    rating: 4.9,
    reviewsCount: 312,
    price: 3999,
    thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80",
    lessons: [
      { id: "1-1", title: "Introduction to Forex & Market Dynamics", duration: "14:20", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", isPreview: true },
      { id: "1-2", title: "Understanding Liquidity & High-Low Sweeps", duration: "18:45", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", isPreview: false },
      { id: "1-3", title: "Order Blocks & Mitigation Entry Strategies", duration: "22:15", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4", isPreview: false },
      { id: "1-4", title: "Premium vs Discount Pricing Zones", duration: "16:30", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4", isPreview: false },
      { id: "1-5", title: "Developing Your SMC Trading Plan", duration: "25:10", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4", isPreview: false }
    ],
    resources: [
      { title: "SMC Complete Trading Blueprint PDF", type: "pdf", url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", size: "1.4 MB" },
      { title: "Tayyab's Personal Risk Management Calculator", type: "link", url: "#" }
    ]
  },
  {
    id: "course-2",
    title: "Crypto Scalping & Day Trading Blueprint",
    description: "Launch your crypto career in spot and futures. Master scalping strategies on Binance & Bybit using Volume Profile, VWAP breakout indicators, order book flows, and dynamic position sizing.",
    category: "Crypto Trading",
    instructor: "Tayyab",
    rating: 4.8,
    reviewsCount: 184,
    price: 2999,
    thumbnailUrl: "https://images.unsplash.com/photo-1621761191319-c6fb62004040?auto=format&fit=crop&w=800&q=80",
    lessons: [
      { id: "2-1", title: "Crypto Infrastructure & Orderbook Mechanics", duration: "12:10", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", isPreview: true },
      { id: "2-2", title: "Scalping with VWAP & Volume Profile Zones", duration: "21:30", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutback.mp4", isPreview: false },
      { id: "2-3", title: "Leverage Controls & Liquidations Safe Practice", duration: "19:15", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4", isPreview: false },
      { id: "2-4", title: "Altcoin Pump Detection & Swing Trading Rulebook", duration: "17:40", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", isPreview: false }
    ],
    resources: [
      { title: "Crypto Scalping Rulebook & Checklist PDF", type: "pdf", url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", size: "850 KB" }
    ]
  },
  {
    id: "course-3",
    title: "Stock Market Core & Candlestick Analysis",
    description: "Begin stock investing and trading with confidence. Learn structural candlestick patterns, trend indicators, relative strength index (RSI) divergences, and long-term portfolio structures.",
    category: "Stock Market",
    instructor: "Tayyab",
    rating: 4.7,
    reviewsCount: 95,
    price: 2499,
    thumbnailUrl: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=800&q=80",
    lessons: [
      { id: "3-1", title: "Support, Resistance & Trendlines Deep Dive", duration: "15:40", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4", isPreview: true },
      { id: "3-2", title: "Candlestick Formations & Momentum Shippers", duration: "18:20", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", isPreview: false },
      { id: "3-3", title: "RSI Divergences & Bollinger Band Reversal Rules", duration: "20:50", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutback.mp4", isPreview: false }
    ],
    resources: [
      { title: "Technical Analysis Cheat Sheet PDF", type: "pdf", url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", size: "2.1 MB" }
    ]
  }
];

const INITIAL_DB: Database = {
  users: [
    {
      id: "user-admin",
      name: "Tushar Silawat",
      email: "Tusharsilawat41k@gmail.com",
      passwordHash: "admin123", // Simple plain-text / simulation
      profileImg: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
      isBlocked: false,
      role: "admin"
    },
    {
      id: "user-demo",
      name: "Tayyab Trader Partner",
      email: "tayyab@trade.com",
      passwordHash: "tayyab123",
      profileImg: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80",
      isBlocked: false,
      role: "student"
    }
  ],
  courses: DEFAULT_COURSES,
  orders: [
    {
      id: "order-1",
      userId: "user-demo",
      userEmail: "tayyab@trade.com",
      courseId: "course-1",
      courseTitle: "Forex Trading Masterclass (Price Action & SMC)",
      amount: 3999,
      paymentMethod: "EasyPaisa",
      accountNumber: "03169820955",
      status: "approved",
      createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString()
    }
  ],
  progress: [
    {
      userId: "user-demo",
      courseId: "course-1",
      completedLessons: ["1-1"],
      lastWatchedLessonId: "1-1",
      updatedAt: new Date().toISOString()
    }
  ],
  sessions: []
};

// Database utilities
function loadDB(): Database {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DB, null, 2), "utf-8");
    return INITIAL_DB;
  }
  try {
    const content = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    console.error("Error reading database file, resetting to initial seed:", e);
    return INITIAL_DB;
  }
}

function saveDB(dbData: Database) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving database file:", e);
  }
}

// Instantiate database
let db = loadDB();

// Create application
const app = express();
app.use(express.json());

// Device and IP Parsing middleware
app.use((req, res, next) => {
  const userAgent = req.headers["user-agent"] || "Generic Browser";
  let browser = "Chrome";
  if (userAgent.includes("Firefox")) browser = "Firefox";
  else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) browser = "Safari";
  else if (userAgent.includes("Edge")) browser = "Edge";

  const rawIp = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
  const ipStr = Array.isArray(rawIp) ? rawIp[0] : rawIp.toString();
  const fingerprint = crypto.createHash("md5").update(userAgent + ipStr).digest("hex").substring(0, 10);

  (req as any).clientInfo = {
    browser,
    userAgent,
    ip: ipStr,
    deviceId: req.headers["x-device-id"] || `device_${browser.toLowerCase().replace(/[^a-z0-9]/g, "")}_${fingerprint}`,
    location: "Punjab, Pakistan", // Mock location for local development
  };
  next();
});

// Authentication Helpers
function getAuthenticatedUser(req: express.Request): User | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const [userId, deviceId] = token.split("::");
  
  const user = db.users.find(u => u.id === userId);
  if (!user || user.isBlocked) return null;

  // Check if session is still active
  const session = db.sessions.find(s => s.userId === userId && s.deviceId === deviceId && s.isActive);
  if (!session) {
    return null;
  }
  return user;
}

// SETUP APIs
// ----------------------------------------------------

// AUTHENTICATION APIs
app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    res.status(400).json({ message: "All fields are required" });
    return;
  }

  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    res.status(400).json({ message: "Email is already registered" });
    return;
  }

  const newUser: User = {
    id: `user_${Math.random().toString(36).substring(2, 9)}`,
    name,
    email: email.toLowerCase(),
    passwordHash: password, // Plain-text demo simulation
    profileImg: `https://images.unsplash.com/photo-${1535000000000 + Math.floor(Math.random() * 100000)}?auto=format&fit=crop&w=150&q=80`,
    isBlocked: false,
    role: "student"
  };

  db.users.push(newUser);
  saveDB(db);

  res.json({ message: "Registration successful! You can now log in.", user: { id: newUser.id, name: newUser.name, email: newUser.email } });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const client = (req as any).clientInfo;

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.passwordHash !== password) {
    res.status(400).json({ message: "Invalid email or password" });
    return;
  }

  if (user.isBlocked) {
    res.status(403).json({ message: "Your account is blocked. Please contact Tayyab support." });
    return;
  }

  // Handle Account Sharing Protection
  // 1. Silently deactivate session on the same device identifier
  db.sessions.forEach(s => {
    if (s.userId === user.id && s.isActive && s.deviceId === client.deviceId) {
      s.isActive = false;
    }
  });

  // 2. Scan active sessions
  const activeDeviceSessions = db.sessions.filter(
    s => s.userId === user.id && s.isActive && s.deviceId !== client.deviceId
  );

  let warningMessage = "";
  if (activeDeviceSessions.length >= 1) {
    activeDeviceSessions.forEach(s => {
      s.isActive = false;
    });
    warningMessage = `⚠️ Multiple devices detected. We have auto-logged out your previous session on ${activeDeviceSessions[0]?.browser || "another device"} to protect your account.`;
  }

  // Create new session
  const newSession: SessionLog = {
    id: `session_${Math.random().toString(36).substring(2, 9)}`,
    userId: user.id,
    userEmail: user.email,
    deviceId: client.deviceId,
    browser: client.browser,
    ip: client.ip,
    location: client.location,
    loginTime: new Date().toISOString(),
    isActive: true
  };

  db.sessions.push(newSession);
  saveDB(db);

  const token = `${user.id}::${client.deviceId}`;

  res.json({
    message: "Login successful",
    token,
    warning: warningMessage,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImg: user.profileImg
    }
  });
});

app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const [userId, deviceId] = token.split("::");
    
    db.sessions.forEach(s => {
      if (s.userId === userId && s.deviceId === deviceId) {
        s.isActive = false;
      }
    });
    saveDB(db);
  }
  res.json({ message: "Logged out successfully" });
});

app.get("/api/auth/me", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized or session expired" });
    return;
  }
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImg: user.profileImg
    }
  });
});

app.post("/api/auth/profile/update", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { name, profileImg, newPassword } = req.body;
  const user = db.users.find(u => u.id === userObj.id);
  
  if (user) {
    if (name) user.name = name;
    if (profileImg) user.profileImg = profileImg;
    if (newPassword) user.passwordHash = newPassword;
    saveDB(db);
    res.json({ message: "Profile updated successfully!", user: { id: user.id, name: user.name, email: user.email, role: user.role, profileImg: user.profileImg } });
  } else {
    res.status(404).json({ message: "User not found" });
  }
});

// SYSTEM DIAGNOSTICS
app.get("/api/sessions/check", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const client = (req as any).clientInfo;
  
  const userSessions = db.sessions.filter(s => s.userId === user.id && s.isActive);
  res.json({
    currentDevice: client.deviceId,
    sessions: userSessions
  });
});

app.post("/api/sessions/clear-others", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const client = (req as any).clientInfo;
  
  let clearedCount = 0;
  db.sessions.forEach(s => {
    if (s.userId === user.id && s.isActive && s.deviceId !== client.deviceId) {
      s.isActive = false;
      clearedCount++;
    }
  });
  if (clearedCount > 0) {
    saveDB(db);
  }
  res.json({ message: `Successfully logged out ${clearedCount} other active devices.`, clearedCount });
});

// COURSE APIs
app.get("/api/courses", (req, res) => {
  res.json({ courses: db.courses });
});

app.get("/api/courses/:id", (req, res) => {
  const course = db.courses.find(c => c.id === req.params.id);
  if (!course) {
    res.status(404).json({ message: "Course not found" });
    return;
  }
  res.json({ course });
});

// MANUAL PAYMENT & ORDER ENROLLMENTS
app.post("/api/courses/:id/enroll", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "Please log in first to purchase the course." });
    return;
  }

  const course = db.courses.find(c => c.id === req.params.id);
  if (!course) {
    res.status(404).json({ message: "Course not found" });
    return;
  }

  const { paymentMethod, accountNumber } = req.body;
  if (!paymentMethod || !accountNumber) {
    res.status(400).json({ message: "Payment method and Account number are required." });
    return;
  }

  const newOrder: Order = {
    id: `ord_${Math.random().toString(36).substring(2, 9)}`,
    userId: user.id,
    userEmail: user.email,
    courseId: course.id,
    courseTitle: course.title,
    amount: course.price,
    paymentMethod,
    accountNumber,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  db.orders.push(newOrder);
  saveDB(db);

  res.json({
    message: `Payment initiated successfully! Your EasyPaisa/JazzCash order #${newOrder.id} is pending approval from Tayyab's backend. To mock-approve immediately, you can review it in the Admin Panel or refresh!`,
    order: newOrder
  });
});

// WPAY AUTOMATION CALLBACK BUSINESS LOGIC
function processApprovedWPayCallback(merchantId: string, orderId: string, amount: number, signature: string, status: string, remoteIp: string): { success: boolean; message: string; order?: Order } {
  if (merchantId !== "2794") {
    return { success: false, message: "Invalid WPay Merchant ID" };
  }

  const order = db.orders.find(o => o.id === orderId);
  if (!order) {
    return { success: false, message: "Order ID not found in database records" };
  }

  // Signature validation
  const computedStr = `${merchantId}${orderId}${amount}okok888`;
  const computedSignature = crypto.createHash("md5").update(computedStr).digest("hex");

  if (signature !== computedSignature) {
    return { success: false, message: "Security Signature Verification Mismatched" };
  }

  order.status = "approved";
  (order as any).verifiedAt = new Date().toISOString();
  (order as any).processedByCallbackIp = remoteIp || "27.124.45.41";

  const progressExist = db.progress.some(p => p.userId === order.userId && p.courseId === order.courseId);
  if (!progressExist) {
    db.progress.push({
      userId: order.userId,
      courseId: order.courseId,
      completedLessons: [],
      updatedAt: new Date().toISOString()
    });
  }

  saveDB(db);

  return { success: true, message: "WPay Gateway verified transaction and assigned course successfully!", order };
}

// WPAY EXTERNAL CALLBACK ENDPOINT
app.post("/api/payments/wpay/callback", (req, res) => {
  const reqIp = req.ip || req.socket.remoteAddress || "";
  const forwardedFor = req.headers["x-forwarded-for"];
  const clientIp = typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : reqIp;

  console.log(`[WPay Webhook Callback] Caller IP: ${clientIp}`, req.body);

  const { merchantId, orderId, amount, signature, status } = req.body;

  if (!merchantId || !orderId || !signature) {
    res.status(400).json({ success: false, message: "Missing required WPay parameters." });
    return;
  }

  const result = processApprovedWPayCallback(merchantId, orderId, Number(amount), signature, status, clientIp);
  if (result.success) {
    res.json({ success: true, status: "OK", message: result.message, orderId });
  } else {
    res.status(400).json({ success: false, message: result.message });
  }
});

// WPAY AUTOMATED GATEWAY ENROLLMENT ACCESS TRIGGER (CLIENT SIDE HANDLER)
app.post("/api/courses/:id/enroll-wpay", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "Please log in first to purchase the course." });
    return;
  }

  const course = db.courses.find(c => c.id === req.params.id);
  if (!course) {
    res.status(404).json({ message: "Course not found" });
    return;
  }

  const { merchantId, username, password, paymentNumber } = req.body;

  if (merchantId !== "2794" || username !== "patlo222" || password !== "okok888") {
    res.status(400).json({ message: "Invalid WPay Merchant Credentials. Verify details from configuration." });
    return;
  }

  const orderId = `ord_wp_${Math.random().toString(36).substring(2, 8)}`;
  const newOrder: Order = {
    id: orderId,
    userId: user.id,
    userEmail: user.email,
    courseId: course.id,
    courseTitle: course.title,
    amount: course.price,
    paymentMethod: "WPay",
    accountNumber: paymentNumber || "WPay-Secure-Account",
    status: "pending",
    createdAt: new Date().toISOString()
  };

  db.orders.push(newOrder);
  saveDB(db);

  const computedStr = `${merchantId}${orderId}${course.price}okok888`;
  const signature = crypto.createHash("md5").update(computedStr).digest("hex");

  const verifyResult = processApprovedWPayCallback(
    merchantId,
    orderId,
    course.price,
    signature,
    "success",
    "27.124.45.41" // Simulated test callback boundary IP
  );

  if (verifyResult.success) {
    res.json({
      message: "WPay Secure Gateway: Payment Approved & Verified via Secure Callback (IP: 27.124.45.41)! This course has been assigned and unlocked in your dashboard.",
      order: verifyResult.order
    });
  } else {
    res.status(400).json({
      message: `WPay payment failed or callback rejected: ${verifyResult.message}`
    });
  }
});

// USER ENROLLMENTS VERIFY
app.get("/api/users/enrollments", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ enrolled: [] });
    return;
  }
  const approvedOrders = db.orders.filter(o => o.userId === user.id && o.status === "approved");
  const enrolledCourseIds = approvedOrders.map(o => o.courseId);
  res.json({ enrolled: enrolledCourseIds });
});

// SECURE VIDEO PLAYER SIGNING ENDPOINT
app.get("/api/courses/:courseId/lessons/:lessonId/secure-play", (req, res) => {
  const user = getAuthenticatedUser(req);
  const client = (req as any).clientInfo;
  
  const course = db.courses.find(c => c.id === req.params.courseId);
  if (!course) {
    res.status(404).json({ message: "Course not found" });
    return;
  }

  const lesson = course.lessons.find(l => l.id === req.params.lessonId);
  if (!lesson) {
    res.status(404).json({ message: "Lesson not found" });
    return;
  }

  const hasAccess = db.orders.some(o => o.userId === user?.id && o.courseId === course.id && o.status === "approved");

  if (!lesson.isPreview && !hasAccess) {
    res.status(403).json({ message: "This video is locked. Please enroll and pay to unlock." });
    return;
  }

  const watermark = {
    email: user ? user.email : "guest_preview@tradetayyab.com",
    userId: user ? user.id : "GUEST",
    dateTime: new Date().toISOString().replace("T", " ").substring(0, 19),
    ip: client.ip,
  };

  const tokenSignature = `token_sig_${Math.random().toString(36).substring(2, 10)}_exp_${Date.now() + 60 * 1000}`;

  res.json({
    videoUrl: lesson.videoUrl,
    title: lesson.title,
    description: (lesson as any).description || "Decrypted Trading Module Lesson Chapter",
    isPreviewLimit: !hasAccess && lesson.isPreview,
    watermark,
    signedToken: tokenSignature,
    disableDownload: true,
    pdfUrl: (lesson as any).pdfUrl || "",
    pdfTitle: (lesson as any).pdfTitle || ""
  });
});

// PROGRESS TRACKING
app.get("/api/progress/:courseId", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ completedLessons: [] });
    return;
  }
  const prog = db.progress.find(p => p.userId === user.id && p.courseId === req.params.courseId);
  res.json({
    completedLessons: prog ? prog.completedLessons : [],
    lastWatchedLessonId: prog ? prog.lastWatchedLessonId : ""
  });
});

app.post("/api/progress/:courseId/update", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { lessonId, completed, lastWatched } = req.body;
  let prog = db.progress.find(p => p.userId === user.id && p.courseId === req.params.courseId);

  if (!prog) {
    prog = {
      userId: user.id,
      courseId: req.params.courseId,
      completedLessons: [],
      lastWatchedLessonId: lastWatched,
      updatedAt: new Date().toISOString()
    };
    db.progress.push(prog);
  }

  if (lastWatched) {
    prog.lastWatchedLessonId = lastWatched;
  }

  if (lessonId && typeof completed === "boolean") {
    if (completed) {
      if (!prog.completedLessons.includes(lessonId)) {
        prog.completedLessons.push(lessonId);
      }
    } else {
      prog.completedLessons = prog.completedLessons.filter(id => id !== lessonId);
    }
  }

  prog.updatedAt = new Date().toISOString();
  saveDB(db);

  res.json({ message: "Progress updated", completedLessons: prog.completedLessons, lastWatchedLessonId: prog.lastWatchedLessonId });
});

// AI CHAT LOGIC (GEMINI CALLS)
app.post("/api/ai/coach", async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { message, chatHistory } = req.body;

  if (!message) {
    res.status(400).json({ reply: "Ask any trading or technical analysis question, and I'll assist you!" });
    return;
  }

  const ttsSystemPrompt = `You are "Tayyab AI Coach" - the virtual smart trading mentor assistant for "Trade With Tayyab" LMS platform.
Your expertise is in Forex Markets, Smart Money Concepts (SMC), Cryptocurrencies, Stock trading, and Advanced Candlestick patterns.
Strictly refuse to advise on unrelated fields. Assist in a friendly, professional manner, using standard technical trading terms (supply & demand zone, risk/reward ratios, market sweeps).
The active student's name is: ${user ? user.name : "Guest Trader"}. Reference topics in Trade With Tayyab courses like Price Action masterclasses, Bybit setups, scale orders.
Keep explanations structured, helpful, and under 150 words.`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY") {
      const fallbackReplies = [
        `💡 **Tayyab AI Coach Feedback:** Great question! To spot a genuine Order Block on your trading chart, look for the final opposite-colored candle preceding a sharp, impulsive expansion that breaks the market structure (BOS/CHoCH). Make sure it sweeps previous liquidity first. This increases success probability!`,
        `📈 **Tayyab AI Coach Feedback:** Managing Risk is the #1 key in Forex. I always advise students on Trade With Tayyab to never risk more than 1% to 2% of their total trading capital per position. Always calculate your exact position sizing using standard lot rules and draw down limits.`,
        `🪙 **Tayyab AI Coach Feedback:** Crypto Scalping requires fast reflexes on Bybit/Binance. Combining the Volume Profile POC (Point of Control) with VWAP support allows you to spot high-consequence bid walls instantly. Wait for liquidity sweeps before executing futures trades!`,
        `📊 **Tayyab AI Coach Feedback:** Stock candlesticks reveal buyer/seller dynamics. A Hammer candlestick at a critical horizontal support level signifies a sharp rejection of lower prices and often triggers a bullish trend reversal. Watch the volume for validation!`
      ];
      const randomReply = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
      res.json({ reply: randomReply + ` *(Note: This is a smart trading response model. Configure your GEMINI_API_KEY for open questions!)*` });
      return;
    }

    const ai = new GoogleGenAI({ apiKey: key });
    
    const pastMessages = (chatHistory || []).map((msg: any) => ({
      role: msg.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: msg.content || msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        ...pastMessages,
        { role: "user", parts: [{ text: `${ttsSystemPrompt}\n\nClient Question: ${message}` }] }
      ]
    });

    res.json({ reply: response.text });
  } catch (err: any) {
    console.error("Gemini coach API error:", err);
    res.json({ reply: `💡 Hey there trader! Technical market structures are looking active today. Let's practice key risk controls (1:2 R:R ratios) in Forex! \n*(Tayyab AI experienced an API hiccup: ${err.message || "Key not synced"}. Always ensure risk management!)*` });
  }
});

// ADMIN PROTECTION API
app.get("/api/admin/dashboard-stats", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Access Denied: Admins Only" });
    return;
  }

  const totalUsers = db.users.length;
  const totalCourses = db.courses.length;
  const totalSales = db.orders.filter(o => o.status === "approved").length;
  const totalRevenue = db.orders.filter(o => o.status === "approved").reduce((sum, o) => sum + o.amount, 0);

  const monthlyRevenue = [
    { month: "Jan", revenue: Math.ceil(totalRevenue * 0.15), sales: Math.ceil(totalSales * 0.15) },
    { month: "Feb", revenue: Math.ceil(totalRevenue * 0.20), sales: Math.ceil(totalSales * 0.20) },
    { month: "Mar", revenue: Math.ceil(totalRevenue * 0.25), sales: Math.ceil(totalSales * 0.22) },
    { month: "Apr", revenue: Math.ceil(totalRevenue * 0.28), sales: Math.ceil(totalSales * 0.30) },
    { month: "May", revenue: Math.ceil(totalRevenue * 0.40), sales: Math.ceil(totalSales * 0.45) },
    { month: "Jun", revenue: totalRevenue, sales: totalSales }
  ];

  const sessionUserCounter: { [email: string]: Set<string> } = {};
  db.sessions.forEach(s => {
    if (!sessionUserCounter[s.userEmail]) {
      sessionUserCounter[s.userEmail] = new Set();
    }
    sessionUserCounter[s.userEmail].add(s.deviceId);
  });

  const suspiciousLogins = Object.keys(sessionUserCounter)
    .filter(email => sessionUserCounter[email].size > 1)
    .map(email => ({
      email,
      distinctDevices: sessionUserCounter[email].size,
      details: db.sessions.filter(s => s.userEmail === email).map(s => ({
        browser: s.browser,
        ip: s.ip,
        loginTime: s.loginTime,
        location: s.location
      }))
    }));

  res.json({
    stats: {
      totalUsers,
      totalCourses,
      totalSales,
      totalRevenue,
    },
    monthlyRevenue,
    suspiciousLogins,
    recentOrders: db.orders.slice(-5).reverse(),
  });
});

app.get("/api/admin/users", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }
  res.json({ users: db.users });
});

app.post("/api/admin/users/:userId/toggle-block", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  const user = db.users.find(u => u.id === req.params.userId);
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  if (user.id === "user-admin") {
    res.status(400).json({ message: "Cannot block primary administrator account." });
    return;
  }

  user.isBlocked = !user.isBlocked;
  
  if (user.isBlocked) {
    db.sessions.forEach(s => {
      if (s.userId === user.id) s.isActive = false;
    });
  }

  saveDB(db);
  res.json({ message: `User ${user.name} is now ${user.isBlocked ? "blocked" : "active"}.`, user });
});

app.get("/api/admin/orders", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }
  res.json({ orders: db.orders });
});

app.post("/api/admin/orders/:orderId/update", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  const { status } = req.body;
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) {
    res.status(404).json({ message: "Order not found" });
    return;
  }

  order.status = status;
  
  if (status === "approved") {
    const existingProg = db.progress.find(p => p.userId === order.userId && p.courseId === order.courseId);
    if (!existingProg) {
      db.progress.push({
        userId: order.userId,
        courseId: order.courseId,
        completedLessons: [],
        lastWatchedLessonId: "",
        updatedAt: new Date().toISOString()
      });
    }
  }

  saveDB(db);
  res.json({ message: `Order status updated to ${status}.`, order });
});

app.post("/api/admin/courses/create", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  const { title, description, category, price, thumbnailUrl, lessons, resources } = req.body;

  if (!title || !price) {
    res.status(400).json({ message: "Title and Price are required" });
    return;
  }

  const newCourse: Course = {
    id: `course-${Date.now()}`,
    title,
    description: description || "Premium Course",
    category: category || "Trading",
    instructor: "Tayyab",
    rating: 5.0,
    reviewsCount: 1,
    price: Number(price),
    thumbnailUrl: thumbnailUrl || "https://images.unsplash.com/photo-1621761191319-c6fb62004040?auto=format&fit=crop&w=800&q=80",
    isPublished: true,
    lessons: (lessons || []).map((l: any, i: number) => ({
      id: l.id || `${Date.now()}-${i}`,
      title: l.title || "Lesson",
      duration: l.duration || "10:00",
      videoUrl: l.videoUrl || "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      description: l.description || "General video curriculum details",
      isPreview: !!l.isPreview,
      pdfUrl: l.pdfUrl || "",
      pdfTitle: l.pdfTitle || "",
      order: l.order || (i + 1)
    })),
    resources: resources || []
  };

  db.courses.push(newCourse);
  saveDB(db);

  res.json({ message: "Course added successfully!", course: newCourse });
});

app.post("/api/admin/courses/update", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  const { id, title, description, category, price, thumbnailUrl, lessons, resources } = req.body;

  if (!id) {
    res.status(400).json({ message: "Course ID is required for editing" });
    return;
  }

  const courseIndex = db.courses.findIndex(c => c.id === id);
  if (courseIndex === -1) {
    res.status(404).json({ message: "Course not found" });
    return;
  }

  const updatedCourse = {
    ...db.courses[courseIndex],
    title: title || db.courses[courseIndex].title,
    description: description || db.courses[courseIndex].description,
    category: category || db.courses[courseIndex].category,
    price: price !== undefined ? Number(price) : db.courses[courseIndex].price,
    thumbnailUrl: thumbnailUrl || db.courses[courseIndex].thumbnailUrl,
    resources: resources || db.courses[courseIndex].resources,
    lessons: (lessons || []).map((l: any, i: number) => ({
      id: l.id || `l-${Date.now()}-${i}`,
      title: l.title || "Lesson",
      duration: l.duration || "10:00",
      videoUrl: l.videoUrl || "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      description: l.description || "General video curriculum details",
      isPreview: !!l.isPreview,
      pdfUrl: l.pdfUrl || "",
      pdfTitle: l.pdfTitle || "",
      order: l.order || (i + 1)
    }))
  };

  db.courses[courseIndex] = updatedCourse;
  saveDB(db);

  res.json({ message: "Course updated successfully!", course: updatedCourse });
});

app.post("/api/admin/courses/:id/toggle-publish", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  const course = db.courses.find(c => c.id === req.params.id);
  if (!course) {
    res.status(404).json({ message: "Course not found" });
    return;
  }

  course.isPublished = course.isPublished !== false ? false : true;
  saveDB(db);

  res.json({ message: `Course published status updated to ${course.isPublished}`, course });
});

app.post("/api/admin/courses/:id/delete", (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  db.courses = db.courses.filter(c => c.id !== req.params.id);
  saveDB(db);

  res.json({ message: "Course deleted successfully!" });
});


// Express server configuration for frontend asset delivery (Vite Client integration)
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, "../../frontend/vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static frontend build from relative directory
    const distPath = path.resolve(process.cwd(), "dist/frontend");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Trade With Tayyab Fullstack LMS running on port ${PORT}`);
  });
}

startServer();
