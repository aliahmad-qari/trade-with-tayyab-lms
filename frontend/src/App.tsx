import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import AICoachModal from "./components/AICoachModal";
import VideoPlayer from "./components/VideoPlayer";
import StudentPanel from "./components/StudentPanel";
import AdminPanel from "./components/AdminPanel";
import { Course, Order, User, SuspiciousLogin, PdfProduct } from "./types";
// @ts-ignore
import wingoPatternLight from "./assets/images/wingo_pattern_light_1781678462385.jpg";
// @ts-ignore
import wingoSuccess from "./assets/images/wingo_success_1781678481995.jpg";
// @ts-ignore
import wingoPatternDark from "./assets/images/wingo_pattern_dark_1781678502787.jpg";
// @ts-ignore
import tradePic from "./assets/images/tradepic.png";
import { 
  Award, TrendingUp, Coins, LineChart, Compass, HelpCircle, 
  CheckCircle, BookOpenText, Globe, CreditCard, 
  Plus, Trash, Shield, ChevronRight, Check,
  AlertCircle, Sparkles, BookOpen, Play, UserCheck, Info, Landmark, Star, AlertTriangle, Lock, Smartphone
} from "lucide-react";

// Notification Type
interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
}

export default function App() {
  // Navigation & Screen Controls
  const [activeTab, setActiveTab] = useState<string>("home");
  const [prevActiveTabs, setPrevActiveTabs] = useState<string[]>([]);
  const [isCoachOpen, setIsCoachOpen] = useState<boolean>(false);
  
  // Data State
  const [courses, setCourses] = useState<Course[]>([]);
  const [pdfs, setPdfs] = useState<PdfProduct[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const [purchasedPdfIds, setPurchasedPdfIds] = useState<string[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<PdfProduct | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem("tayyab_token"));
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activeLesson, setActiveLesson] = useState<{ lessonId: string; videoUrl: string; isPreview: boolean } | null>(null);
  const [activeLessonDetails, setActiveLessonDetails] = useState<any>(null);
  
  // UI States & Forms
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [courseCategoryFilter, setCourseCategoryFilter] = useState("All");
  const [courseSearch, setCourseSearch] = useState("");
  const [coursePage, setCoursePage] = useState(1);

  // Contact Form
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");

  // Payment Form Trigger — unified for courses and premium PDFs so the exact
  // same modal + workflow serves both product kinds.
  const [paymentModalProduct, setPaymentModalProduct] = useState<{ kind: "course" | "pdf"; id: string; title: string; price: number } | null>(null);
  const [payNumber, setPayNumber] = useState("");

  // Account Settings Form
  const [settingsName, setSettingsName] = useState("");
  const [settingsImg, setSettingsImg] = useState("");
  const [settingsPassword, setSettingsPassword] = useState("");

  // Admin Board State
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminOrders, setAdminOrders] = useState<any[]>([]);
  const [suspiciousLogins, setSuspiciousLogins] = useState<SuspiciousLogin[]>([]);

  // Custom Notifications Container
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hasDeviceWarning, setHasDeviceWarning] = useState(false);

  // Initialize Toasts trigger
  const addToast = (message: string, type: Toast["type"] = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5500);
  };

  // Auth fetch user information on start
  useEffect(() => {
    fetchSessionUser();
    fetchCourses();
    fetchPdfs();
  }, [authToken]);

  const fetchSessionUser = async () => {
    if (!authToken) {
      setCurrentUser(null);
      setEnrolledCourseIds([]);
      setPurchasedPdfIds([]);
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch("/api/auth/me", {
        headers: { "Authorization": `Bearer ${authToken}` }
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
        setSettingsName(data.user.name);
        setSettingsImg(data.user.profileImg || "");
        
        // Fetch users enrolled courses
        fetchEnrollments();
        // Check active session tracking for multiple device logging warnings
        checkActiveDevices();
      } else {
        // Clear corrupt token
        handleLogoutAction();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const response = await fetch("/api/courses");
      if (response.ok) {
        const data = await response.json();
        const mappedCourses = (data.courses || []).map((course: Course) => {
          let thumb = course.thumbnailUrl;
          if (course.id === "course-1") thumb = wingoPatternDark;
          else if (course.id === "course-2") thumb = wingoSuccess;
          else if (course.id === "course-3") thumb = wingoPatternLight;
          return { ...course, thumbnailUrl: thumb };
        });
        setCourses(mappedCourses);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPdfs = async () => {
    try {
      const response = await fetch("/api/pdfs", {
        headers: authToken ? { "Authorization": `Bearer ${authToken}` } : undefined
      });
      if (response.ok) {
        const data = await response.json();
        setPdfs(data.pdfs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEnrollments = async () => {
    if (!authToken) return;
    try {
      const response = await fetch("/api/users/enrollments", {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEnrolledCourseIds(data.enrolled || []);
        setPurchasedPdfIds(data.purchasedPdfs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const checkActiveDevices = async () => {
    if (!authToken) return;
    try {
      const response = await fetch("/api/sessions/check", {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.sessions && data.sessions.length > 1) {
          setHasDeviceWarning(true);
        } else {
          setHasDeviceWarning(false);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Admin loader lists
  const fetchAdminMetrics = async () => {
    if (!authToken || currentUser?.role !== "admin") return;
    try {
      const rStats = await fetch("/api/admin/dashboard-stats", { headers: { "Authorization": `Bearer ${authToken}` } });
      if (rStats.ok) {
        const dStats = await rStats.json();
        setAdminStats(dStats.stats);
        setSuspiciousLogins(dStats.suspiciousLogins || []);
      }

      const rUsers = await fetch("/api/admin/users", { headers: { "Authorization": `Bearer ${authToken}` } });
      if (rUsers.ok) {
        const dUsers = await rUsers.json();
        setAdminUsers(dUsers.users || []);
      }

      const rOrders = await fetch("/api/admin/orders", { headers: { "Authorization": `Bearer ${authToken}` } });
      if (rOrders.ok) {
        const dOrders = await rOrders.json();
        setAdminOrders(dOrders.orders || []);
      }
    } catch (e) {
      console.error("Admin dashboard data fetch exception:", e);
    }
  };

  // Dynamic router triggers
  const changeTab = (tab: string) => {
    // If opening admin tab, update analytics
    if (tab === "admin") {
      fetchAdminMetrics();
    }
    setPrevActiveTabs(prev => [...prev, activeTab]);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Actions handlers
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      addToast("Email and Password are required", "error");
      return;
    }
    setIsSubmitLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem("tayyab_token", data.token);
        setAuthToken(data.token);
        setCurrentUser(data.user);
        
        // Notify account warnings if exists (Device Limit Warnings)
        if (data.warning) {
          addToast(data.warning, "warning");
        } else {
          addToast("Salam! Welcome back to Trade With Tayyab.", "success");
        }
        
        // Route
        if (data.user.role === "admin") {
          changeTab("admin");
        } else {
          changeTab("dashboard");
        }
        
        // Clear form
        setLoginEmail("");
        setLoginPassword("");
      } else {
        addToast(data.message || "Invalid credentials", "error");
      }
    } catch (err) {
      addToast("Login server link error", "error");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword) {
      addToast("All input prompts are required", "error");
      return;
    }
    setIsSubmitLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName, email: regEmail, password: regPassword })
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message || "Registered successfully!", "success");
        changeTab("login");
        // Clear
        setRegName("");
        setRegEmail("");
        setRegPassword("");
      } else {
        addToast(data.message || "Failed to register", "error");
      }
    } catch (err) {
      addToast("Register server network failure", "error");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleLogoutAction = () => {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Authorization": `Bearer ${authToken}` }
    }).finally(() => {
      localStorage.removeItem("tayyab_token");
      setAuthToken(null);
      setCurrentUser(null);
      setEnrolledCourseIds([]);
      setPurchasedPdfIds([]);
      setHasDeviceWarning(false);
      addToast("Logged out successfully.", "info");
      changeTab("home");
    });
  };

  const handleEnrollInitiation = (course: Course) => {
    if (!currentUser) {
      addToast("Please create an account or sign in to enroll in premium classes.", "warning");
      changeTab("login");
      return;
    }
    // Check if already enrolled
    if (enrolledCourseIds.includes(course.id)) {
      addToast("You already own this course!", "info");
      setSelectedCourse(course);
      changeTab("dashboard");
      return;
    }
    setPaymentModalProduct({ kind: "course", id: course.id, title: course.title, price: course.price });
    setPayNumber("");
  };

  // Premium PDF purchase — reuses the exact same payment modal/workflow.
  const handlePdfPurchaseInitiation = (pdf: PdfProduct) => {
    if (!currentUser) {
      addToast("Please create an account or sign in to purchase premium resources.", "warning");
      changeTab("login");
      return;
    }
    if (purchasedPdfIds.includes(pdf.id)) {
      addToast("You already own this resource!", "info");
      changeTab("dashboard");
      return;
    }
    setPaymentModalProduct({ kind: "pdf", id: pdf.id, title: pdf.title, price: pdf.price });
    setPayNumber("");
  };

  /**
   * handleBuyNow — WPay "Buy Now" button click handler.
   *
   * Flow:
   *   1. POST to /api/{courses|pdfs}/:id/enroll-wpay
   *      → backend creates a pending order in MongoDB and calls WPay /v1/Payin
   *      → backend returns { success: true, payment_url: "https://wpay.one/..." }
   *   2. Redirect the user to the WPay-hosted checkout page.
   *      WPay handles payment, then calls our /api/wpay/callback which sets
   *      order.isPaid = true and approves access.
   *
   * [DEBUG] Uncomment the console.log lines to inspect the request/response
   *         while testing against the WPay sandbox.
   */
  const submitPaymentForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalProduct) return;

    // ── Input validation ─────────────────────────────────────────────────────
    if (!payNumber.trim()) {
      addToast("Please enter your WPay wallet account number.", "error");
      return;
    }

    setIsSubmitLoading(true);

    try {
      // ── Step 1: Create order on backend and request WPay checkout URL ──────
      const resourceBase = paymentModalProduct.kind === "pdf" ? "pdfs" : "courses";
      const enrollEndpoint = `/api/${resourceBase}/${paymentModalProduct.id}/enroll-wpay`;

      // [DEBUG] Uncomment to inspect the outgoing request:
      // console.log("[WPay] Initiating payment for:", paymentModalProduct, "via", enrollEndpoint);

      const res = await fetch(enrollEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          paymentNumber: payNumber.trim(),
          paymentMethod: "WPay",
        }),
      });

      const data = await res.json();

      // [DEBUG] Uncomment to inspect the backend response:
      // console.log("[WPay] Backend response:", data);

      if (!res.ok) {
        // Handle specific error cases
        if (data?.alreadyEnrolled) {
          addToast("You already own this! Redirecting to your dashboard…", "info");
          setPaymentModalProduct(null);
          await fetchEnrollments();
          changeTab("dashboard");
          return;
        }
        addToast(data?.message || "Payment initiation failed. Please try again.", "error");
        return;
      }

      // ── Step 2: Redirect to WPay-hosted checkout page ───────────────────────
      if (data?.payment_url) {
        addToast("Redirecting you to WPay secure checkout…", "info");
        setPaymentModalProduct(null);

        // Small delay so the user sees the toast before navigation
        await new Promise((resolve) => setTimeout(resolve, 800));

        // [DEBUG] Uncomment to verify the redirect URL before navigating:
        // console.log("[WPay] Redirecting to payment_url:", data.payment_url);

        // Hard redirect to WPay-hosted payment page.
        // WPay will call /api/wpay/callback after the transaction completes.
        window.location.href = data.payment_url;
      } else {
        // Backend succeeded but returned no checkout URL — should not happen
        // in production; log and surface a user-friendly error.
        console.error("[WPay] No payment_url in backend response:", data);
        addToast("Payment gateway did not return a checkout link. Contact support.", "error");
      }

    } catch (err) {
      // [DEBUG] Uncomment to see the full error stack:
      // console.error("[WPay] Network error during payment initiation:", err);
      addToast("Network error — please check your connection and try again.", "error");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const playLessonVideo = async (courseId: string, lessonId: string) => {
    try {
      const res = await fetch(`/api/courses/${courseId}/lessons/${lessonId}/secure-play`, {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setActiveLesson({
          lessonId,
          videoUrl: data.videoUrl,
          isPreview: data.isPreviewLimit
        });
        setActiveLessonDetails({
          title: data.title,
          watermark: data.watermark,
          signedToken: data.signedToken,
          description: data.description,
          pdfUrl: data.pdfUrl,
          pdfTitle: data.pdfTitle
        });
        
        // Update back last watched on server
        fetch(`/api/progress/${courseId}/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
          },
          body: JSON.stringify({ lastWatched: lessonId })
        });
      } else {
        addToast(data.message || "Error accessing secure video", "error");
      }
    } catch (e) {
      addToast("Secure video streaming network error", "error");
    }
  };

  // Complete lesson toggle callback
  const toggleLessonCheck = async (courseId: string, lessonId: string, currentlyCompleted: boolean) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/progress/${courseId}/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ lessonId, completed: !currentlyCompleted })
      });
      if (res.ok) {
        addToast(!currentlyCompleted ? "Lesson marked as complete! Keep it up. 🚀" : "Lesson marked incomplete", "info");
        // refresh stats
        if (selectedCourse) {
          fetchProgressObj(selectedCourse.id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [activeCourseProgress, setActiveCourseProgress] = useState<string[]>([]);
  const fetchProgressObj = async (courseId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/progress/${courseId}`, {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActiveCourseProgress(data.completedLessons || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (selectedCourse && currentUser) {
      fetchProgressObj(selectedCourse.id);
    }
  }, [selectedCourse, currentUser]);

  const updateAccountSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/profile/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: settingsName,
          profileImg: settingsImg,
          newPassword: settingsPassword || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message, "success");
        setCurrentUser(data.user);
        setSettingsPassword("");
      } else {
        addToast(data.message, "error");
      }
    } catch (e) {
      addToast("Update error", "error");
    }
  };

  // Contact page form submission
  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMessage) {
      addToast("Please fill in Name, Email and Message.", "error");
      return;
    }
    addToast(`Shukriya, ${contactName}! Your support ticket is submitted. Tayyab team will contact you back via Tusharsilawat41k@gmail.com!`, "success");
    setContactName("");
    setContactEmail("");
    setContactSubject("");
    setContactMessage("");
  };

  // Custom Category Filtering
  const filteredCourses = courses.filter((c) => {
    const categoryMatches = courseCategoryFilter === "All" || c.category === courseCategoryFilter;
    const searchMatches = c.title.toLowerCase().includes(courseSearch.toLowerCase()) || 
                          c.description.toLowerCase().includes(courseSearch.toLowerCase());
    const publishMatches = c.isPublished !== false;
    return categoryMatches && searchMatches && publishMatches;
  });

  return (
    <div className="min-h-screen bg-brand-bg text-gray-100 flex flex-col font-sans relative antialiased">
      {/* Background visual graphics */}
      <div className="absolute top-0 left-0 right-0 h-[600px] bg-gradient-to-b from-[#110129] via-transparent to-transparent pointer-events-none z-0"></div>
      
      {/* Dynamic top notifications toast popup */}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
        {toasts.map((toast) => (
          <div 
            key={toast.id}
            className={`p-3.5 rounded-xl border flex items-start gap-2.5 shadow-xl backdrop-blur-md animate-in slide-in-from-right-5 duration-300 ${
              toast.type === "success" 
                ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-300"
                : toast.type === "error"
                ? "bg-rose-950/90 border-rose-500/30 text-rose-300"
                : toast.type === "warning"
                ? "bg-amber-950/90 border-amber-500/30 text-amber-300"
                : "bg-brand-bg border-white/15 text-blue-300"
            }`}
          >
            {toast.type === "success" && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />}
            {toast.type === "error" && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
            {toast.type === "warning" && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 animation-pulse" />}
            {toast.type === "info" && <Info className="w-5 h-5 text-indigo-400 shrink-0" />}
            <span className="text-xs leading-relaxed font-sans">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Corporate Header Section */}
      {activeTab !== "dashboard" && activeTab !== "admin" && (
        <Navbar 
          currentUser={currentUser} 
          onLogout={handleLogoutAction} 
          activeTab={activeTab} 
          setActiveTab={changeTab}
          onOpenCoach={() => setIsCoachOpen(true)}
          hasDeviceWarning={hasDeviceWarning}
        />
      )}

      {/* Main Body */}
      <div className="flex-1 flex flex-col relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Device Tracking warning alert at the top for all logged in students */}
        {hasDeviceWarning && currentUser && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/20 text-amber-300 flex flex-col sm:flex-row gap-3 items-center justify-between font-sans">
            <div className="flex gap-2.5 items-center">
              <AlertTriangle className="w-5 h-5 text-amber-400 animate-bounce shrink-0" />
              <div className="text-xs">
                <p className="font-bold">Caution: Multi-device connection active!</p>
                <p className="opacity-80">Our platform tracks session active fingerprints. Sharing credentials repeatedly triggers automatic locks. For security, older logons were terminated.</p>
              </div>
            </div>
            <button 
              onClick={checkActiveDevices}
              className="px-3 py-1.5 rounded-lg bg-amber-500/25 text-amber-200 border border-amber-500/40 hover:bg-amber-500/40 transition font-semibold text-[10px]"
            >
              Scan Active Devices
            </button>
          </div>
        )}

        {/* LOADING SCREEN SKELETON */}
        {loading ? (
          <div className="flex-grow flex flex-col items-center justify-center p-20 space-y-4">
            <div className="w-12 h-12 rounded-full border-t-2 border-brand-purple animate-spin"></div>
            <p className="text-xs text-gray-400 font-mono">Authenticating with Trade With Tayyab server...</p>
          </div>
        ) : (
          /* ROUTED VIEW PANELS */
          <div className="flex-grow flex flex-col">
            
            {/* 1. HOME SCREEN */}
            {activeTab === "home" && (
              <div className="space-y-16 animate-in fade-in duration-300">
                
                {/* Hero section */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center pt-8">
                  {/* Left Hero copy text */}
                  <div className="lg:col-span-7 space-y-6 text-left">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-xs text-brand-violet font-semibold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Learn. Grow. Succeed.</span>
                    </div>

                    <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.12]">
                      Learn. Grow.<br />
                      <span className="text-gradient-purple">Succeed.</span>
                    </h1>

                    <p className="text-sm text-gray-300 max-w-xl leading-relaxed">
                      Access world-class Color Trading courses designed by Tayyab. Master Big-Small pattern strategies, trend following techniques, disciplined money management, and build consistent profits with Color Trading.
                    </p>

                    <div className="flex flex-wrap gap-4 pt-2">
                      <button 
                        onClick={() => changeTab("courses")}
                        className="px-6 py-3.5 rounded-xl bg-brand-purple hover:bg-brand-violet text-white font-bold text-xs shadow-lg shadow-brand-purple/35 transition hover:scale-[1.02] cursor-pointer"
                      >
                        Explore Courses
                      </button>
                      <button 
                        onClick={() => changeTab("pricing")}
                        className="px-6 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/10 transition cursor-pointer"
                      >
                        How It Works
                      </button>
                      <a
                        href="/downloads/trade-with-tayyab.apk"
                        download="TradeWithTayyab.apk"
                        title="Download Trade With Tayyab Android App"
                        className="apk-btn group px-6 py-3.5 rounded-xl font-bold text-sm border border-brand-purple/50 bg-gradient-to-br from-brand-purple/20 via-brand-violet/10 to-transparent text-white transition-all duration-300 cursor-pointer flex items-center gap-2.5 select-none no-underline"
                      >
                        <Smartphone className="apk-icon w-4 h-4 text-brand-violet shrink-0 transition-all duration-200" />
                        <span className="flex flex-col items-start leading-none">
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-brand-violet/80 font-mono">Android App</span>
                          <span className="text-white text-sm font-extrabold tracking-wide">Download APK</span>
                        </span>
                      </a>
                    </div>

                    {/* Stat panel summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-white/5">
                      <div className="p-4 rounded-xl glass-panel text-left relative overflow-hidden group hover:border-brand-purple/30 transition-all duration-300">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-lg sm:text-2xl font-extrabold text-white leading-tight">10K+</p>
                          <div className="p-1 rounded bg-white/5 text-gray-400 group-hover:text-brand-violet transition-colors">
                            <UserCheck className="w-4 h-4" />
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 capitalize font-medium tracking-wide">Happy Students</p>
                      </div>
                      <div className="p-4 rounded-xl glass-panel text-left relative overflow-hidden group hover:border-brand-purple/30 transition-all duration-300">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-lg sm:text-2xl font-extrabold text-brand-violet leading-tight">500+</p>
                          <div className="p-1 rounded bg-brand-purple/10 text-brand-violet transition-colors">
                            <BookOpen className="w-4 h-4" />
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 capitalize font-medium tracking-wide">Academy Lectures</p>
                      </div>
                      <div className="p-4 rounded-xl glass-panel text-left relative overflow-hidden group hover:border-brand-purple/30 transition-all duration-300">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-lg sm:text-2xl font-extrabold text-brand-indigo leading-tight">50+</p>
                          <div className="p-1 rounded bg-brand-indigo/10 text-brand-indigo transition-colors">
                            <Shield className="w-4 h-4" />
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 capitalize font-medium tracking-wide">Expert Mentors</p>
                      </div>
                      <div className="p-4 rounded-xl glass-panel text-left relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-lg sm:text-2xl font-extrabold text-emerald-400 leading-tight">98%</p>
                          <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 transition-colors">
                            <TrendingUp className="w-5 h-5" />
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 capitalize font-medium tracking-wide">Success Rate</p>
                      </div>
                    </div>
                  </div>

                  {/* Right Hero block image visual */}
                  <div className="lg:col-span-12 xl:col-span-5 relative flex justify-center lg:mt-0 mt-6">
                    <div className="relative w-full max-w-sm aspect-square">
                      {/* background orb glows */}
                      <div className="absolute inset-0 bg-brand-purple/20 blur-3xl opacity-60 rounded-full animate-pulse"></div>
                      
                      {/* mockup outline */}
                      <div className="absolute -inset-1 bg-gradient-to-r from-brand-purple to-brand-indigo opacity-30 rounded-2xl blur-lg"></div>
                      
                      <div className="relative h-full w-full rounded-2xl overflow-hidden border border-white/10 bg-brand-card flex items-center justify-center p-3">
                        <img 
                          src={tradePic}
                          alt="Tayyab Mentor representation" 
                          className="h-full w-full object-cover rounded-xl border border-white/5"
                        />
                        
                        {/* Overlay glass tag floating elements */}
                        <div className="absolute bottom-6 left-6 right-6 p-3 rounded-xl glass-panel border border-white/10 flex items-center gap-3">
                          <div className="w-10 h-10 bg-brand-purple/20 rounded-lg flex items-center justify-center text-brand-violet font-bold font-sans">
                            CT
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-extrabold text-white">Tayyab Color Trading Masterclass</p>
                            <p className="text-[10px] text-gray-400">Pakistan Color Trading Expert</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* WHY CHOOSE US */}
                <div className="space-y-10">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Why Choose Trade with Tayyab?</h2>
                    <p className="text-xs text-gray-400 max-w-lg mx-auto">We offer premium syllabus content and secure custom watermarked playback streams.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-xl glass-panel glass-panel-hover flex flex-col gap-3 text-left">
                      <div className="w-10 h-10 rounded-lg bg-brand-purple/20 text-brand-violet flex items-center justify-center">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Expert Instructors</h3>
                      <p className="text-xs text-gray-400 leading-relaxed">Direct classes coached by Tayyab to learn the raw market structures bypassing confusing book indicators.</p>
                    </div>

                    <div className="p-6 rounded-xl glass-panel glass-panel-hover flex flex-col gap-3 text-left">
                      <div className="w-10 h-10 rounded-lg bg-brand-indigo/20 text-brand-indigo flex items-center justify-center">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Premium Content</h3>
                      <p className="text-xs text-gray-400 leading-relaxed">Get premium Color Trading lessons from Tayyab covering Big-Small patterns, trend analysis, and disciplined capital management with strategy PDFs.</p>
                    </div>

                    <div className="p-6 rounded-xl glass-panel glass-panel-hover flex flex-col gap-3 text-left">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-white text-base">Lifetime Access</h3>
                      <p className="text-xs text-gray-400 leading-relaxed">Once purchased via WPay secure checkout, enjoy lifetime access across your verified browser device.</p>
                    </div>
                  </div>
                </div>

                

                {/* FEATURED PDF / DIGITAL RESOURCES — HOME PAGE */}
                {pdfs.filter(p => p.isPublished !== false).length > 0 && (
                  <div className="space-y-10">
                    <div className="text-center space-y-2">
                      <span className="text-[10px] text-emerald-400 font-mono uppercase font-bold tracking-widest block">Digital Resources</span>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Premium PDFs & eBooks</h2>
                      <p className="text-xs text-gray-400 max-w-lg mx-auto font-sans">Exclusive trading eBooks, checklists and cheat sheets curated by Tayyab — instant access after WPay checkout.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {pdfs.filter(p => p.isPublished !== false).slice(0, 3).map((pdf) => {
                        const isPurchased = purchasedPdfIds.includes(pdf.id);
                        return (
                          <div
                            key={pdf.id}
                            className="rounded-xl overflow-hidden glass-panel border border-white/5 flex flex-col justify-between group h-full bg-brand-card"
                          >
                            <div className="relative aspect-video overflow-hidden">
                              <img
                                src={pdf.thumbnailUrl || "https://images.unsplash.com/photo-1554260570-9140fd3b7614?auto=format&fit=crop&w=600&q=80"}
                                alt={pdf.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute top-2.5 left-2.5 px-2 py-1 bg-black/80 backdrop-blur-md rounded text-[9px] font-bold uppercase border border-emerald-500/30 text-emerald-500">
                                📄 {pdf.category || "Resource"}
                              </div>
                            </div>

                            <div className="p-4 flex-grow flex flex-col justify-between space-y-3">
                              <div className="space-y-1.5 text-left">
                                <h3 className="font-extrabold text-white text-sm leading-snug group-hover:text-emerald-400 transition-colors">
                                  {pdf.title}
                                </h3>
                                <p className="text-[10px] text-gray-400 font-mono">By Instructor: Tayyab</p>
                                <p className="text-xs text-gray-300 leading-snug line-clamp-2">{pdf.description}</p>
                              </div>

                              <div className="space-y-3 pt-2 text-left">
                                <div className="border-t border-white/5 pt-3.5 flex items-center justify-between">
                                  <div className="text-left">
                                    <span className="text-[9px] text-gray-500 block font-mono uppercase">Price</span>
                                    <span className="text-sm font-extrabold text-amber-400 tracking-tight">
                                      {pdf.price.toLocaleString()} PKR
                                    </span>
                                  </div>

                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => { setSelectedPdf(pdf); changeTab("pdfdetails"); }}
                                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded text-[11px] font-semibold transition cursor-pointer"
                                    >
                                      Details
                                    </button>
                                    {isPurchased ? (
                                      <button
                                        onClick={() => changeTab("dashboard")}
                                        className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded text-[11px] font-bold transition cursor-pointer"
                                      >
                                        Read
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handlePdfPurchaseInitiation(pdf)}
                                        className="px-2.5 py-1 bg-brand-purple hover:bg-brand-violet text-white rounded text-[11px] font-bold transition cursor-pointer"
                                      >
                                        Buy Now
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* View all CTA */}
                    {pdfs.filter(p => p.isPublished !== false).length > 3 && (
                      <div className="text-center">
                        <button
                          onClick={() => changeTab("courses")}
                          className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/10 transition cursor-pointer"
                        >
                          View All Resources →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* POPULAR CATEGORIES */}
                <div className="space-y-10">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Our Popular Trading Disciplines</h2>
                    <p className="text-xs text-gray-400 max-w-lg mx-auto">Browse topics and filter our custom premium courses directly.</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {[
                      { name: "Color Trading", icon: Globe, count: "Big/Small Patterns" },
                      { name: "Money Management", icon: Coins, count: "Capital Staging" },
                      { name: "Pattern Strategies", icon: LineChart, count: "Entry Setups" },
                      { name: "Trading Psychology", icon: Compass, count: "Discipline" },
                      { name: "Risk Management", icon: Award, count: "Stop Rules" },
                    ].map((categ, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          setCourseCategoryFilter(categ.name);
                          changeTab("courses");
                        }}
                        className="p-5 rounded-xl glass-panel border border-white/5 hover:border-brand-purple/40 text-center flex flex-col items-center justify-center gap-3 cursor-pointer transition duration-150 group"
                      >
                        <div className="p-3 rounded-xl bg-white/5 text-gray-350 group-hover:bg-brand-purple/20 group-hover:text-brand-violet transition">
                          <categ.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">{categ.name}</p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">{categ.count}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* TESTIMONIALS */}
                <div className="space-y-10">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-white">What Pakistan Traders Say</h2>
                    <p className="text-xs text-gray-400 max-w-lg mx-auto font-sans">Real testimonies from students of the Trade with Tayyab program.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { name: "Arsalan Khan", role: "Color Trader", txt: "The way Tayyab explains the Big-Small pattern sequences is crystal clear. I applied the 3 Big / 3 Small pattern on my first week and it changed everything. The secure video platform makes learning so smooth!", stars: 5 },
                      { name: "Mehak Fatima", role: "Color Trading Student", txt: "I wasted money in other fake academies. Trade With Tayyab's Color Trading eBook and courses gave me a real system with clear rules. The WPay checkout was instant and my content unlocked immediately!", stars: 5 }
                    ].map((test, idx) => (
                      <div key={idx} className="p-5 rounded-xl glass-panel border border-white/5 space-y-3.5 text-left">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-bold text-white">{test.name}</p>
                            <p className="text-[11px] text-gray-400 font-mono">{test.role}</p>
                          </div>
                          <div className="flex gap-0.5 text-yellow-400">
                            {Array.from({ length: test.stars }).map((_, i) => (
                              <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed font-sans italic">"{test.txt}"</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* FOOTER CALL-TO-ACTION */}
                <div className="relative p-8 sm:p-12 rounded-2xl overflow-hidden text-center space-y-6 max-w-4xl mx-auto border border-brand-purple/30 bg-brand-card">
                  <div className="absolute inset-0 bg-brand-purple/10 pointer-events-none"></div>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white">Ready to Start Your Trading Journey?</h3>
                  <p className="text-xs text-gray-300 max-w-sm mx-auto">
                    Join hundreds of active Pakistani and global students executing SMC mitigations with pristine accuracy today.
                  </p>
                  <button 
                    onClick={() => changeTab("register")}
                    className="px-6 py-3 rounded-lg text-xs font-extrabold bg-brand-purple text-white hover:bg-brand-violet glow-dot-purple transition cursor-pointer"
                  >
                    Join Academy Now
                  </button>
                </div>

              </div>
            )}

            {/* 2. COURSES ENGINE SECTION */}
            {activeTab === "courses" && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
                  <div className="text-left">
                    <h1 className="text-2xl font-extrabold text-white">Our Available Courses</h1>
                    <p className="text-xs text-gray-400 mt-1">Explore our wide range of trading masterclasses coached directly by Tayyab.</p>
                  </div>

                  {/* Search bar input */}
                  <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Search courses..."
                      value={courseSearch}
                      onChange={(e) => { setCourseSearch(e.target.value); setCoursePage(1); }}
                      className="bg-brand-card border border-white/10 rounded-lg px-3.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50 w-full sm:w-60"
                    />
                    
                    <button 
                      onClick={() => { setCourseSearch(""); setCourseCategoryFilter("All"); }}
                      className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                    >
                      Reset Filter
                    </button>
                  </div>
                </div>

                {/* Categories Filter tab list */}
                <div className="flex flex-wrap gap-1.5">
                  {["All", "Color Trading", "Money Management", "Pattern Strategies", "Trading Psychology", "Risk Management"].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setCourseCategoryFilter(cat); setCoursePage(1); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold select-none cursor-pointer transition ${
                        courseCategoryFilter === cat 
                          ? "bg-brand-purple text-white" 
                          : "bg-white/5 text-gray-300 hover:bg-white/10"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Courses Listing Grid */}
                {filteredCourses.length === 0 ? (
                  <div className="p-20 text-center space-y-3 rounded-2xl glass-panel">
                    <BookOpenText className="w-10 h-10 text-gray-500 mx-auto" />
                    <p className="text-xs text-gray-400">No courses match your active filter search criteria.</p>
                    <button 
                      onClick={() => { setCourseSearch(""); setCourseCategoryFilter("All"); }} 
                      className="px-3 py-1.5 bg-brand-purple hover:bg-brand-violet text-xs rounded-lg text-white font-bold"
                    >
                      Reset Filter
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {filteredCourses.map((course) => {
                      const isPurchased = enrolledCourseIds.includes(course.id);
                      return (
                        <div 
                          key={course.id}
                          className="rounded-xl overflow-hidden glass-panel border border-white/5 flex flex-col justify-between group h-full bg-brand-card"
                        >
                          <div className="relative aspect-video overflow-hidden">
                            <img 
                              src={course.thumbnailUrl || "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=600&q=80"} 
                              alt={course.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className={`absolute top-2.5 left-2.5 px-2 py-1 bg-black/80 backdrop-blur-md rounded text-[9px] font-bold uppercase border ${
                              course.category.toLowerCase().includes("risk") || course.category.toLowerCase().includes("technical")
                                ? "border-amber-500/30 text-amber-500" 
                                : "border-emerald-500/30 text-emerald-500"
                            }`}>
                              📈 {course.category}
                            </div>
                          </div>

                          <div className="p-4 flex-grow flex flex-col justify-between space-y-3">
                            <div className="space-y-1.5 text-left">
                              <h3 className="font-extrabold text-[#ffffff] text-sm leading-snug group-hover:text-emerald-400 transition-colors">
                                {course.title}
                              </h3>
                              <p className="text-[10px] text-gray-400 font-mono">By Instructor: {course.instructor}</p>
                              <p className="text-xs text-gray-300 leading-snug line-clamp-2">{course.description}</p>
                            </div>

                            <div className="space-y-3 pt-2 text-left">
                              {/* Ratings & reviews */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-emerald-300">★ {course.rating}</span>
                                <span className="text-[10px] text-gray-400">({course.reviewsCount} assessments)</span>
                              </div>

                              <div className="border-t border-white/5 pt-3.5 flex items-center justify-between">
                                <div className="text-left">
                                  <span className="text-[9px] text-gray-550 block font-mono uppercase">Course Fee</span>
                                  <span className="text-base font-extrabold text-amber-400 tracking-tight">
                                    {course.price.toLocaleString()} PKR
                                  </span>
                                </div>

                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => { setSelectedCourse(course); changeTab("details"); }}
                                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                                  >
                                    Syllabus
                                  </button>
                                  {isPurchased ? (
                                    <button
                                      onClick={() => { setSelectedCourse(course); changeTab("dashboard"); }}
                                      className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition cursor-pointer"
                                    >
                                      Watch
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleEnrollInitiation(course)}
                                      className="px-3.5 py-1.5 bg-brand-purple hover:bg-brand-violet text-white rounded-lg text-xs font-bold transition cursor-pointer"
                                    >
                                      Buy Now
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* PREMIUM PDF / DIGITAL RESOURCES MARKETPLACE */}
                {pdfs.filter(p => p.isPublished !== false).length > 0 && (
                  <div className="space-y-6 pt-6 border-t border-white/5">
                    <div className="text-left">
                      <h1 className="text-2xl font-extrabold text-white">Premium PDFs & Digital Resources</h1>
                      <p className="text-xs text-gray-400 mt-1">Purchase exclusive trading eBooks, checklists and cheat sheets curated by Tayyab.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {pdfs.filter(p => p.isPublished !== false).map((pdf) => {
                        const isPurchased = purchasedPdfIds.includes(pdf.id);
                        return (
                          <div
                            key={pdf.id}
                            className="rounded-xl overflow-hidden glass-panel border border-white/5 flex flex-col justify-between group h-full bg-brand-card"
                          >
                            <div className="relative aspect-video overflow-hidden">
                              <img
                                src={pdf.thumbnailUrl || "https://images.unsplash.com/photo-1554260570-9140fd3b7614?auto=format&fit=crop&w=600&q=80"}
                                alt={pdf.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute top-2.5 left-2.5 px-2 py-1 bg-black/80 backdrop-blur-md rounded text-[9px] font-bold uppercase border border-emerald-500/30 text-emerald-500">
                                📄 {pdf.category || "Resource"}
                              </div>
                            </div>

                            <div className="p-4 flex-grow flex flex-col justify-between space-y-3">
                              <div className="space-y-1.5 text-left">
                                <h3 className="font-extrabold text-[#ffffff] text-sm leading-snug group-hover:text-emerald-400 transition-colors">
                                  {pdf.title}
                                </h3>
                                <p className="text-[10px] text-gray-400 font-mono">By Instructor: Tayyab</p>
                                <p className="text-xs text-gray-300 leading-snug line-clamp-2">{pdf.description}</p>
                              </div>

                              <div className="space-y-3 pt-2 text-left">
                                <div className="border-t border-white/5 pt-3.5 flex items-center justify-between">
                                  <div className="text-left">
                                    <span className="text-[9px] text-gray-550 block font-mono uppercase">Price</span>
                                    <span className="text-base font-extrabold text-amber-400 tracking-tight">
                                      {pdf.price.toLocaleString()} PKR
                                    </span>
                                  </div>

                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => { setSelectedPdf(pdf); changeTab("pdfdetails"); }}
                                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                                    >
                                      Details
                                    </button>
                                    {isPurchased ? (
                                      <button
                                        onClick={() => changeTab("dashboard")}
                                        className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition cursor-pointer"
                                      >
                                        Read
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handlePdfPurchaseInitiation(pdf)}
                                        className="px-3.5 py-1.5 bg-brand-purple hover:bg-brand-violet text-white rounded-lg text-xs font-bold transition cursor-pointer"
                                      >
                                        Buy Now
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. COURSE SYLLABUS DETAILS PANEL */}
            {activeTab === "details" && selectedCourse && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300">
                {/* Left pane: course image / info */}
                <div className="lg:col-span-8 space-y-6 text-left">
                  <button 
                    onClick={() => changeTab("courses")}
                    className="text-xs text-brand-violet hover:text-white flex items-center gap-1.5 font-mono uppercase cursor-pointer"
                  >
                    ← Back to Course Listing
                  </button>

                  <div className="space-y-4">
                    <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase border ${
                      selectedCourse.category.toLowerCase().includes("risk") || selectedCourse.category.toLowerCase().includes("technical")
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/25" 
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                    }`}>
                      📈 {selectedCourse.category}
                    </span>
                    <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">
                      {selectedCourse.title}
                    </h1>
                    <p className="text-gray-350 text-xs leading-relaxed whitespace-pre-line font-sans">
                      {selectedCourse.description}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl glass-panel space-y-4">
                    <h2 className="text-xs font-extrabold text-white tracking-wider uppercase font-mono border-b border-white/5 pb-2">Meet Your Instructor</h2>
                    <div className="flex gap-4 items-center">
                      <div className="w-12 h-12 bg-black rounded-xl overflow-hidden border border-brand-purple/40 shrink-0">
                        <img 
                          src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80" 
                          alt="Tayyab"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-white font-bold font-sans text-xs">Tayyab • Pakistan Trading Mentor</p>
                        <p className="text-[11px] text-gray-405">Color Trading Expert with 5+ years of trading experience in Big/Small pattern strategies.</p>
                      </div>
                    </div>
                  </div>

                  {/* Syllabus / Lessons list */}
                  <div className="space-y-4">
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <BookOpenText className="w-5 h-5 text-brand-violet" />
                      <span>Syllabus Curriculum</span>
                    </h2>

                    <div className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
                      {selectedCourse.lessons.map((lesson, index) => (
                        <div key={lesson.id} className="p-4 bg-brand-card/50 hover:bg-brand-card transition flex items-center justify-between gap-3 text-left">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-white/5 text-gray-400 font-mono text-xs flex items-center justify-center font-bold">
                              {index + 1}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white">{lesson.title}</p>
                              <p className="text-[10px] text-gray-500 font-mono">Module Duration: {lesson.duration}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {lesson.isPreview ? (
                              <span className="px-2 py-0.5 rounded text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase">
                                Free Preview
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[8px] bg-white/5 text-gray-400 font-mono uppercase">
                                Locked
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right side: payment box widget */}
                <div className="lg:col-span-4 rounded-2xl glass-panel border border-white/10 p-5 space-y-5 text-left sticky top-24">
                  <div className="aspect-video rounded-xl overflow-hidden border border-white/10 relative">
                    <img src={selectedCourse.thumbnailUrl} alt={selectedCourse.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="p-3 bg-brand-purple/80 hover:bg-brand-violet text-white rounded-full cursor-pointer transition">
                        <Play className="w-6 h-6 fill-white" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-gray-450 font-mono uppercase tracking-widest block font-bold">Complete Course Access Plan</p>
                    <p className="text-2xl font-extrabold text-amber-400 tracking-tight leading-none font-mono">
                      {selectedCourse.price.toLocaleString()} PKR
                    </p>
                  </div>

                  <ul className="text-xs text-gray-300 space-y-2 pb-2 border-b border-white/5">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Full watermarked video player access</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>SMC cheat sheet PDF download access</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Lifetime verification browser logons</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Smart Gemini coach helper tool in modal</span>
                    </li>
                  </ul>

                  {enrolledCourseIds.includes(selectedCourse.id) ? (
                    <button
                      onClick={() => changeTab("dashboard")}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs tracking-wide transition cursor-pointer"
                    >
                      Open in Student Dashboard
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEnrollInitiation(selectedCourse)}
                      className="w-full py-3 rounded-xl bg-brand-purple hover:bg-brand-violet text-white font-bold text-xs tracking-wide transition glow-dot-purple cursor-pointer"
                    >
                      Buy Now via WPay
                    </button>
                  )}
                  
                  <p className="text-[10px] text-gray-500 text-center font-mono leading-relaxed">
                    Payments processed securely via WPay gateway. EasyPaisa & JazzCash supported through WPay.
                  </p>
                </div>
              </div>
            )}

            {/* 3b. PDF / DIGITAL RESOURCE DETAILS PANEL */}
            {activeTab === "pdfdetails" && selectedPdf && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300">
                {/* Left pane: pdf info + preview */}
                <div className="lg:col-span-8 space-y-6 text-left">
                  <button
                    onClick={() => changeTab("courses")}
                    className="text-xs text-brand-violet hover:text-white flex items-center gap-1.5 font-mono uppercase cursor-pointer"
                  >
                    ← Back to Listing
                  </button>

                  <div className="space-y-4">
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                      📄 {selectedPdf.category || "Digital Resource"}
                    </span>
                    <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">
                      {selectedPdf.title}
                    </h1>
                    <p className="text-gray-350 text-xs leading-relaxed whitespace-pre-line font-sans">
                      {selectedPdf.description}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl glass-panel space-y-4">
                    <h2 className="text-xs font-extrabold text-white tracking-wider uppercase font-mono border-b border-white/5 pb-2">Meet Your Instructor</h2>
                    <div className="flex gap-4 items-center">
                      <div className="w-12 h-12 bg-black rounded-xl overflow-hidden border border-brand-purple/40 shrink-0">
                        <img
                          src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"
                          alt="Tayyab"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-white font-bold font-sans text-xs">Tayyab • Pakistan Trading Mentor</p>
                        <p className="text-[11px] text-gray-405">Color Trading Expert with 5+ years of trading experience in Big/Small pattern strategies.</p>
                      </div>
                    </div>
                  </div>

                  {/* Preview pages */}
                  <div className="space-y-4">
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <BookOpenText className="w-5 h-5 text-brand-violet" />
                      <span>Document Preview</span>
                    </h2>

                    {selectedPdf.previewUrl ? (
                      <div className="rounded-xl border border-white/5 overflow-hidden bg-[#1e2330] aspect-[4/3]">
                        <iframe
                          src={`${selectedPdf.previewUrl}#toolbar=0&navpanes=0`}
                          className="w-full h-full border-none"
                          title="PDF Preview"
                        />
                      </div>
                    ) : (
                      <div className="p-10 rounded-xl border border-white/5 bg-brand-card/50 text-center space-y-2">
                        <Lock className="w-8 h-8 text-gray-500 mx-auto" />
                        <p className="text-xs text-gray-400">No free preview available. Purchase to unlock the full secure document.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: purchase box widget */}
                <div className="lg:col-span-4 rounded-2xl glass-panel border border-white/10 p-5 space-y-5 text-left sticky top-24">
                  <div className="aspect-video rounded-xl overflow-hidden border border-white/10 relative">
                    <img src={selectedPdf.thumbnailUrl} alt={selectedPdf.title} className="w-full h-full object-cover" />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-gray-450 font-mono uppercase tracking-widest block font-bold">Premium Resource Access</p>
                    <p className="text-2xl font-extrabold text-amber-400 tracking-tight leading-none font-mono">
                      {selectedPdf.price.toLocaleString()} PKR
                    </p>
                  </div>

                  <ul className="text-xs text-gray-300 space-y-2 pb-2 border-b border-white/5">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Full secure watermarked PDF access</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Read instantly in your dashboard</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Lifetime verification browser logons</span>
                    </li>
                  </ul>

                  {purchasedPdfIds.includes(selectedPdf.id) ? (
                    <button
                      onClick={() => changeTab("dashboard")}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs tracking-wide transition cursor-pointer"
                    >
                      Open in Student Dashboard
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePdfPurchaseInitiation(selectedPdf)}
                      className="w-full py-3 rounded-xl bg-brand-purple hover:bg-brand-violet text-white font-bold text-xs tracking-wide transition glow-dot-purple cursor-pointer"
                    >
                      Buy Now via WPay
                    </button>
                  )}

                  <p className="text-[10px] text-gray-500 text-center font-mono leading-relaxed">
                    Payments processed securely via WPay gateway. EasyPaisa & JazzCash supported through WPay.
                  </p>
                </div>
              </div>
            )}

            {/* 4. ABOUT US PAGE */}
            {activeTab === "about" && (
              <div className="space-y-12 animate-in fade-in duration-300 text-left max-w-4xl mx-auto py-4">
                <div className="space-y-4">
                  <h1 className="text-3xl font-extrabold text-white font-sans leading-tight">Empowering Learners Worldwide</h1>
                  <p className="text-xs text-gray-300 leading-relaxed font-sans">
                    Trade With Tayyab was founded with a unified mission: to bridge the gap between retail market confusion and smart institutional concepts like SMC (Smart Money Concepts). We believe in practical rules, real trading statistics, and strict risk controls.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
                  <div className="p-5 rounded-xl glass-panel space-y-2">
                    <h3 className="font-bold text-white text-xs uppercase font-mono text-brand-purple">Our Mission</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">To strip away indicators like trendlines or RSI divergences that trap retail volume, and instead educate students on market sweeps, discount zones, and true market microstructures.</p>
                  </div>
                  <div className="p-5 rounded-xl glass-panel space-y-2">
                    <h3 className="font-bold text-white text-xs uppercase font-mono text-brand-indigo">Our Vision</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">To become Pakistan's #1 trusted authority on Forex, Crypto day-trading and Stocks price action analysis by leveraging secure watermarked learning products.</p>
                  </div>
                </div>

                {/* Team Grid */}
                <div className="space-y-6 pt-4">
                  <h2 className="text-lg font-extrabold text-[#ffffff] border-b border-white/5 pb-2">Meet Our Lead Instructors</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {[
                      { name: "Tayyab Mentor", role: "Founder & SMC Mentor", img: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80" },
                      { name: "Tushar Silawat", role: "Developer, Tech Partner & Co-Founder", img: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80" },
                    ].map((member, idx) => (
                      <div key={idx} className="p-4 rounded-xl glass-panel border border-white/5 text-center space-y-3">
                        <img src={member.img} alt={member.name} className="w-16 h-16 rounded-full border-2 border-brand-purple/45 mx-auto object-cover" />
                        <div>
                          <p className="text-xs font-bold text-white">{member.name}</p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">{member.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 5. CONTACT US PAGE */}
            {activeTab === "contact" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300 max-w-4xl mx-auto py-4">
                
                {/* Left contact card info */}
                <div className="lg:col-span-4 space-y-6 text-left font-sans">
                  <div className="space-y-1.5">
                    <h1 className="text-2xl font-extrabold text-white">Get in Touch</h1>
                    <p className="text-xs text-gray-400 leading-relaxed">Have questions about our Color Trading curriculum or payment via WPay? Reach out directly via Pakistan channels.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 rounded-xl glass-panel border border-white/5">
                      <span className="block text-[10px] text-gray-500 font-mono uppercase mb-1 font-bold">E-Mail Address</span>
                      <span className="text-xs text-white font-semibold select-all font-mono">Tusharsilawat41k@gmail.com</span>
                    </div>

                    <div className="p-4 rounded-xl glass-panel border border-white/5">
                      <span className="block text-[10px] text-gray-500 font-mono uppercase mb-1 font-bold">WhatsApp / Call</span>
                      <span className="text-xs text-white font-semibold select-all font-mono">03169820955</span>
                    </div>

                    <div className="p-4 rounded-xl glass-panel border border-white/5">
                      <span className="block text-[10px] text-gray-500 font-mono uppercase mb-1 font-bold">Mock Address Map Location</span>
                      <span className="text-xs text-gray-300">Phase 6, DHA Lahore, Punjab, Pakistan</span>
                    </div>
                  </div>
                </div>

                {/* Right Form column */}
                <div className="lg:col-span-8 p-6 rounded-2xl glass-panel border border-white/5 space-y-5 text-left font-sans">
                  <h2 className="text-xs font-extrabold text-white uppercase font-mono tracking-wider">Send Us a Message</h2>
                  
                  <form onSubmit={handleContactSubmit} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-gray-400">Your Name</label>
                        <input
                          type="text"
                          required
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          placeholder="e.g., Ali Raza"
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-gray-400">Your Email</label>
                        <input
                          type="email"
                          required
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          placeholder="ali@gmail.com"
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-gray-400">Topic Subject</label>
                      <input
                        type="text"
                        value={contactSubject}
                        onChange={(e) => setContactSubject(e.target.value)}
                        placeholder="Enrollment Help / Business Queries"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                      />
                    </div>

                    <div className="space-y-1.5 align-top">
                      <label className="text-[10px] uppercase font-bold text-gray-400">Your message</label>
                      <textarea
                        required
                        rows={4}
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        placeholder="Detail your request..."
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                      />
                    </div>

                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-brand-purple hover:bg-brand-violet text-white text-xs font-bold rounded-lg transition overflow-hidden shadow-md shadow-brand-purple/20 cursor-pointer"
                    >
                      Send Message
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* 6. PRICING PLANS SCREEN */}
            {activeTab === "pricing" && (
              <div className="space-y-10 animate-in fade-in duration-300 text-center py-4">
                <div className="space-y-2">
                  <h1 className="text-3xl font-extrabold text-white">Choose Your Training Plan</h1>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto">One-time payments. Lifetime academy access, subject to browser session rules in Pakistan.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto font-sans">
                  {[
                    { title: "Basic Pack", price: 1999, desc: "Access to 1 chosen Forex course, premium notes, community forum.", benefits: ["Access to 1 Course", "Standard Video Quality", "SMC Cheat Sheet", "Email Support Account"] },
                    { title: "Premium Master", price: 3999, desc: "Full access to Forex and Crypto scale courses, plus watermarked resources.", benefits: ["Access to 2 Courses", "HD streaming watermarking", "All resources & PDF guides", "Weekly group webinars"], highlight: true },
                    { title: "Ultimate Academy", price: 5999, desc: "Total infinite access. Unlocked for all present & future trade series.", benefits: ["All 3 Premium Courses", "Priority Webinar checks", "Direct access to AI coach in app", "One-to-one WhatsApp reviews"] },
                  ].map((plan, idx) => (
                    <div 
                      key={idx} 
                      className={`p-6 rounded-xl glass-panel text-left flex flex-col justify-between relative ${
                        plan.highlight ? "border-brand-purple/70 bg-brand-card/90 glass-card-glow" : "border-white/5 bg-brand-card/25"
                      }`}
                    >
                      {plan.highlight && (
                        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded text-[8px] bg-brand-purple text-white font-extrabold uppercase tracking-wide">
                          Most Popular
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <h3 className="font-extrabold text-white text-base">{plan.title}</h3>
                          <p className="text-xs text-gray-400 mt-1 leading-normal">{plan.desc}</p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-gray-500 uppercase font-mono block font-bold">One-time paymentFee</span>
                          <span className="text-2xl font-extrabold text-white tracking-tight font-mono">
                            {plan.price.toLocaleString()} PKR
                          </span>
                        </div>

                        <ul className="text-xs text-gray-300 space-y-2.5 pt-2 border-t border-white/5">
                          {plan.benefits.map((ben, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <Check className="w-3.5 h-3.5 text-brand-purple shrink-0" />
                              <span>{ben}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="pt-6">
                        <button
                          onClick={() => {
                            if (!currentUser) {
                              addToast("Please register or sign in to opt in for pricing plans", "warning");
                              changeTab("login");
                              return;
                            }
                            addToast(`To setup package "${plan.title}", select individual class in the Course segment!`, "info");
                            changeTab("courses");
                          }}
                          className={`w-full py-2.5 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                            plan.highlight 
                              ? "bg-brand-purple hover:bg-brand-violet text-white glow-dot-purple" 
                              : "bg-white/5 hover:bg-white/10 text-gray-300"
                          }`}
                        >
                          Choose {plan.title.split(" ")[0]}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* FAQ SECTION */}
                <div className="max-w-xl mx-auto space-y-6 pt-10 text-left font-sans">
                  <h2 className="text-lg font-extrabold text-white text-center border-b border-white/5 pb-2">Frequently Asked Questions</h2>
                  
                  {[
                    { q: "Is this a one-time fee?", a: "Yes, once approved, your payment unlocks your course for lifetime with no Monthly subscription demands!" },
                    { q: "How does verification device security work?", a: "To safeguard Trade With Tayyab rights, accounts are pinned. Multiple concurrent IP/Logon checks triggers automatic logging out alerts so do not share access." },
                    { q: "Can I watch videos on mobile?", a: "Yes, our web video player is completely responsive on all smartphone sizes." }
                  ].map((faq, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-brand-card/40 border border-white/5 space-y-1.5 animate-none">
                      <p className="text-xs font-bold text-white flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4 text-brand-purple shrink-0" />
                        <span>{faq.q}</span>
                      </p>
                      <p className="text-xs text-gray-400 leading-relaxed pl-5">{faq.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. STUDENT DASHBOARD */}
            {activeTab === "dashboard" && (
              <StudentPanel
                currentUser={currentUser}
                courses={courses}
                pdfs={pdfs}
                enrolledCourseIds={enrolledCourseIds}
                purchasedPdfIds={purchasedPdfIds}
                authToken={authToken}
                addToast={addToast}
                onLogout={handleLogoutAction}
                selectedCourse={selectedCourse}
                setSelectedCourse={setSelectedCourse}
                activeLesson={activeLesson}
                setActiveLesson={setActiveLesson}
                activeLessonDetails={activeLessonDetails}
                setActiveLessonDetails={setActiveLessonDetails}
                playLessonVideo={playLessonVideo}
                toggleLessonCheck={toggleLessonCheck}
                activeCourseProgress={activeCourseProgress}
                fetchProgressObj={fetchProgressObj}
                settingsName={settingsName}
                setSettingsName={setSettingsName}
                settingsImg={settingsImg}
                setSettingsImg={setSettingsImg}
                settingsPassword={settingsPassword}
                setSettingsPassword={setSettingsPassword}
                updateAccountSettings={updateAccountSettings}
                changeTab={changeTab}
              />
            )}

            {/* 8. ADMIN CONTROL PANEL */}
            {activeTab === "admin" && currentUser?.role === "admin" && (
              <AdminPanel
                currentUser={currentUser}
                courses={courses}
                pdfs={pdfs}
                fetchPdfs={fetchPdfs}
                adminStats={adminStats}
                adminUsers={adminUsers}
                adminOrders={adminOrders}
                suspiciousLogins={suspiciousLogins}
                onLogout={handleLogoutAction}
                addToast={addToast}
                authToken={authToken}
                fetchCourses={fetchCourses}
                fetchAdminMetrics={fetchAdminMetrics}
              />
            )}

            {/* 9. SIGN IN SCREEN */}
            {activeTab === "login" && (
              <div className="max-w-md w-full mx-auto p-6 sm:p-8 rounded-2xl glass-panel border border-brand-purple/20 text-left space-y-6 my-10 animate-in fade-in duration-300 font-sans">
                <div className="space-y-1.5 text-center">
                  <h1 className="text-2xl font-extrabold text-white">Join the Trade Desk</h1>
                  <p className="text-xs text-gray-400 leading-relaxed">Sign in to play secure 1080p recorded learning modules.</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] uppercase font-bold text-gray-400">Email Address</label>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="ali@trade.com"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                    />
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] uppercase font-bold text-gray-400">Your Password</label>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitLoading}
                    className="w-full py-3 bg-brand-purple hover:bg-brand-violet text-white font-bold text-xs rounded-xl tracking-wide transition glow-dot-purple disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitLoading ? "Accessing Secure Node..." : "Login to Student Console"}
                  </button>
                </form>

                <div className="space-y-3.5 pt-4 border-t border-white/5 text-center text-xs">
                  <p className="text-gray-450">
                    Don't have an academy account?{" "}
                    <button onClick={() => changeTab("register")} className="text-brand-violet font-semibold hover:underline cursor-pointer">
                      Register Now
                    </button>
                  </p>
                  
                  {/* Mock accounts list for immediate sandbox preview */}
                  <div className="p-3.5 bg-brand-purple/5 border border-brand-purple/20 text-brand-purple rounded-lg space-y-1.5 text-left font-sans">
                    <span className="block text-[10px] uppercase font-extrabold tracking-widest text-[#a78bfa]">Sandbox Accounts for immediate testing:</span>
                    <div className="text-[11px] space-y-1 text-gray-300 font-sans">
                      <p>🛡️ **Admin Log:** <span className="select-all font-mono">Tusharsilawat41k@gmail.com</span> | Pwd: <span className="select-all font-mono">admin123</span></p>
                      <p>📚 **Student Log:** <span className="select-all font-mono">tayyab@trade.com</span> | Pwd: <span className="select-all font-mono">tayyab123</span> *(SMC course owned!)*</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 10. REGISTER SCREEN */}
            {activeTab === "register" && (
              <div className="max-w-md w-full mx-auto p-6 sm:p-8 rounded-2xl glass-panel border border-brand-purple/20 text-left space-y-6 my-10 animate-in fade-in duration-300 font-sans">
                <div className="space-y-1.5 text-center">
                  <h1 className="text-2xl font-extrabold text-white">Create Academy Account</h1>
                  <p className="text-xs text-gray-400">Unlock your Forex knowledge paths right now.</p>
                </div>

                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400">Full Name</label>
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="e.g. Ali Raza"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400">Email Address</label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="ali@gmail.com"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400">Password</label>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitLoading}
                    className="w-full py-3 bg-brand-purple hover:bg-brand-violet text-white font-bold text-xs rounded-xl tracking-wide transition glow-dot-purple disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitLoading ? "Creating account..." : "Submit Registration"}
                  </button>
                </form>

                <p className="text-center text-xs text-gray-450 pt-3 border-t border-white/5">
                  Already have an account?{" "}
                  <button onClick={() => changeTab("login")} className="text-brand-violet font-semibold hover:underline cursor-pointer">
                    Log in
                  </button>
                </p>
              </div>
            )}

            {/* 11. PRIVACY RULES POLICY PAGE */}
            {activeTab === "privacy" && (
              <div className="max-w-2xl mx-auto p-6 rounded-2xl glass-panel text-left space-y-4 my-6 animate-in fade-in duration-300 font-sans leading-relaxed">
                <h1 className="text-2xl font-extrabold text-white">Privacy Protection Rules</h1>
                <p className="text-xs text-gray-400 font-mono">Last modified: June 16, 2026</p>
                <p className="text-xs text-gray-300 font-sans">
                  Trade With Tayyab values absolute academic integrity. This Privacy statement details how session tracking cookies and hardware fingerprint metadata are captured:
                </p>
                <div className="space-y-2 text-xs text-gray-400">
                  <p className="font-bold text-white">1. Encryption and Devices Fingerprint Data</p>
                  <p>Our servers monitor User-Agent browser logs, location parameters, and concurrent IP tracks to verify account logon rules. Access is constrained to valid purchased accounts.</p>
                  <p className="font-bold text-white">2. Video Player Watermarking Logs</p>
                  <p>Our secure system embeds personal signatures overlaying your registered Email during active streams. This prevents unauthorized content recording on other channels.</p>
                </div>
              </div>
            )}

            {/* 12. TERMS AND CONDITIONS PAGE */}
            {activeTab === "terms" && (
              <div className="max-w-2xl mx-auto p-6 rounded-2xl glass-panel text-left space-y-4 my-6 animate-in fade-in duration-300 font-sans leading-relaxed">
                <h1 className="text-2xl font-extrabold text-white">Academy Terms & Conditions</h1>
                <p className="text-xs text-gray-400 font-mono">Last modified: June 16, 2026</p>
                <p className="text-xs text-gray-300">
                  By joining the Trade With Tayyab Academy, users consent strictly to the following parameters:
                </p>
                <div className="space-y-2 text-xs text-gray-400">
                  <p className="font-bold text-white">1. Anti-credential sharing restrictions</p>
                  <p>You may not share student login credentials. If our device logs spot concurrent active views, our server terminates active logons automatically to prevent malicious leaking.</p>
                  <p className="font-bold text-white">2. Video download block acknowledgment</p>
                  <p>The lessons remain copyrighted materials for Trade With Tayyab. Use of unauthorized recording widgets or downloads bypass scripts triggers immediate account suspensions.</p>
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      {/* WPAY PAYMENT MODAL */}
      {paymentModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans">
          <div className="relative w-full max-w-md bg-brand-card rounded-2xl border border-brand-purple/30 p-6 space-y-5 text-left text-xs">
            <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center justify-between">
              <span>Complete Your Purchase</span>
              <span className="text-[9px] bg-brand-purple/20 text-brand-purple px-1.5 py-0.5 rounded border border-brand-purple/30 font-bold tracking-wide uppercase">
                WPay Secure Gateway
              </span>
            </h3>
            
            <p className="text-gray-400">
              You are purchasing <span className="text-white font-semibold">"{paymentModalProduct.title}"</span> for <span className="text-amber-400 font-bold font-mono">{paymentModalProduct.price.toLocaleString()} PKR</span>.
            </p>

            <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-[10px] uppercase font-extrabold font-mono text-emerald-400">
                <Shield className="w-3.5 h-3.5" />
                <span>WPay Secure Checkout</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                You will be charged via your WPay wallet. EasyPaisa and JazzCash account holders can also pay through the WPay gateway. Enter your WPay wallet number below to proceed.
              </p>
            </div>

            <form onSubmit={submitPaymentForm} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] uppercase font-bold text-gray-400 block pb-0.5">
                  Your WPay Wallet / Account Number
                </label>
                <input
                  type="text"
                  required
                  value={payNumber}
                  onChange={(e) => setPayNumber(e.target.value)}
                  placeholder="e.g. 03xxxxxxxxx"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50 font-mono text-xs"
                />
                <p className="text-[10px] text-gray-500 font-mono">EasyPaisa / JazzCash users: enter your registered mobile number</p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalProduct(null)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-purple hover:bg-brand-violet text-white rounded-lg font-bold glow-dot-purple cursor-pointer"
                >
                  Pay via WPay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Corporate Footer Section */}
      {activeTab !== "dashboard" && activeTab !== "admin" && (
        <Footer setActiveTab={changeTab} />
      )}

      {/* Floating Smart Gemini Expert coach modal widget */}
      <AICoachModal 
        isOpen={isCoachOpen}
        onClose={() => setIsCoachOpen(false)}
        token={authToken}
      />
    </div>
  );
}
