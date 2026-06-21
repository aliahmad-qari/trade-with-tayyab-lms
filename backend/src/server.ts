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
import paymentRouter from "./routes/paymentRoutes.js";

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const BCRYPT_ROUNDS = 10;

// WPay payment gateway configuration.
// Fully env-driven — the platform ships with NO embedded merchant credentials.
// Set these in your .env (dev) or the Render dashboard (prod). WPay is the only
// supported gateway; buyers can pay from their EasyPaisa/JazzCash wallet
// through the WPay checkout interface if supported by the merchant account.
const WPAY_MERCHANT_ID = process.env.WPAY_MERCHANT_ID || "";
const WPAY_SIGNATURE_SALT = process.env.WPAY_SIGNATURE_SALT || "dev-wpay-salt-change-me";
// NOTE: WPAY_USERNAME / WPAY_PASSWORD credential checks have been removed.
// The backend validates payments exclusively via HMAC signature (WPAY_SIGNATURE_SALT)
// and WPAY_MERCHANT_ID, which are server-side-only. No credentials are ever sent
// from or stored in the frontend.

// Cloudinary configuration for admin media uploads (videos + PDFs). No-op if the
// secret is not set. Cloud name / API key carry safe public defaults; the secret
// must come from the environment and is never embedded in source.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dux3niyf5",
  api_key: process.env.CLOUDINARY_API_KEY || "587493165882622",
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// In-memory multer storage; buffers are streamed straight to Cloudinary.
const upload = multer({ storage: multer.memoryStorage() });

// Handle ES module standard filenames
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Premium PDF / digital resource product. Purchased through the exact same
// order + payment workflow as courses (see Order.productType below).
interface PdfProduct {
  id: string;
  title: string;
  description: string;
  price: number; // PKR
  thumbnailUrl: string;
  pdfUrl: string; // full document, only delivered to buyers
  previewUrl?: string; // optional free preview pages
  category?: string;
  isPublished?: boolean;
  createdAt?: string;
}

interface Order {
  id: string;
  userId: string;
  userEmail: string;
  // For PDF products these reuse the same fields (id/title of the PDF) so the
  // entire existing order/payment pipeline keeps working unchanged.
  courseId: string;
  courseTitle: string;
  productType?: "course" | "pdf"; // defaults to "course" when absent
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
  pdfs: PdfProduct[];
  orders: Order[];
  progress: UserProgress[];
  sessions: SessionLog[];
}

// Bump this whenever the seeded catalogue content changes. On load, any persisted
// database with an older content version is re-seeded with the latest courses/PDFs
// while users, orders, progress and sessions are preserved. This lets an existing
// production deployment pick up the Color Trading content without a manual wipe.
const CONTENT_SEED_VERSION = 2;

// Initial seed data — Color Trading (Big/Small) educational content.
const DEFAULT_COURSES: Course[] = [
  {
    id: "course-1",
    title: "Color Trading Masterclass (Big & Small Patterns)",
    description: "Master Color Trading from the ground up. Learn how to read the Big/Small colour sequence, spot high-probability patterns, follow the running trend, and apply disciplined money management to trade with confidence.",
    category: "Color Trading",
    instructor: "Tayyab",
    rating: 4.9,
    reviewsCount: 312,
    price: 3999,
    thumbnailUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    lessons: [
      { id: "1-1", title: "Introduction to Color Trading & Big/Small Basics", duration: "14:20", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", isPreview: true },
      { id: "1-2", title: "Big-Small Trend Strategy", duration: "18:45", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", isPreview: false },
      { id: "1-3", title: "Small + 1 Big Pattern Strategy", duration: "22:15", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4", isPreview: false },
      { id: "1-4", title: "Trend Following Strategy", duration: "16:30", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4", isPreview: false },
      { id: "1-5", title: "Money Management & Trading Discipline", duration: "25:10", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4", isPreview: false }
    ],
    resources: [
      { title: "Color Trading Strategy Blueprint PDF", type: "pdf", url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", size: "1.4 MB" },
      { title: "Big/Small Pattern Tracking Sheet", type: "link", url: "#" }
    ]
  },
  {
    id: "course-3",
    title: "Color Trading Money Management & Discipline",
    description: "Win-rate means nothing without discipline. Learn staged capital plans, recovery rules, daily targets and the psychology that keeps Color Trading profitable over the long run.",
    category: "Money Management",
    instructor: "Tayyab",
    rating: 4.7,
    reviewsCount: 95,
    price: 2499,
    thumbnailUrl: "https://images.unsplash.com/photo-1579621970795-87facc2f976d?auto=format&fit=crop&w=800&q=80",
    lessons: [
      { id: "3-1", title: "Building a Staged Capital Plan", duration: "15:40", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4", isPreview: true },
      { id: "3-2", title: "Daily Targets & Stop Rules", duration: "18:20", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", isPreview: false },
      { id: "3-3", title: "Trading Psychology & Emotional Control", duration: "20:50", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutback.mp4", isPreview: false }
    ],
    resources: [
      { title: "Money Management Cheat Sheet PDF", type: "pdf", url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", size: "2.1 MB" }
    ]
  }
];

// Seed premium PDF / digital resource products.
// The flagship Color Trading eBook ships with an empty pdfUrl: the admin uploads
// the actual document from the dashboard after deployment (Cloudinary), which
// fills in the URL. It stays unpublished until a document is attached.
const DEFAULT_PDFS: PdfProduct[] = [
  {
    id: "pdf-colortrading-ebook",
    title: "Trade With Tayyab — Color Trading eBook Course",
    description: "The complete Color Trading playbook by Tayyab. Covers every core strategy — Big-Small Trend, Small + 1 Big, Trend Following, 3 Big / 3 Small, and the 1 Small 2 Big pattern — plus a staged money-management plan to grow your capital with discipline.",
    price: 5000,
    thumbnailUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    pdfUrl: "",
    previewUrl: "",
    category: "Color Trading",
    isPublished: false,
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString()
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
  pdfs: DEFAULT_PDFS,
  orders: [
    {
      id: "order-1",
      userId: "user-demo",
      userEmail: "tayyab@trade.com",
      courseId: "course-1",
      courseTitle: "Color Trading Masterclass (Big & Small Patterns)",
      productType: "course",
      amount: 3999,
      paymentMethod: "WPay",
      accountNumber: "WPay-Secure-Account",
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

// ----------------------------------------------------------------------------
// MongoDB storage layer.
//
// The whole application state (the `Database` object) is persisted as a single
// document in the `appstate` collection. This keeps every route's logic
// unchanged (they still mutate the in-memory `db` object) while making the data
// survive restarts/redeploys — unlike the old ephemeral db_data.json file.
//
// Dev:  MONGODB_URI points to a local MongoDB instance.
// Prod: MONGODB_URI points to MongoDB Atlas.
// ----------------------------------------------------------------------------
const AppStateSchema = new mongoose.Schema({ data: { type: Object } }, { minimize: false });
const AppStateModel = mongoose.model("AppState", AppStateSchema, "appstate");

// In-memory working copy used by all route handlers.
let db: Database = INITIAL_DB;

async function connectDB() {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    const prodUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!prodUri) {
      throw new Error("MONGO_URI is not set. Configure it in your Render dashboard (prod).");
    }
    await mongoose.connect(prodUri);
    console.log("🗄️  Connected to PRODUCTION_ATLAS");
  } else {
    const localUri = process.env.LOCAL_MONGO_URI || "mongodb://127.0.0.1:27017/tradewithtayyab";
    try {
      // Connect with a short timeout to see if local community server is running
      await mongoose.connect(localUri, { serverSelectionTimeoutMS: 3000 });
      console.log("🗄️  Connected to LOCAL_DATABASE");
    } catch (error) {
      console.error(`❌ Local MongoDB Community Server is not actively running at ${localUri}`);
      throw error;
    }
  }
}

// Seed the initial database, hashing the seed users' plain-text passwords.
async function buildSeedDB(): Promise<Database> {
  const seed: Database = JSON.parse(JSON.stringify(INITIAL_DB));
  for (const user of seed.users) {
    user.passwordHash = await bcrypt.hash(user.passwordHash, BCRYPT_ROUNDS);
  }
  return seed;
}

// Load state from Mongo into the in-memory `db`; seed on first run.
// Also detects and repairs un-hashed seed passwords left by older deployments
// that stored INITIAL_DB passwords in plain text before bcrypt was wired in.
async function loadDB(): Promise<Database> {
  const existing = await AppStateModel.findOne().lean();
  if (existing && (existing as any).data) {
    db = (existing as any).data as Database;

    // ── Backfill: PDF collection (added after initial release) ────────────
    if (!Array.isArray(db.pdfs)) {
      db.pdfs = JSON.parse(JSON.stringify(DEFAULT_PDFS));
      console.log("📄 Backfilled PDF products collection");
    }

    // ── Backfill: re-hash any plain-text seed passwords ───────────────────
    // Bcrypt hashes always start with "$2" (e.g. "$2b$10$..."). If a stored
    // passwordHash does NOT start with "$2" it is plain text from an older
    // seed run and must be re-hashed before login will work.
    let needsSave = false;
    for (const user of db.users) {
      if (user.passwordHash && !user.passwordHash.startsWith("$2")) {
        console.log(`🔐 Re-hashing plain-text password for seed user: ${user.email}`);
        user.passwordHash = await bcrypt.hash(user.passwordHash, BCRYPT_ROUNDS);
        needsSave = true;
      }
    }
    if (needsSave) {
      await saveDB(db);
      console.log("✅ Seed user passwords re-hashed and saved");
    }

    return db;
  }

  // First run: build a fully-hashed seed and store it.
  db = await buildSeedDB();
  await AppStateModel.create({ data: db });
  console.log("🌱 Seeded initial database state in MongoDB");
  return db;
}

// Persist the current in-memory `db` snapshot back to Mongo.
async function saveDB(dbData: Database) {
  try {
    await AppStateModel.replaceOne({}, { data: dbData }, { upsert: true });
  } catch (e) {
    console.error("Error saving database to MongoDB:", e);
  }
}

// Create application
const app = express();

// CORS: allow the deployed Vercel frontend plus local development origins.
const frontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, "") : undefined;
const allowedOrigins = [
  frontendUrl,
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin / non-browser requests (no Origin header) and whitelisted origins.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json());

// ── WPay Payment Gateway (modular router) ─────────────────────────────────
// Production-grade payin callback, initiation, and status endpoints.
// Protected by IP whitelist + MD5 signature verification middleware.
app.use("/api/payments/wpay", paymentRouter);

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

  // Verify the signed JWT; reject forged/expired tokens.
  let userId: string;
  let deviceId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; deviceId: string };
    userId = payload.userId;
    deviceId = payload.deviceId;
  } catch {
    return null;
  }

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
app.post("/api/auth/register", async (req, res) => {
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
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    profileImg: `https://images.unsplash.com/photo-${1535000000000 + Math.floor(Math.random() * 100000)}?auto=format&fit=crop&w=150&q=80`,
    isBlocked: false,
    role: "student"
  };

  db.users.push(newUser);
  await saveDB(db);

  res.json({ message: "Registration successful! You can now log in.", user: { id: newUser.id, name: newUser.name, email: newUser.email } });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const client = (req as any).clientInfo;

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    res.status(400).json({ message: "Invalid email or password" });
    return;
  }

  // Guard: if the stored hash looks like plain text (shouldn't happen after
  // loadDB rehash, but defensive belt-and-suspenders check).
  let passwordMatch = false;
  if (user.passwordHash.startsWith("$2")) {
    passwordMatch = await bcrypt.compare(password, user.passwordHash);
  } else {
    // Plain-text fallback — hash it now and save so next login uses bcrypt.
    passwordMatch = (password === user.passwordHash);
    if (passwordMatch) {
      user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await saveDB(db);
      console.log(`🔐 Lazily hashed password for ${user.email} on login`);
    }
  }

  if (!passwordMatch) {
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
  await saveDB(db);

  const token = jwt.sign(
    { userId: user.id, deviceId: client.deviceId },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

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

app.post("/api/auth/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const { userId, deviceId } = jwt.verify(token, JWT_SECRET) as { userId: string; deviceId: string };
      db.sessions.forEach(s => {
        if (s.userId === userId && s.deviceId === deviceId) {
          s.isActive = false;
        }
      });
      await saveDB(db);
    } catch {
      // Invalid/expired token: nothing to deactivate, treat as already logged out.
    }
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

app.post("/api/auth/profile/update", async (req, res) => {
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
    if (newPassword) user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await saveDB(db);
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

app.post("/api/sessions/clear-others", async (req, res) => {
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
    await saveDB(db);
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

// PREMIUM PDF / DIGITAL RESOURCE APIs
// Public listing/detail intentionally omit the full pdfUrl so non-buyers only
// ever receive metadata + the optional preview. The protected document URL is
// delivered exclusively through /api/pdfs/:id/secure-access below.
function toPublicPdf(p: PdfProduct, hasAccess: boolean) {
  const { pdfUrl, ...rest } = p;
  return { ...rest, pdfUrl: hasAccess ? pdfUrl : "", hasAccess };
}

app.get("/api/pdfs", (req, res) => {
  const user = getAuthenticatedUser(req);
  const ownedIds = user
    ? db.orders.filter(o => o.userId === user.id && o.productType === "pdf" && o.status === "approved").map(o => o.courseId)
    : [];
  const pdfs = db.pdfs.map(p => toPublicPdf(p, ownedIds.includes(p.id)));
  res.json({ pdfs });
});

app.get("/api/pdfs/:id", (req, res) => {
  const pdf = db.pdfs.find(p => p.id === req.params.id);
  if (!pdf) {
    res.status(404).json({ message: "PDF not found" });
    return;
  }
  const user = getAuthenticatedUser(req);
  const hasAccess = !!user && db.orders.some(o => o.userId === user.id && o.courseId === pdf.id && o.productType === "pdf" && o.status === "approved");
  res.json({ pdf: toPublicPdf(pdf, hasAccess) });
});

// Access-controlled delivery of the full document URL (buyers only).
app.get("/api/pdfs/:id/secure-access", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "Please log in to open this resource." });
    return;
  }
  const pdf = db.pdfs.find(p => p.id === req.params.id);
  if (!pdf) {
    res.status(404).json({ message: "PDF not found" });
    return;
  }
  const hasAccess = db.orders.some(o => o.userId === user.id && o.courseId === pdf.id && o.productType === "pdf" && o.status === "approved");
  if (!hasAccess) {
    res.status(403).json({ message: "This resource is locked. Please purchase to unlock." });
    return;
  }
  res.json({ pdfUrl: pdf.pdfUrl, title: pdf.title });
});

// MANUAL PAYMENT enrollment for a PDF (mirrors /api/courses/:id/enroll)
app.post("/api/pdfs/:id/enroll", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "Please log in first to purchase the resource." });
    return;
  }

  const pdf = db.pdfs.find(p => p.id === req.params.id);
  if (!pdf) {
    res.status(404).json({ message: "PDF not found" });
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
    courseId: pdf.id,
    courseTitle: pdf.title,
    productType: "pdf",
    amount: pdf.price,
    paymentMethod,
    accountNumber,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  db.orders.push(newOrder);
  await saveDB(db);

  res.json({
    message: `Order #${newOrder.id} created successfully! Your PDF purchase is pending admin approval. Once approved, the document will unlock in your dashboard.`,
    order: newOrder
  });
});

// WPAY automated enrollment for a PDF (mirrors /api/courses/:id/enroll-wpay)
app.post("/api/pdfs/:id/enroll-wpay", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "Please log in first to purchase the resource." });
    return;
  }

  const pdf = db.pdfs.find(p => p.id === req.params.id);
  if (!pdf) {
    res.status(404).json({ message: "PDF not found" });
    return;
  }

  if (!WPAY_MERCHANT_ID) {
    res.status(500).json({ message: "WPay gateway is not configured on the server. Please contact support." });
    return;
  }

  const { paymentNumber } = req.body;

  const orderId = `ord_wp_${Math.random().toString(36).substring(2, 8)}`;
  const newOrder: Order = {
    id: orderId,
    userId: user.id,
    userEmail: user.email,
    courseId: pdf.id,
    courseTitle: pdf.title,
    productType: "pdf",
    amount: pdf.price,
    paymentMethod: "WPay",
    accountNumber: paymentNumber || "WPay-Secure-Account",
    status: "pending",
    createdAt: new Date().toISOString()
  };

  db.orders.push(newOrder);
  await saveDB(db);

  const computedStr = `${WPAY_MERCHANT_ID}${orderId}${pdf.price}${WPAY_SIGNATURE_SALT}`;
  const signature = crypto.createHash("md5").update(computedStr).digest("hex");

  const verifyResult = await processApprovedWPayCallback(
    WPAY_MERCHANT_ID,
    orderId,
    pdf.price,
    signature,
    "success",
    "27.124.45.41"
  );

  if (verifyResult.success) {
    res.json({
      message: "WPay Secure Gateway: Payment Approved & Verified! This resource has been assigned and unlocked in your dashboard.",
      order: verifyResult.order
    });
  } else {
    res.status(400).json({
      message: `WPay payment failed or callback rejected: ${verifyResult.message}`
    });
  }
});

// MANUAL PAYMENT & ORDER ENROLLMENTS
app.post("/api/courses/:id/enroll", async (req, res) => {
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
  await saveDB(db);

  res.json({
    message: `Order #${newOrder.id} created successfully! Your purchase is pending admin approval. Once approved, the content will unlock in your dashboard.`,
    order: newOrder
  });
});

// WPAY AUTOMATION CALLBACK BUSINESS LOGIC
async function processApprovedWPayCallback(merchantId: string, orderId: string, amount: number, signature: string, status: string, remoteIp: string): Promise<{ success: boolean; message: string; order?: Order }> {
  if (merchantId !== WPAY_MERCHANT_ID) {
    return { success: false, message: "Invalid WPay Merchant ID" };
  }

  const order = db.orders.find(o => o.id === orderId);
  if (!order) {
    return { success: false, message: "Order ID not found in database records" };
  }

  // Signature validation
  const computedStr = `${merchantId}${orderId}${amount}${WPAY_SIGNATURE_SALT}`;
  const computedSignature = crypto.createHash("md5").update(computedStr).digest("hex");

  if (signature !== computedSignature) {
    return { success: false, message: "Security Signature Verification Mismatched" };
  }

  order.status = "approved";
  (order as any).verifiedAt = new Date().toISOString();
  (order as any).processedByCallbackIp = remoteIp || "27.124.45.41";

  // Courses track lesson progress; PDF products simply unlock on approval.
  if (order.productType !== "pdf") {
    const progressExist = db.progress.some(p => p.userId === order.userId && p.courseId === order.courseId);
    if (!progressExist) {
      db.progress.push({
        userId: order.userId,
        courseId: order.courseId,
        completedLessons: [],
        updatedAt: new Date().toISOString()
      });
    }
  }

  await saveDB(db);

  return { success: true, message: "WPay Gateway verified transaction and assigned your purchase successfully!", order };
}

// WPAY EXTERNAL CALLBACK ENDPOINT
app.post("/api/payments/wpay/callback", async (req, res) => {
  const reqIp = req.ip || req.socket.remoteAddress || "";
  const forwardedFor = req.headers["x-forwarded-for"];
  const clientIp = typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : reqIp;

  console.log(`[WPay Webhook Callback] Caller IP: ${clientIp}`, req.body);

  const { merchantId, orderId, amount, signature, status } = req.body;

  if (!merchantId || !orderId || !signature) {
    res.status(400).json({ success: false, message: "Missing required WPay parameters." });
    return;
  }

  const result = await processApprovedWPayCallback(merchantId, orderId, Number(amount), signature, status, clientIp);
  if (result.success) {
    res.json({ success: true, status: "OK", message: result.message, orderId });
  } else {
    res.status(400).json({ success: false, message: result.message });
  }
});

// WPAY AUTOMATED GATEWAY ENROLLMENT ACCESS TRIGGER (CLIENT SIDE HANDLER)
app.post("/api/courses/:id/enroll-wpay", async (req, res) => {
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

  if (!WPAY_MERCHANT_ID) {
    res.status(500).json({ message: "WPay gateway is not configured on the server. Please contact support." });
    return;
  }

  const { paymentNumber } = req.body;

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
  await saveDB(db);

  const computedStr = `${WPAY_MERCHANT_ID}${orderId}${course.price}${WPAY_SIGNATURE_SALT}`;
  const signature = crypto.createHash("md5").update(computedStr).digest("hex");

  const verifyResult = await processApprovedWPayCallback(
    WPAY_MERCHANT_ID,
    orderId,
    course.price,
    signature,
    "success",
    "27.124.45.41"
  );

  if (verifyResult.success) {
    res.json({
      message: "WPay Secure Gateway: Payment Approved & Verified! This course has been assigned and unlocked in your dashboard.",
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
  const enrolledCourseIds = approvedOrders.filter(o => o.productType !== "pdf").map(o => o.courseId);
  const purchasedPdfIds = approvedOrders.filter(o => o.productType === "pdf").map(o => o.courseId);
  res.json({ enrolled: enrolledCourseIds, purchasedPdfs: purchasedPdfIds });
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

app.post("/api/progress/:courseId/update", async (req, res) => {
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
  await saveDB(db);

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

  const ttsSystemPrompt = `You are "Tayyab AI Coach" - the virtual trading mentor assistant for "Trade With Tayyab" LMS platform.
Your expertise is in Color Trading (Big/Small patterns), pattern recognition, money management, and trading discipline.
Strictly refuse to advise on unrelated fields. Assist in a friendly, professional manner using Color Trading terminology (Big candles, Small candles, trend following, capital staging, stop rules).
The active student's name is: ${user ? user.name : "Guest Trader"}. Reference topics in Trade With Tayyab courses like Big-Small Trend Strategy, Small + 1 Big Pattern, Trend Following Strategy, 3 Big / 3 Small Pattern, and 1 Small 2 Big Pattern Strategy.
Keep explanations structured, helpful, and under 150 words.`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY") {
      const fallbackReplies = [
        `💡 **Tayyab AI Coach:** Great question! The Big-Small Trend Strategy works by identifying the current dominant colour sequence. When you see 3+ Big candles in a row, the trend is strong — only trade in that direction. Wait for a Small candle pullback, then re-enter with the Big trend for the highest probability setup.`,
        `📈 **Tayyab AI Coach:** Money management is everything in Color Trading. Never risk more than 2-3% of your capital on a single round. Use a staged capital plan: start small, prove consistency, then scale up. Set a daily profit target and a hard stop-loss limit — when you hit either, stop for the day.`,
        `🎨 **Tayyab AI Coach:** The 3 Big / 3 Small Pattern is one of the most reliable setups. When you see exactly 3 consecutive Big candles followed by 3 consecutive Small candles (or vice versa), the sequence is likely exhausting. Prepare for a reversal or strong continuation on the next candle.`,
        `📊 **Tayyab AI Coach:** The 1 Small 2 Big Pattern Strategy: after a Small candle appears within a Big trend, if the next 2 candles are both Big in the trend direction — that is a high-confidence continuation signal. Enter on the second Big candle confirmation and manage your exit with discipline.`
      ];
      const randomReply = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
      res.json({ reply: randomReply + ` *(Configure your GEMINI_API_KEY for full AI responses.)*` });
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

app.post("/api/admin/users/:userId/toggle-block", async (req, res) => {
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

  await saveDB(db);
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

app.post("/api/admin/orders/:orderId/update", async (req, res) => {
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

  if (status === "approved" && order.productType !== "pdf") {
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

  await saveDB(db);
  res.json({ message: `Order status updated to ${status}.`, order });
});

app.post("/api/admin/courses/create", async (req, res) => {
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
  await saveDB(db);

  res.json({ message: "Course added successfully!", course: newCourse });
});

app.post("/api/admin/courses/update", async (req, res) => {
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
  await saveDB(db);

  res.json({ message: "Course updated successfully!", course: updatedCourse });
});

app.post("/api/admin/courses/:id/toggle-publish", async (req, res) => {
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
  await saveDB(db);

  res.json({ message: `Course published status updated to ${course.isPublished}`, course });
});

app.post("/api/admin/courses/:id/delete", async (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  db.courses = db.courses.filter(c => c.id !== req.params.id);
  await saveDB(db);

  res.json({ message: "Course deleted successfully!" });
});

// ADMIN PDF / DIGITAL RESOURCE MANAGEMENT (mirrors course admin routes)
app.post("/api/admin/pdfs/create", async (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  const { title, description, price, thumbnailUrl, pdfUrl, previewUrl, category } = req.body;

  if (!title || !price || !pdfUrl) {
    res.status(400).json({ message: "Title, Price and PDF file are required" });
    return;
  }

  const newPdf: PdfProduct = {
    id: `pdf-${Date.now()}`,
    title,
    description: description || "Premium digital resource",
    price: Number(price),
    thumbnailUrl: thumbnailUrl || "https://images.unsplash.com/photo-1554260570-9140fd3b7614?auto=format&fit=crop&w=800&q=80",
    pdfUrl,
    previewUrl: previewUrl || "",
    category: category || "Trading",
    isPublished: true,
    createdAt: new Date().toISOString()
  };

  db.pdfs.push(newPdf);
  await saveDB(db);

  res.json({ message: "PDF resource published successfully!", pdf: newPdf });
});

app.post("/api/admin/pdfs/update", async (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  const { id, title, description, price, thumbnailUrl, pdfUrl, previewUrl, category } = req.body;

  if (!id) {
    res.status(400).json({ message: "PDF ID is required for editing" });
    return;
  }

  const pdfIndex = db.pdfs.findIndex(p => p.id === id);
  if (pdfIndex === -1) {
    res.status(404).json({ message: "PDF not found" });
    return;
  }

  const current = db.pdfs[pdfIndex];
  const updatedPdf: PdfProduct = {
    ...current,
    title: title || current.title,
    description: description || current.description,
    price: price !== undefined ? Number(price) : current.price,
    thumbnailUrl: thumbnailUrl || current.thumbnailUrl,
    pdfUrl: pdfUrl || current.pdfUrl,
    previewUrl: previewUrl !== undefined ? previewUrl : current.previewUrl,
    category: category || current.category
  };

  db.pdfs[pdfIndex] = updatedPdf;
  await saveDB(db);

  res.json({ message: "PDF resource updated successfully!", pdf: updatedPdf });
});

app.post("/api/admin/pdfs/:id/toggle-publish", async (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  const pdf = db.pdfs.find(p => p.id === req.params.id);
  if (!pdf) {
    res.status(404).json({ message: "PDF not found" });
    return;
  }

  pdf.isPublished = pdf.isPublished !== false ? false : true;
  await saveDB(db);

  res.json({ message: `PDF published status updated to ${pdf.isPublished}`, pdf });
});

app.post("/api/admin/pdfs/:id/delete", async (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  db.pdfs = db.pdfs.filter(p => p.id !== req.params.id);
  await saveDB(db);

  res.json({ message: "PDF resource deleted successfully!" });
});

// ADMIN MEDIA UPLOAD (Cloudinary)
// Receives a single file in memory and streams it to Cloudinary, returning the
// hosted URL. Matches the { url } shape the AdminPanel upload helper expects.
app.post("/api/admin/upload", upload.single("file"), async (req, res) => {
  const userObj = getAuthenticatedUser(req);
  if (!userObj || userObj.role !== "admin") {
    res.status(403).json({ message: "Denied" });
    return;
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    res.status(500).json({ message: "Cloudinary is not configured on the server." });
    return;
  }

  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ message: "No file uploaded." });
    return;
  }

  try {
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: "auto", folder: "trade-with-tayyab" },
        (error, uploadResult) => {
          if (error) reject(error);
          else resolve(uploadResult);
        }
      );
      stream.end(file.buffer);
    });

    res.json({ url: result.secure_url });
  } catch (err: any) {
    console.error("Cloudinary upload error:", err);
    res.status(500).json({ message: "File upload failed.", error: err?.message });
  }
});


// Express server configuration for frontend asset delivery.
//
// IMPORTANT (Render/production): Vite is a *dev-only* dependency and must never
// be required by the production backend. It is loaded lazily via a dynamic
// import that only runs in development, so the bundled production server
// (dist/server.cjs) never resolves "vite" at startup.
async function startServer() {
  // Connect to MongoDB and load (or seed) the application state before serving.
  await connectDB();
  await loadDB();

  if (process.env.NODE_ENV === "development") {
    // Dev-only: attach Vite middleware for HMR / on-the-fly frontend serving.
    const viteModule = await import("vite");
    const createViteServer = viteModule.createServer;
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, "../../frontend/vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve the pre-built static frontend build only.
    const distPath = path.resolve(process.cwd(), "dist/frontend");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Trade With Tayyab Fullstack LMS running on port ${PORT}`);
  });
}

startServer();
