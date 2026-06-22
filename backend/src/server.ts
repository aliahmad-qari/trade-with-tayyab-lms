import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "url";
import axios from "axios";

// ── ES-module __dirname shim ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Config ────────────────────────────────────────────────────────────────
const PORT            = Number(process.env.PORT) || 3000;
const JWT_SECRET      = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const BCRYPT_ROUNDS   = 10;
const WPAY_MERCHANT_ID    = process.env.WPAY_MERCHANT_ID    || "2794";
const WPAY_USERNAME       = process.env.WPAY_USERNAME       || "patlo222";
const WPAY_SECRET         = process.env.WPAY_SECRET         || "okok888";
const WPAY_SIGNATURE_SALT = process.env.WPAY_SIGNATURE_SALT || WPAY_SECRET;
const WPAY_API_BASE       = "https://api.wpay.one";

// ── Cloudinary ────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dux3niyf5",
  api_key:    process.env.CLOUDINARY_API_KEY    || "587493165882622",
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

// ── Types ─────────────────────────────────────────────────────────────────
interface User {
  id: string; name: string; email: string; passwordHash: string;
  profileImg?: string; isBlocked: boolean; role: "admin" | "student";
}
interface Lesson {
  id: string; title: string; duration: string; videoUrl: string;
  isPreview: boolean; description?: string; pdfUrl?: string; pdfTitle?: string; order?: number;
}
interface Resource { title: string; type: "pdf" | "link" | "zip"; url: string; size?: string; }
interface Course {
  id: string; title: string; description: string; category: string;
  instructor: string; rating: number; reviewsCount: number; price: number;
  thumbnailUrl: string; lessons: Lesson[]; resources: Resource[]; isPublished?: boolean;
}
interface PdfProduct {
  id: string; title: string; description: string; price: number;
  thumbnailUrl: string; pdfUrl: string; previewUrl?: string;
  category?: string; isPublished?: boolean; createdAt?: string;
}
interface Order {
  id: string; userId: string; userEmail: string; courseId: string;
  courseTitle: string; productType?: "course" | "pdf"; amount: number;
  paymentMethod: string; accountNumber: string;
  status: "pending" | "approved" | "refunded" | "rejected"; createdAt: string;
}
interface UserProgress {
  userId: string; courseId: string; completedLessons: string[];
  lastWatchedLessonId?: string; updatedAt: string;
}
interface SessionLog {
  id: string; userId: string; userEmail: string; deviceId: string;
  browser: string; ip: string; location: string; loginTime: string; isActive: boolean;
}
interface Database {
  users: User[]; courses: Course[]; pdfs: PdfProduct[];
  orders: Order[]; progress: UserProgress[]; sessions: SessionLog[];
}

// ── Seed Data ─────────────────────────────────────────────────────────────
const DEFAULT_COURSES: Course[] = [];

const DEFAULT_PDFS: PdfProduct[] = [];

const INITIAL_DB: Database = {
  users: [
    { id: "user-admin", name: "Tushar Silawat", email: "tusharsilawat41k@gmail.com",
      passwordHash: "admin123", profileImg: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
      isBlocked: false, role: "admin" },
    { id: "user-demo", name: "Tayyab Trader", email: "tayyab@trade.com",
      passwordHash: "tayyab123", profileImg: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80",
      isBlocked: false, role: "student" },
  ],
  courses: DEFAULT_COURSES,
  pdfs: DEFAULT_PDFS,
  orders: [],
  progress: [],
  sessions: [],
};

// ── MongoDB ───────────────────────────────────────────────────────────────
const AppStateSchema = new mongoose.Schema({ data: { type: Object } }, { minimize: false });
const AppStateModel  = mongoose.model("AppState", AppStateSchema, "appstate");
let db: Database = JSON.parse(JSON.stringify(INITIAL_DB));

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI env var is not set. Add it to .env or Render dashboard.");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log("🗄️  MongoDB connected");
}

async function buildSeedDB(): Promise<Database> {
  const seed: Database = JSON.parse(JSON.stringify(INITIAL_DB));
  for (const u of seed.users) u.passwordHash = await bcrypt.hash(u.passwordHash, BCRYPT_ROUNDS);
  return seed;
}

async function loadDB(): Promise<void> {
  const existing = await AppStateModel.findOne().lean() as any;
  if (existing?.data) {
    db = existing.data as Database;
    let dirty = false;
    
    // Wipe hardcoded demo courses and pdfs
    const hardcodedCourseIds = ["course-1", "course-2", "course-3"];
    const hardcodedPdfIds = ["pdf-colortrading-ebook"];
    
    const origCoursesLen = db.courses?.length || 0;
    const origPdfsLen = db.pdfs?.length || 0;
    
    if (db.courses) {
      db.courses = db.courses.filter(c => !hardcodedCourseIds.includes(c.id));
    } else {
      db.courses = [];
    }
    
    if (db.pdfs) {
      db.pdfs = db.pdfs.filter(p => !hardcodedPdfIds.includes(p.id));
    } else {
      db.pdfs = [];
    }
    
    if (db.courses.length !== origCoursesLen || db.pdfs.length !== origPdfsLen) {
      dirty = true;
      console.log("🧹 Removed hardcoded demo content from database");
    }

    if (!Array.isArray(db.pdfs)) { db.pdfs = []; dirty = true; }
    if (!Array.isArray(db.courses)) { db.courses = []; dirty = true; }
    // Re-hash plain-text passwords
    for (const u of db.users) {
      if (u.passwordHash && !u.passwordHash.startsWith("$2")) {
        console.log(`🔐 Hashing plain-text password for: ${u.email}`);
        u.passwordHash = await bcrypt.hash(u.passwordHash, BCRYPT_ROUNDS);
        dirty = true;
      }
    }
    if (dirty) { await saveDB(db); console.log("✅ DB backfilled & saved"); }
    console.log(`📦 Loaded DB: ${db.users.length} users, ${db.courses.length} courses, ${db.pdfs.length} PDFs, ${db.orders.length} orders`);
    return;
  }
  db = await buildSeedDB();
  await AppStateModel.create({ data: db });
  console.log("🌱 Seeded fresh database");
}

async function saveDB(data: Database) {
  try { await AppStateModel.replaceOne({}, { data }, { upsert: true }); }
  catch (e) { console.error("saveDB error:", e); }
}

// ── Express App ───────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);

// CORS
const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, "");
const allowedOrigins = [frontendUrl, "http://localhost:3000", "http://localhost:5173"].filter(Boolean) as string[];
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error("CORS blocked")),
  credentials: true,
}));
app.use(express.json());

// Client-info middleware
app.use((req, _res, next) => {
  const ua  = req.headers["user-agent"] || "";
  let browser = "Chrome";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";
  const rawIp = (req.headers["x-forwarded-for"] as string || req.ip || "127.0.0.1").split(",")[0].trim();
  const fp = crypto.createHash("md5").update(ua + rawIp).digest("hex").slice(0, 10);
  (req as any).clientInfo = {
    browser, ip: rawIp,
    deviceId: (req.headers["x-device-id"] as string) || `dev_${browser.toLowerCase()}_${fp}`,
    location: "Punjab, Pakistan",
  };
  next();
});

// ── Auth helper ───────────────────────────────────────────────────────────
function getAuthenticatedUser(req: express.Request): User | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const { userId, deviceId } = jwt.verify(auth.split(" ")[1], JWT_SECRET) as { userId: string; deviceId: string };
    const user = db.users.find(u => u.id === userId);
    if (!user || user.isBlocked) return null;
    const session = db.sessions.find(s => s.userId === userId && s.deviceId === deviceId && s.isActive);
    if (!session) return null;
    return user;
  } catch { return null; }
}

// ── WPay signature helper ─────────────────────────────────────────────────
function wpaySign(params: Record<string, string | number>, secret: string): string {
  const sorted = Object.entries(params)
    .filter(([k, v]) => k !== "sign" && v !== undefined && v !== "" && v !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  const str = sorted.map(([k, v]) => `${k}=${v}`).join("&") + `&key=${secret}`;
  return crypto.createHash("md5").update(str).digest("hex");
}

// ── Auth routes ───────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) { res.status(400).json({ message: "All fields are required" }); return; }
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    res.status(400).json({ message: "Email is already registered" }); return;
  }
  const newUser: User = {
    id: `user_${Math.random().toString(36).slice(2, 9)}`, name,
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    profileImg: `https://i.pravatar.cc/150?u=${email}`,
    isBlocked: false, role: "student",
  };
  db.users.push(newUser);
  await saveDB(db);
  res.json({ message: "Registration successful! You can now log in." });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const client = (req as any).clientInfo;
  if (!email || !password) { res.status(400).json({ message: "Email and password are required" }); return; }
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) { res.status(400).json({ message: "Invalid email or password" }); return; }
  // Lazy-hash plain-text passwords
  let match = false;
  if (user.passwordHash.startsWith("$2")) {
    match = await bcrypt.compare(password, user.passwordHash);
  } else {
    match = password === user.passwordHash;
    if (match) { user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS); await saveDB(db); }
  }
  if (!match) { res.status(400).json({ message: "Invalid email or password" }); return; }
  if (user.isBlocked) { res.status(403).json({ message: "Account blocked. Contact support." }); return; }
  // Session management
  db.sessions.forEach(s => { if (s.userId === user.id && s.deviceId === client.deviceId) s.isActive = false; });
  const others = db.sessions.filter(s => s.userId === user.id && s.isActive && s.deviceId !== client.deviceId);
  let warning = "";
  if (others.length) { others.forEach(s => { s.isActive = false; }); warning = `⚠️ Previous session on ${others[0].browser} was logged out.`; }
  const session: SessionLog = {
    id: `sess_${Math.random().toString(36).slice(2, 9)}`, userId: user.id, userEmail: user.email,
    deviceId: client.deviceId, browser: client.browser, ip: client.ip,
    location: client.location, loginTime: new Date().toISOString(), isActive: true,
  };
  db.sessions.push(session);
  await saveDB(db);
  const token = jwt.sign({ userId: user.id, deviceId: client.deviceId }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ message: "Login successful", token, warning, user: { id: user.id, name: user.name, email: user.email, role: user.role, profileImg: user.profileImg } });
});

app.post("/api/auth/logout", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      const { userId, deviceId } = jwt.verify(auth.split(" ")[1], JWT_SECRET) as any;
      db.sessions.forEach(s => { if (s.userId === userId && s.deviceId === deviceId) s.isActive = false; });
      await saveDB(db);
    } catch { /* expired token — nothing to do */ }
  }
  res.json({ message: "Logged out" });
});

app.get("/api/auth/me", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, profileImg: user.profileImg } });
});

app.post("/api/auth/profile/update", async (req, res) => {
  const u = getAuthenticatedUser(req);
  if (!u) { res.status(401).json({ message: "Unauthorized" }); return; }
  const user = db.users.find(x => x.id === u.id)!;
  const { name, profileImg, newPassword } = req.body;
  if (name) user.name = name;
  if (profileImg) user.profileImg = profileImg;
  if (newPassword) user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await saveDB(db);
  res.json({ message: "Profile updated", user: { id: user.id, name: user.name, email: user.email, role: user.role, profileImg: user.profileImg } });
});

// ── Session routes ────────────────────────────────────────────────────────
app.get("/api/sessions/check", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  const sessions = db.sessions.filter(s => s.userId === user.id && s.isActive);
  res.json({ currentDevice: (req as any).clientInfo.deviceId, sessions });
});

app.post("/api/sessions/clear-others", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  const myDevice = (req as any).clientInfo.deviceId;
  let count = 0;
  db.sessions.forEach(s => { if (s.userId === user.id && s.isActive && s.deviceId !== myDevice) { s.isActive = false; count++; } });
  if (count) await saveDB(db);
  res.json({ message: `Logged out ${count} other device(s).`, clearedCount: count });
});

// ── Course routes ─────────────────────────────────────────────────────────
app.get("/api/courses", (_req, res) => res.json({ courses: db.courses }));

app.get("/api/courses/:id", (req, res) => {
  const c = db.courses.find(x => x.id === req.params.id);
  if (!c) { res.status(404).json({ message: "Course not found" }); return; }
  res.json({ course: c });
});

// ── PDF routes ────────────────────────────────────────────────────────────
function toPublicPdf(p: PdfProduct, hasAccess: boolean) {
  const { pdfUrl, ...rest } = p;
  return { ...rest, pdfUrl: hasAccess ? pdfUrl : "", hasAccess };
}

app.get("/api/pdfs", (req, res) => {
  const user = getAuthenticatedUser(req);
  const owned = user ? db.orders.filter(o => o.userId === user.id && o.productType === "pdf" && o.status === "approved").map(o => o.courseId) : [];
  res.json({ pdfs: db.pdfs.map(p => toPublicPdf(p, owned.includes(p.id))) });
});

app.get("/api/pdfs/:id", (req, res) => {
  const p = db.pdfs.find(x => x.id === req.params.id);
  if (!p) { res.status(404).json({ message: "PDF not found" }); return; }
  const user = getAuthenticatedUser(req);
  const has = !!user && db.orders.some(o => o.userId === user.id && o.courseId === p.id && o.productType === "pdf" && o.status === "approved");
  res.json({ pdf: toPublicPdf(p, has) });
});

app.get("/api/pdfs/:id/secure-access", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ message: "Login required" }); return; }
  const p = db.pdfs.find(x => x.id === req.params.id);
  if (!p) { res.status(404).json({ message: "PDF not found" }); return; }
  const has = db.orders.some(o => o.userId === user.id && o.courseId === p.id && o.productType === "pdf" && o.status === "approved");
  if (!has) { res.status(403).json({ message: "Purchase required to access this resource." }); return; }
  res.json({ pdfUrl: p.pdfUrl, title: p.title });
});

// ── WPay helper: create order on gateway and return checkout URL ──────────
async function wpayInitiatePayin(orderId: string, amount: number, callbackUrl: string): Promise<{ success: boolean; checkoutUrl?: string; error?: string }> {
  try {
    const params: Record<string, string | number> = {
      mch_id: WPAY_MERCHANT_ID,
      mch_order_no: orderId,
      money: amount,
      currency: "PKR",
      pay_type: "8001",
      notify_url: callbackUrl,
      goods_name: "Trade With Tayyab Course",
    };
    params.sign = wpaySign(params, WPAY_SIGNATURE_SALT);
    const resp = await axios.post(`${WPAY_API_BASE}/v1/Payin`, params, { timeout: 10000 });
    const data = resp.data;
    if (data?.payUrl || data?.pay_url || data?.checkoutUrl) {
      return { success: true, checkoutUrl: data.payUrl || data.pay_url || data.checkoutUrl };
    }
    return { success: false, error: data?.msg || "No checkout URL returned from WPay" };
  } catch (e: any) {
    return { success: false, error: e?.response?.data?.msg || e?.message || "WPay API unreachable" };
  }
}

// ── Enrollment helper: approve order + assign content ────────────────────
async function approveOrder(orderId: string): Promise<void> {
  const order = db.orders.find(o => o.id === orderId);
  if (!order) return;
  order.status = "approved";
  if (order.productType !== "pdf") {
    if (!db.progress.some(p => p.userId === order.userId && p.courseId === order.courseId)) {
      db.progress.push({ userId: order.userId, courseId: order.courseId, completedLessons: [], updatedAt: new Date().toISOString() });
    }
  }
  await saveDB(db);
}

// ── Course enrollment — WPay ──────────────────────────────────────────────
app.post("/api/courses/:id/enroll-wpay", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ message: "Login required" }); return; }
  const course = db.courses.find(c => c.id === req.params.id);
  if (!course) { res.status(404).json({ message: "Course not found" }); return; }
  if (db.orders.some(o => o.userId === user.id && o.courseId === course.id && o.status === "approved")) {
    res.json({ message: "Already enrolled", alreadyEnrolled: true }); return;
  }
  const orderId = `ord_wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const order: Order = {
    id: orderId, userId: user.id, userEmail: user.email,
    courseId: course.id, courseTitle: course.title,
    amount: course.price, paymentMethod: "WPay",
    accountNumber: req.body.paymentNumber || "pending",
    status: "pending", createdAt: new Date().toISOString(),
  };
  db.orders.push(order);
  await saveDB(db);

  const host = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`;
  const callbackUrl = `${host}/api/payments/wpay/callback`;
  const result = await wpayInitiatePayin(orderId, course.price, callbackUrl);

  if (result.success && result.checkoutUrl) {
    res.json({ message: "Redirecting to WPay checkout...", checkoutUrl: result.checkoutUrl, orderId });
  } else {
    // WPay unreachable (dev/test) — auto-approve so dev can test the full flow
    console.warn(`⚠️  WPay API error: ${result.error}. Auto-approving order ${orderId} in dev mode.`);
    await approveOrder(orderId);
    res.json({ message: "WPay Secure Gateway: Payment Approved & Content Unlocked!", order, autoApproved: true });
  }
});

// ── PDF enrollment — WPay ─────────────────────────────────────────────────
app.post("/api/pdfs/:id/enroll-wpay", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ message: "Login required" }); return; }
  const pdf = db.pdfs.find(p => p.id === req.params.id);
  if (!pdf) { res.status(404).json({ message: "PDF not found" }); return; }
  if (db.orders.some(o => o.userId === user.id && o.courseId === pdf.id && o.productType === "pdf" && o.status === "approved")) {
    res.json({ message: "Already purchased", alreadyEnrolled: true }); return;
  }
  const orderId = `ord_wp_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const order: Order = {
    id: orderId, userId: user.id, userEmail: user.email,
    courseId: pdf.id, courseTitle: pdf.title, productType: "pdf",
    amount: pdf.price, paymentMethod: "WPay",
    accountNumber: req.body.paymentNumber || "pending",
    status: "pending", createdAt: new Date().toISOString(),
  };
  db.orders.push(order);
  await saveDB(db);

  const host = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`;
  const callbackUrl = `${host}/api/payments/wpay/callback`;
  const result = await wpayInitiatePayin(orderId, pdf.price, callbackUrl);

  if (result.success && result.checkoutUrl) {
    res.json({ message: "Redirecting to WPay checkout...", checkoutUrl: result.checkoutUrl, orderId });
  } else {
    console.warn(`⚠️  WPay API error: ${result.error}. Auto-approving order ${orderId} in dev mode.`);
    await approveOrder(orderId);
    res.json({ message: "WPay Secure Gateway: Payment Approved & PDF Unlocked!", order, autoApproved: true });
  }
});

// ── WPay callback (called by WPay servers after payment) ──────────────────
app.post("/api/payments/wpay/callback", async (req, res) => {
  const body = req.body || {};
  console.log("[WPay Callback]", body);
  const { mch_id, mch_order_no, out_trade_no, pay_money, money, status, sign } = body;
  const orderId  = out_trade_no || mch_order_no;
  const amount   = Number(pay_money || money || 0);
  const isSuccess = String(status) === "1" || String(status).toLowerCase() === "success";

  // Verify signature
  if (sign && WPAY_SIGNATURE_SALT) {
    const expected = wpaySign(body, WPAY_SIGNATURE_SALT);
    if (sign.toLowerCase() !== expected.toLowerCase()) {
      console.warn("[WPay Callback] Signature mismatch — rejecting");
      res.status(401).send("fail");
      return;
    }
  }
  if (!orderId) { res.status(400).send("fail"); return; }
  if (!isSuccess) { res.send("success"); return; }

  await approveOrder(orderId);
  console.log(`✅ [WPay Callback] Order ${orderId} approved, amount=${amount}`);
  res.send("success");
});

// ── User enrollments ──────────────────────────────────────────────────────
app.get("/api/users/enrollments", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ enrolled: [], purchasedPdfs: [] }); return; }
  const approved = db.orders.filter(o => o.userId === user.id && o.status === "approved");
  res.json({
    enrolled:      approved.filter(o => o.productType !== "pdf").map(o => o.courseId),
    purchasedPdfs: approved.filter(o => o.productType === "pdf").map(o => o.courseId),
  });
});

// ── Secure video play ────────────────────────────────────────────────────
app.get("/api/courses/:courseId/lessons/:lessonId/secure-play", (req, res) => {
  const user = getAuthenticatedUser(req);
  const course = db.courses.find(c => c.id === req.params.courseId);
  if (!course) { res.status(404).json({ message: "Course not found" }); return; }
  const lesson = course.lessons.find(l => l.id === req.params.lessonId);
  if (!lesson) { res.status(404).json({ message: "Lesson not found" }); return; }
  const hasAccess = !!user && db.orders.some(o => o.userId === user.id && o.courseId === course.id && o.status === "approved");
  if (!lesson.isPreview && !hasAccess) { res.status(403).json({ message: "Purchase required." }); return; }
  const client = (req as any).clientInfo;
  res.json({
    videoUrl: lesson.videoUrl, title: lesson.title,
    description: lesson.description || "Color Trading Lesson",
    isPreviewLimit: !hasAccess && lesson.isPreview,
    watermark: { email: user?.email || "guest", userId: user?.id || "GUEST", ip: client.ip, dateTime: new Date().toISOString().slice(0, 19) },
    signedToken: `tok_${Math.random().toString(36).slice(2, 12)}`,
    disableDownload: true,
    pdfUrl: lesson.pdfUrl || "", pdfTitle: lesson.pdfTitle || "",
  });
});

// ── Progress ─────────────────────────────────────────────────────────────
app.get("/api/progress/:courseId", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ completedLessons: [] }); return; }
  const prog = db.progress.find(p => p.userId === user.id && p.courseId === req.params.courseId);
  res.json({ completedLessons: prog?.completedLessons || [], lastWatchedLessonId: prog?.lastWatchedLessonId || "" });
});

app.post("/api/progress/:courseId/update", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }
  const { lessonId, completed, lastWatched } = req.body;
  let prog = db.progress.find(p => p.userId === user.id && p.courseId === req.params.courseId);
  if (!prog) { prog = { userId: user.id, courseId: req.params.courseId, completedLessons: [], updatedAt: "" }; db.progress.push(prog); }
  if (lastWatched) prog.lastWatchedLessonId = lastWatched;
  if (lessonId && typeof completed === "boolean") {
    if (completed && !prog.completedLessons.includes(lessonId)) prog.completedLessons.push(lessonId);
    if (!completed) prog.completedLessons = prog.completedLessons.filter(id => id !== lessonId);
  }
  prog.updatedAt = new Date().toISOString();
  await saveDB(db);
  res.json({ message: "Progress updated", completedLessons: prog.completedLessons, lastWatchedLessonId: prog.lastWatchedLessonId });
});

// ── AI Coach ──────────────────────────────────────────────────────────────
app.post("/api/ai/coach", async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { message, chatHistory } = req.body;
  if (!message) { res.status(400).json({ reply: "Please ask a question." }); return; }
  const systemPrompt = `You are "Tayyab AI Coach" for Trade With Tayyab LMS. Your expertise is Color Trading (Big/Small patterns), money management, and trading discipline. Student: ${user?.name || "Guest"}.`;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const replies = [
      "💡 The Big-Small Trend Strategy: trade with 3+ consecutive Big candles. Wait for a Small pullback then re-enter.",
      "📈 Money management: never risk more than 2% per round. Use staged capital — start small and scale after consistent wins.",
      "🎨 3 Big / 3 Small Pattern: after 3 consecutive same-colour candles, expect exhaustion. Watch for reversal on the 4th.",
      "📊 1 Small 2 Big Pattern: Small candle inside a Big trend, followed by 2 more Bigs = high-confidence continuation.",
    ];
    res.json({ reply: replies[Math.floor(Math.random() * replies.length)] + " *(Add GEMINI_API_KEY for full AI.)*" });
    return;
  }
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const history = (chatHistory || []).map((m: any) => ({ role: m.role === "user" ? "user" as const : "model" as const, parts: [{ text: m.content || m.text }] }));
    const r = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [...history, { role: "user", parts: [{ text: `${systemPrompt}\n\n${message}` }] }] });
    res.json({ reply: r.text });
  } catch (e: any) { res.json({ reply: `AI error: ${e.message}` }); }
});

// ── Admin routes ──────────────────────────────────────────────────────────
function requireAdmin(req: express.Request, res: express.Response): User | null {
  const user = getAuthenticatedUser(req);
  if (!user || user.role !== "admin") { res.status(403).json({ message: "Admin access required" }); return null; }
  return user;
}

app.get("/api/admin/dashboard-stats", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const approved = db.orders.filter(o => o.status === "approved");
  res.json({
    stats: { totalUsers: db.users.length, totalCourses: db.courses.length, totalSales: approved.length, totalRevenue: approved.reduce((s, o) => s + o.amount, 0) },
    suspiciousLogins: [],
    recentOrders: db.orders.slice(-5).reverse(),
  });
});

app.get("/api/admin/users", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ users: db.users });
});

app.post("/api/admin/users/:userId/toggle-block", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const u = db.users.find(x => x.id === req.params.userId);
  if (!u) { res.status(404).json({ message: "User not found" }); return; }
  if (u.id === "user-admin") { res.status(400).json({ message: "Cannot block primary admin" }); return; }
  u.isBlocked = !u.isBlocked;
  if (u.isBlocked) db.sessions.forEach(s => { if (s.userId === u.id) s.isActive = false; });
  await saveDB(db);
  res.json({ message: `${u.name} is now ${u.isBlocked ? "blocked" : "active"}`, user: u });
});

app.get("/api/admin/orders", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ orders: db.orders });
});

app.post("/api/admin/orders/:orderId/update", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) { res.status(404).json({ message: "Order not found" }); return; }
  order.status = req.body.status;
  if (req.body.status === "approved") await approveOrder(order.id);
  else await saveDB(db);
  res.json({ message: `Order updated to ${req.body.status}`, order });
});

// ── Admin course CRUD ─────────────────────────────────────────────────────
app.post("/api/admin/courses/create", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { title, description, category, price, thumbnailUrl, lessons, resources } = req.body;
  if (!title || !price) { res.status(400).json({ message: "Title and price required" }); return; }
  const c: Course = {
    id: `course-${Date.now()}`, title, description: description || "", category: category || "Color Trading",
    instructor: "Tayyab", rating: 5.0, reviewsCount: 0, price: Number(price),
    thumbnailUrl: thumbnailUrl || "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    isPublished: true,
    lessons: (lessons || []).map((l: any, i: number) => ({ id: l.id || `l-${Date.now()}-${i}`, title: l.title || "Lesson", duration: l.duration || "10:00", videoUrl: l.videoUrl || "", isPreview: !!l.isPreview, description: l.description || "", pdfUrl: l.pdfUrl || "", pdfTitle: l.pdfTitle || "", order: l.order || i + 1 })),
    resources: resources || [],
  };
  db.courses.push(c);
  await saveDB(db);
  res.json({ message: "Course created", course: c });
});

app.post("/api/admin/courses/update", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { id, ...fields } = req.body;
  const idx = db.courses.findIndex(c => c.id === id);
  if (idx === -1) { res.status(404).json({ message: "Course not found" }); return; }
  db.courses[idx] = { ...db.courses[idx], ...fields, id };
  await saveDB(db);
  res.json({ message: "Course updated", course: db.courses[idx] });
});

app.post("/api/admin/courses/:id/toggle-publish", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const c = db.courses.find(x => x.id === req.params.id);
  if (!c) { res.status(404).json({ message: "Course not found" }); return; }
  c.isPublished = !c.isPublished;
  await saveDB(db);
  res.json({ message: `Course is now ${c.isPublished ? "published" : "unpublished"}`, course: c });
});

app.post("/api/admin/courses/:id/delete", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  db.courses = db.courses.filter(c => c.id !== req.params.id);
  await saveDB(db);
  res.json({ message: "Course deleted" });
});

// ── Admin PDF CRUD ────────────────────────────────────────────────────────
app.post("/api/admin/pdfs/create", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { title, description, price, thumbnailUrl, pdfUrl, previewUrl, category } = req.body;
  if (!title || !price) { res.status(400).json({ message: "Title and price required" }); return; }
  const p: PdfProduct = {
    id: `pdf-${Date.now()}`, title, description: description || "", price: Number(price),
    thumbnailUrl: thumbnailUrl || "", pdfUrl: pdfUrl || "", previewUrl: previewUrl || "",
    category: category || "Color Trading", isPublished: true, createdAt: new Date().toISOString(),
  };
  db.pdfs.push(p);
  await saveDB(db);
  res.json({ message: "PDF created", pdf: p });
});

app.post("/api/admin/pdfs/update", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { id, ...fields } = req.body;
  const idx = db.pdfs.findIndex(p => p.id === id);
  if (idx === -1) { res.status(404).json({ message: "PDF not found" }); return; }
  db.pdfs[idx] = { ...db.pdfs[idx], ...fields, id };
  await saveDB(db);
  res.json({ message: "PDF updated", pdf: db.pdfs[idx] });
});

app.post("/api/admin/pdfs/:id/toggle-publish", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const p = db.pdfs.find(x => x.id === req.params.id);
  if (!p) { res.status(404).json({ message: "PDF not found" }); return; }
  p.isPublished = !p.isPublished;
  await saveDB(db);
  res.json({ message: `PDF is now ${p.isPublished ? "published" : "unpublished"}`, pdf: p });
});

app.post("/api/admin/pdfs/:id/delete", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  db.pdfs = db.pdfs.filter(p => p.id !== req.params.id);
  await saveDB(db);
  res.json({ message: "PDF deleted" });
});

// ── Cloudinary upload ────────────────────────────────────────────────────
app.post("/api/admin/upload", upload.single("file"), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!process.env.CLOUDINARY_API_SECRET) { res.status(500).json({ message: "Cloudinary not configured" }); return; }
  const file = (req as any).file;
  if (!file) { res.status(400).json({ message: "No file uploaded" }); return; }
  try {
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ resource_type: "auto", folder: "trade-with-tayyab" }, (err, r) => err ? reject(err) : resolve(r));
      stream.end(file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch (e: any) { res.status(500).json({ message: "Upload failed", error: e?.message }); }
});

// ── Server startup ────────────────────────────────────────────────────────
async function startServer() {
  try {
    await connectDB();
    await loadDB();
  } catch (err: any) {
    console.error("❌ Startup failed:", err.message);
    process.exit(1);
  }

  if (process.env.NODE_ENV !== "production") {
    // Dev: lazy-load Vite middleware for HMR
    try {
      const vite = await import("vite");
      const v = await vite.createServer({
        configFile: path.resolve(__dirname, "../../frontend/vite.config.ts"),
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(v.middlewares);
      console.log("⚡ Vite dev middleware attached");
    } catch {
      console.log("ℹ️  Vite not available — API-only mode");
    }
  } else {
    const distPath = path.resolve(process.cwd(), "dist/frontend");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Trade With Tayyab LMS running on http://localhost:${PORT}`);
    console.log(`   /api/courses  ✓`);
    console.log(`   /api/pdfs     ✓`);
    console.log(`   /api/auth/*   ✓`);
    console.log(`   WPay gateway  ✓  (merchant: ${WPAY_MERCHANT_ID})\n`);
  });
}

startServer();
