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
// ── WPay credentials ────────────────────────────────────────────────────────
// Primary env var names match the live merchant credentials:
//   WPAY_MCH_ID, WPAY_SECRET_KEY
// Legacy names (WPAY_MERCHANT_ID / WPAY_SECRET / WPAY_SIGNATURE_SALT) are still
// accepted so existing Render config keeps working. NO secret is hard-coded —
// if WPAY_SECRET_KEY is unset the integration refuses to run (fail closed).
const WPAY_MCH_ID =
  process.env.WPAY_MCH_ID || process.env.WPAY_MERCHANT_ID || "2794";
const WPAY_SECRET_KEY =
  process.env.WPAY_SECRET_KEY ||
  process.env.WPAY_SECRET ||
  process.env.WPAY_SIGNATURE_SALT ||
  "";

// ── WPay endpoint ───────────────────────────────────────────────────────────
// The exact Payin URL comes from the WPay merchant dashboard (mch.wpay.one).
// It is NOT publicly documented. Set WPAY_PAYIN_URL to the full URL, e.g.
//   WPAY_PAYIN_URL=https://api.wpay.one/api/<Controller>/<Action>
// (or set WPAY_API_BASE + WPAY_PAYIN_PATH). If neither is set, payment
// initiation returns a clear 503 instead of calling a known-404 placeholder.
const WPAY_API_BASE   = process.env.WPAY_API_BASE   || "https://api.wpay.one";
const WPAY_PAYIN_URL  = process.env.WPAY_PAYIN_URL  || "";
const WPAY_PAYIN_PATH = process.env.WPAY_PAYIN_PATH || "";
// Resolved request URL: explicit full URL wins, else base+path, else "".
const WPAY_REQUEST_URL =
  WPAY_PAYIN_URL || (WPAY_PAYIN_PATH ? `${WPAY_API_BASE}${WPAY_PAYIN_PATH}` : "");

// ── WPay request shape (env-configurable to match the dashboard spec) ────────
// Field NAMES differ between gateways (mch_id vs mchId, out_trade_no vs
// mch_order_no). Override via env without touching code.
const WPAY_F_MCH      = process.env.WPAY_FIELD_MCH      || "mch_id";
const WPAY_F_ORDER    = process.env.WPAY_FIELD_ORDER    || "out_trade_no";
const WPAY_F_AMOUNT   = process.env.WPAY_FIELD_AMOUNT   || "money";
const WPAY_F_NOTIFY   = process.env.WPAY_FIELD_NOTIFY   || "notify_url";
const WPAY_F_PAYTYPE  = process.env.WPAY_FIELD_PAYTYPE  || "pay_type";
const WPAY_F_GOODS    = process.env.WPAY_FIELD_GOODS    || "goods_name";
const WPAY_F_CURRENCY = process.env.WPAY_FIELD_CURRENCY || "currency";
const WPAY_PAY_TYPE   = process.env.WPAY_PAY_TYPE       || "8001";
// Channels a client is allowed to request. Anything else falls back to the
// configured default so an arbitrary client value can never reach WPay.
const WPAY_CHANNELS   = ["JAZZCASH", "EASYPAISA"];
const WPAY_CURRENCY   = process.env.WPAY_CURRENCY       || "PKR";
const WPAY_GOODS_NAME = process.env.WPAY_GOODS_NAME     || "Trade With Tayyab";
// Some gateways expect the amount in minor units (paisa/cents). Toggle on if so.
const WPAY_AMOUNT_IN_CENTS = process.env.WPAY_AMOUNT_IN_CENTS === "true";
// Optional browser return URL (where WPay sends the user after paying).
const WPAY_RETURN_URL = process.env.WPAY_RETURN_URL || "";
const WPAY_F_RETURN   = process.env.WPAY_FIELD_RETURN || "return_url";

// ── WPay callback shape (env-configurable) ───────────────────────────────────
const WPAY_CB_ORDER   = process.env.WPAY_CB_FIELD_ORDER  || "out_trade_no";
const WPAY_CB_AMOUNT  = process.env.WPAY_CB_FIELD_AMOUNT || "pay_money";
const WPAY_CB_STATUS  = process.env.WPAY_CB_FIELD_STATUS || "status";
const WPAY_CB_TXN     = process.env.WPAY_CB_FIELD_TXN    || "transaction_id";
const WPAY_CB_SUCCESS = process.env.WPAY_CB_SUCCESS_VALUE || "1";

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
  isPaid?: boolean;
  paymentStatus?: "pending" | "paid" | "failed";
  transactionId?: string;
  purchasedCourse?: string;
  purchasedPDF?: string;
  paymentTimestamp?: string;
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

    // Ensure arrays exist (backfill if collection was added after first seed)
    if (!Array.isArray(db.pdfs))    { db.pdfs    = []; dirty = true; }
    if (!Array.isArray(db.courses)) { db.courses  = []; dirty = true; }
    if (!Array.isArray(db.orders))  { db.orders   = []; dirty = true; }
    if (!Array.isArray(db.progress)){ db.progress = []; dirty = true; }
    if (!Array.isArray(db.sessions)){ db.sessions = []; dirty = true; }

    // Re-hash plain-text passwords (migration for old deploys)
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
const allowedOrigins = [
  // Production custom domain (and www variant) — hard-coded so CORS works
  // even if FRONTEND_URL is unset in the deploy environment.
  "https://tradewithtayyab.tech",
  "https://www.tradewithtayyab.tech",
  frontendUrl,
  "http://localhost:3000",
  "http://localhost:5173",
  // Native Capacitor WebView origins (Android/iOS) for the mobile app.
  "https://localhost",
  "capacitor://localhost",
].filter(Boolean) as string[];
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error("CORS blocked")),
  credentials: true,
  // Reflect the request's allowed headers (Authorization, Content-Type, etc.)
  // and methods so preflight (OPTIONS) requests with auth headers succeed.
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // WPay posts callbacks as x-www-form-urlencoded

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
  // Sort parameters alphabetically
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
// `configured` distinguishes "gateway not set up yet" (503, do NOT unlock)
// from "gateway rejected this order" (502). Neither ever auto-approves.
async function wpayInitiatePayin(
  orderId: string,
  amount: number,
  callbackUrl: string,
  payType?: string,
): Promise<{ success: boolean; payment_url?: string; transaction_id?: string; error?: string; configured: boolean }> {
  // Per-request channel (JAZZCASH/EASYPAISA); fall back to the configured default.
  const channel = payType || WPAY_PAY_TYPE;
  console.log(`\n[WPay] ── initiatePayin ── orderId=${orderId} amount=${amount} pay_type=${channel}`);
  console.log(`[WPay] mch_id="${WPAY_MCH_ID}" secret=${WPAY_SECRET_KEY ? "SET(" + WPAY_SECRET_KEY.length + " chars)" : "MISSING!"} url="${WPAY_REQUEST_URL || "(unset)"}"`);
  console.log(`[WPay] callback(notify_url)=${callbackUrl}`);

  // Fail closed on missing configuration — never invent an endpoint/secret.
  if (!WPAY_SECRET_KEY) {
    const error = "WPAY_SECRET_KEY is not set in environment — cannot sign request.";
    console.error(`[WPay] ❌ ${error}`);
    return { success: false, error, configured: false };
  }
  if (!WPAY_REQUEST_URL) {
    const error = "WPAY_PAYIN_URL is not set — get the exact Payin endpoint from the WPay merchant dashboard and set it in env.";
    console.error(`[WPay] ❌ ${error}`);
    return { success: false, error, configured: false };
  }

  try {
    // Build params using env-configurable field names so the request shape can
    // be matched to the dashboard spec without a code change.
    // WPay spec: money is an integer (no decimals). Pakistan PKR is whole rupees,
    // so we send the integer amount (or minor units if explicitly enabled).
    const amountValue = WPAY_AMOUNT_IN_CENTS ? Math.round(amount * 100) : Math.round(amount);
    // Field set matches the official WPay PayIn (H2C / cashier) spec exactly:
    //   mchId, currency, out_trade_no, pay_type, money, notify_url, returnUrl, sign
    // NOTE: goods_name is NOT part of the WPay spec — sending it would change the
    // signed param set and break the MD5 signature, so it is intentionally omitted.
    const params: Record<string, string | number> = {
      [WPAY_F_MCH]:      WPAY_MCH_ID,
      [WPAY_F_ORDER]:    orderId,
      [WPAY_F_AMOUNT]:   amountValue,
      [WPAY_F_CURRENCY]: WPAY_CURRENCY,
      [WPAY_F_PAYTYPE]:  channel,
      [WPAY_F_NOTIFY]:   callbackUrl,
    };
    if (WPAY_RETURN_URL) params[WPAY_F_RETURN] = WPAY_RETURN_URL;

    const sign = wpaySign(params, WPAY_SECRET_KEY);
    params.sign = sign;

    // ── Detailed request logging (requirement #11) ─────────────────────────
    console.log("[WPay] Request URL :", WPAY_REQUEST_URL);
    console.log("[WPay] Request body:", JSON.stringify(params));
    console.log("[WPay] Signature   :", sign);

    // WPay requires application/x-www-form-urlencoded (NOT JSON). URLSearchParams
    // serialises the param map into key=value&… form-encoded body.
    const formBody = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();

    const resp = await axios.post(WPAY_REQUEST_URL, formBody, {
      timeout: 12000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      validateStatus: () => true, // inspect non-2xx bodies instead of throwing
    });

    console.log(`[WPay] Response status=${resp.status} body=`, JSON.stringify(resp.data).slice(0, 1000));

    if (resp.status >= 400) {
      return { success: false, error: `Gateway HTTP ${resp.status}`, configured: true };
    }

    // WPay response shape: { code: 0, msg: "success", data: { url, transaction_Id, host } }
    // code === 0 means success; any other code is a documented business error.
    const data = resp.data;
    const code = data?.code;
    if (code !== undefined && Number(code) !== 0) {
      const errMsg = `WPay error code ${code}: ${data?.msg || data?.message || "see WPay code table"}`;
      console.warn(`[WPay] ⚠️  ${errMsg}`);
      return { success: false, error: errMsg, configured: true };
    }

    const url =
      data?.data?.url || data?.data?.payUrl ||
      data?.payUrl || data?.pay_url || data?.checkoutUrl ||
      data?.payment_url || data?.url;
    // WPay returns its gateway transaction id at initiation (the callback omits
    // it), so capture it here for storage on the order — needed for refunds and
    // reconciliation against the WPay dashboard.
    const transaction_id =
      data?.data?.transaction_Id || data?.data?.transaction_id ||
      data?.transaction_Id || data?.transaction_id || undefined;
    if (url) {
      console.log(`[WPay] ✅ Checkout URL: ${url}`);
      if (transaction_id) console.log(`[WPay] ✅ Transaction ID: ${transaction_id}`);
      return { success: true, payment_url: url, transaction_id, configured: true };
    }
    const errMsg = data?.msg || data?.message || data?.error || JSON.stringify(data);
    console.warn(`[WPay] ⚠️  No checkout URL in response. msg: ${errMsg}`);
    return { success: false, error: errMsg, configured: true };

  } catch (e: any) {
    const axiosData = e?.response?.data;
    console.error("[WPay] Gateway error status:", e?.response?.status);
    console.error("[WPay] Gateway error body  :", JSON.stringify(axiosData));
    const errMsg = axiosData?.msg || axiosData?.message || e?.message || "WPay API unreachable";
    console.error(`[WPay] ❌ initiatePayin FAILED: ${errMsg}`);
    return { success: false, error: errMsg, configured: true };
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
  const courseId = req.params.id;
  console.log(`\n[Course Enroll-WPay] ── START ── courseId=${courseId}`);
  try {
    const user = getAuthenticatedUser(req);
    if (!user) { res.status(401).json({ success: false, message: "Login required" }); return; }

    console.log(`[Course Enroll-WPay] DB has ${db.courses.length} courses. IDs: [${db.courses.map(c => c.id).join(", ")}]`);
    const course = db.courses.find(c => c.id === courseId);
    if (!course) {
      res.status(404).json({ success: false, message: `Course not found: ${courseId}` }); return;
    }

    if (db.orders.some(o => o.userId === user.id && o.courseId === course.id && o.status === "approved")) {
      res.json({ success: true, message: "Already enrolled", alreadyEnrolled: true }); return;
    }

    const reqType = String(req.body.payType || "").toUpperCase();
    const payType = WPAY_CHANNELS.includes(reqType) ? reqType : WPAY_PAY_TYPE;
    const orderId = `ord_wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const order: Order = {
      id: orderId, userId: user.id, userEmail: user.email,
      courseId: course.id, courseTitle: course.title,
      amount: course.price, paymentMethod: `WPay:${payType}`,
      accountNumber: req.body.paymentNumber || "wpay",
      status: "pending", createdAt: new Date().toISOString(),
    };
    db.orders.push(order);
    await saveDB(db);
    console.log(`[Course Enroll-WPay] ✅ Order created: ${orderId}`);

    const host = (process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const callbackUrl = `${host}/api/wpay/callback`;
    const result = await wpayInitiatePayin(orderId, course.price, callbackUrl, payType);

    if (result.success && result.payment_url) {
      // Persist WPay's real gateway transaction id (callback omits it).
      if (result.transaction_id) { order.transactionId = result.transaction_id; await saveDB(db); }
      res.json({ success: true, payment_url: result.payment_url, orderId, message: "Redirecting to WPay checkout..." });
    } else {
      // Do NOT auto-approve — the order stays "pending" until WPay's callback
      // confirms a real payment. 503 = gateway not configured, 502 = rejected.
      const code = result.configured ? 502 : 503;
      console.error(`[Course Enroll-WPay] ❌ WPay init failed (${code}): ${result.error}`);
      res.status(code).json({ success: false, orderId, message: result.error || "Payment gateway error. Please try again." });
    }
  } catch (err: any) {
    console.error("[Course Enroll-WPay] ❌ UNHANDLED EXCEPTION:", err?.message, err?.stack);
    res.status(500).json({
      success: false,
      message: err?.message || "Internal server error",
      ...(process.env.NODE_ENV !== "production" && { stack: err?.stack }),
    });
  }
  console.log(`[Course Enroll-WPay] ── END ──\n`);
});

// ── PDF enrollment — WPay ─────────────────────────────────────────────────
app.post("/api/pdfs/:id/enroll-wpay", async (req, res) => {
  const pdfId = req.params.id;
  console.log(`\n[PDF Enroll-WPay] ── START ── pdfId=${pdfId}`);
  try {
    // 1. Auth
    const user = getAuthenticatedUser(req);
    if (!user) {
      console.log("[PDF Enroll-WPay] ❌ Not authenticated");
      res.status(401).json({ success: false, message: "Login required" }); return;
    }
    console.log(`[PDF Enroll-WPay] ✅ User: ${user.email} (${user.id})`);

    // 2. PDF lookup
    console.log(`[PDF Enroll-WPay] DB has ${db.pdfs.length} PDFs. IDs: [${db.pdfs.map(p => p.id).join(", ")}]`);
    const pdf = db.pdfs.find(p => p.id === pdfId);
    if (!pdf) {
      console.log(`[PDF Enroll-WPay] ❌ PDF not found: ${pdfId}`);
      res.status(404).json({ success: false, message: `PDF not found: ${pdfId}. Available: ${db.pdfs.map(p=>p.id).join(", ")}` }); return;
    }
    console.log(`[PDF Enroll-WPay] ✅ PDF found: "${pdf.title}" price=${pdf.price} published=${pdf.isPublished}`);

    // 3. Already purchased?
    const alreadyOwned = db.orders.some(o => o.userId === user.id && o.courseId === pdf.id && o.productType === "pdf" && o.status === "approved");
    if (alreadyOwned) {
      console.log("[PDF Enroll-WPay] ℹ️  Already purchased");
      res.json({ success: true, message: "Already purchased", alreadyEnrolled: true }); return;
    }

    // 4. Validate price
    if (!pdf.price || pdf.price <= 0) {
      console.log(`[PDF Enroll-WPay] ❌ Invalid price: ${pdf.price}`);
      res.status(400).json({ success: false, message: `PDF price is invalid: ${pdf.price}` }); return;
    }

    // 5. Create pending order
    const reqType = String(req.body.payType || "").toUpperCase();
    const payType = WPAY_CHANNELS.includes(reqType) ? reqType : WPAY_PAY_TYPE;
    const orderId = `ord_wp_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const order: Order = {
      id: orderId, userId: user.id, userEmail: user.email,
      courseId: pdf.id, courseTitle: pdf.title, productType: "pdf",
      amount: pdf.price, paymentMethod: `WPay:${payType}`,
      accountNumber: req.body.paymentNumber || "wpay",
      status: "pending", createdAt: new Date().toISOString(),
    };
    db.orders.push(order);
    await saveDB(db);
    console.log(`[PDF Enroll-WPay] ✅ Order created: ${orderId}`);

    // 6. Call WPay
    const host = (process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const callbackUrl = `${host}/api/wpay/callback`;
    const result = await wpayInitiatePayin(orderId, pdf.price, callbackUrl, payType);

    if (result.success && result.payment_url) {
      // Persist WPay's real gateway transaction id (callback omits it).
      if (result.transaction_id) { order.transactionId = result.transaction_id; await saveDB(db); }
      console.log(`[PDF Enroll-WPay] ✅ WPay checkout URL ready (${payType}) — redirecting`);
      res.json({ success: true, payment_url: result.payment_url, orderId, message: "Redirecting to WPay checkout..." });
    } else {
      // Do NOT auto-approve — order stays "pending" until WPay's callback
      // confirms a real payment. 503 = gateway not configured, 502 = rejected.
      const code = result.configured ? 502 : 503;
      console.error(`[PDF Enroll-WPay] ❌ WPay init failed (${code}): ${result.error}`);
      res.status(code).json({ success: false, orderId, message: result.error || "Payment gateway error. Please try again." });
    }

  } catch (err: any) {
    console.error("[PDF Enroll-WPay] ❌ UNHANDLED EXCEPTION:", err?.message);
    console.error(err?.stack);
    res.status(500).json({
      success: false,
      message: err?.message || "Internal server error",
      ...(process.env.NODE_ENV !== "production" && { stack: err?.stack }),
    });
  }
  console.log(`[PDF Enroll-WPay] ── END ──\n`);
});

// ── WPay callback (called by WPay servers after payment) ──────────────────
// Production rules:
//   • Verify MD5 signature       • Verify amount via pay_money
//   • Verify order number exists  • Mark order paid + unlock access
//   • Save transaction ID         • Respond exactly "success"
app.post("/api/wpay/callback", async (req, res) => {
  const body: Record<string, any> = req.body || {};
  // Diagnostic: reveal exactly what WPay sends + how it was encoded.
  console.log("[WPay Callback] ── Received ──");
  console.log("[WPay Callback] content-type:", req.headers["content-type"]);
  console.log("[WPay Callback] method:", req.method, "query:", JSON.stringify(req.query));
  console.log("[WPay Callback] req.body:", req.body);
  console.log("[WPay Callback] body(json):", JSON.stringify(body));

  try {
    const orderId   = String(body[WPAY_CB_ORDER] || body.out_trade_no || body.mch_order_no || "");
    const sign      = body.sign;
    const paidAmount = Number(body[WPAY_CB_AMOUNT] ?? body.pay_money ?? body.money ?? 0);
    // Gateway txn id IF the callback carries one (current WPay sandbox omits it).
    const cbTxnId   = String(body[WPAY_CB_TXN] || body.transaction_Id || body.transaction_id || body.trade_no || "");
    const statusVal = String(body[WPAY_CB_STATUS] ?? body.status ?? "");
    const isSuccess = statusVal === String(WPAY_CB_SUCCESS) || statusVal.toLowerCase() === "success";

    // 1. Order number present
    if (!orderId) { console.warn("[WPay Callback] ❌ Missing order number"); res.status(400).send("fail"); return; }

    // 2. Signature verification (fail closed if no secret configured)
    if (!WPAY_SECRET_KEY) { console.error("[WPay Callback] ❌ WPAY_SECRET_KEY not set"); res.status(500).send("fail"); return; }
    if (!sign) { console.warn("[WPay Callback] ❌ Missing sign"); res.status(400).send("fail"); return; }
    const expected = wpaySign(body, WPAY_SECRET_KEY);
    const sigOk = String(sign).toLowerCase() === expected.toLowerCase();
    console.log(`[WPay Callback] Signature ${sigOk ? "✅ OK" : "❌ MISMATCH"} — expected=${expected} received=${sign}`);
    if (!sigOk) { res.status(401).send("fail"); return; }

    // 3. Order lookup
    const order = db.orders.find(o => o.id === orderId);
    if (!order) { console.warn(`[WPay Callback] ❌ Order not found: ${orderId}`); res.status(404).send("fail"); return; }

    // 4. Idempotency — already approved
    if (order.status === "approved" || order.paymentStatus === "paid") {
      console.log("[WPay Callback] ℹ️  Already processed — idempotent OK");
      res.send("success"); return;
    }

    // 5. Payment status
    if (!isSuccess) {
      console.log(`[WPay Callback] Payment not successful — status=${statusVal}. Marking failed.`);
      order.paymentStatus = "failed";
      await saveDB(db);
      res.send("success"); return; // ack so WPay stops retrying a known-failed txn
    }

    // 6. Amount verification — guard against tampered/short payments.
    const expectedAmount = WPAY_AMOUNT_IN_CENTS ? Math.round(order.amount * 100) : order.amount;
    if (Math.round(paidAmount) < Math.round(expectedAmount)) {
      console.warn(`[WPay Callback] ❌ Amount mismatch — paid=${paidAmount} expected=${expectedAmount} order=${orderId}`);
      res.status(400).send("fail"); return;
    }

    // 7. Approve + record transaction.
    // Prefer the real gateway id, in priority order:
    //   1. id carried on this callback (future-proof if WPay starts sending one)
    //   2. id we captured & stored at initiation (current sandbox path)
    //   3. synthetic last-resort so the field is never empty
    const txnId = cbTxnId || order.transactionId || `txn_${Date.now()}`;
    const txnSource = cbTxnId ? "from-callback" : order.transactionId ? "from-initiation" : "synthetic";
    order.isPaid = true;
    order.paymentStatus = "paid";
    order.transactionId = txnId;
    order.paymentTimestamp = new Date().toISOString();
    await approveOrder(orderId); // sets status="approved", grants access, saves
    console.log(`[WPay Callback] ✅ Order ${orderId} PAID (txn=${txnId} ${txnSource}, amount=${paidAmount}) — access granted`);
    res.send("success");

  } catch (err: any) {
    console.error("[WPay Callback] ❌ ERROR:", err?.message, err?.stack);
    res.status(500).send("fail");
  }
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
    const wpayReady = !!WPAY_SECRET_KEY && !!WPAY_REQUEST_URL;
    console.log(`   WPay gateway  ${wpayReady ? "✓" : "⚠"}  mch=${WPAY_MCH_ID} secret=${WPAY_SECRET_KEY ? "set" : "MISSING"} url=${WPAY_REQUEST_URL || "UNSET (set WPAY_PAYIN_URL)"}\n`);
  });
}

startServer();
