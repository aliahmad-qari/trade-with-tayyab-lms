import { useEffect, useState } from "react";
import { Download, X, Sparkles } from "lucide-react";

/**
 * In-app update prompt for the sideloaded Android APK.
 *
 * The Capacitor WebView ships a frozen copy of the web bundle, so installed
 * apps never see website changes until a new APK is sideloaded. This component
 * polls a small static manifest on the website and, when a newer build exists,
 * shows a non-intrusive banner whose button hands the APK URL to the OS browser
 * (`window.open(url, "_system")`) — Capacitor routes `_system` targets to the
 * native browser / download manager instead of the in-app WebView.
 *
 * Per release, keep these three in lockstep:
 *   1. `versionCode` in android/app/build.gradle
 *   2. `CURRENT_VERSION_CODE` below (the code THIS bundle was built with)
 *   3. `versionCode` in the hosted apk-version.json
 */

/** versionCode this bundle was built with — bump on every release. */
const CURRENT_VERSION_CODE = 5;

/** Static manifest + APK live on the website (Vercel), NOT the /api backend. */
const VERSION_MANIFEST_URL = "https://tradewithtayyab.tech/apk-version.json";
const APK_DOWNLOAD_URL = "https://tradewithtayyab.tech/app-release.apk";

interface ApkManifest {
  versionCode: number;
  versionName?: string;
}

/** Native-only detection, mirrors isNativePlatform() in src/lib/api.ts. */
function isNativePlatform(): boolean {
  const cap = (typeof window !== "undefined"
    ? (window as any).Capacitor
    : undefined) as { isNativePlatform?: () => boolean; platform?: string } | undefined;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
  return cap.platform != null && cap.platform !== "web";
}

export default function UpdateChecker() {
  const [manifest, setManifest] = useState<ApkManifest | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only the native app can be stale; the web build is always current.
    if (!isNativePlatform()) return;

    const controller = new AbortController();

    // Cache-bust so a CDN never pins users to an old manifest.
    fetch(`${VERSION_MANIFEST_URL}?t=${Date.now()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: ApkManifest) => {
        if (typeof data?.versionCode === "number" && data.versionCode > CURRENT_VERSION_CODE) {
          setManifest(data);
        }
      })
      .catch(() => {
        /* offline / manifest missing — fail silently, never block the app */
      });

    return () => controller.abort();
  }, []);

  if (!manifest || dismissed) return null;

  const handleDownload = async () => {
    // Guard against the "downloads index.html" trap: if the APK path is missing,
    // Vercel's SPA catch-all serves index.html (Content-Type text/html) instead
    // of a 404. Verify it's really an APK before handing off to the OS.
    try {
      const head = await fetch(APK_DOWNLOAD_URL, { method: "HEAD" });
      const type = head.headers.get("content-type") ?? "";
      console.log("[UpdateChecker] APK URL:", APK_DOWNLOAD_URL);
      console.log("[UpdateChecker] status:", head.status, "content-type:", type);

      if (!head.ok || type.includes("text/html")) {
        // Wrong file (HTML) or missing — don't download the homepage as an .apk.
        console.error("[UpdateChecker] APK not served correctly — aborting download.");
        window.alert("Update file is unavailable right now. Please try again later.");
        return;
      }
    } catch (err) {
      // Network/HEAD failure: log, then fall through and still attempt the open
      // so a flaky HEAD doesn't block a genuinely-present file.
      console.warn("[UpdateChecker] HEAD check failed, attempting download anyway:", err);
    }

    // Capacitor intercepts the "_system" target and opens the URL outside the
    // WebView, so the OS handles the .apk download + install prompt.
    window.open(APK_DOWNLOAD_URL, "_system");
  };

  return (
    <div className="fixed bottom-4 inset-x-4 z-[60] max-w-md mx-auto animate-in slide-in-from-bottom-5 duration-300">
      <div className="p-4 rounded-2xl border border-brand-purple/30 bg-brand-bg/95 backdrop-blur-md shadow-2xl flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-purple/15 border border-brand-purple/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-brand-violet" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-100 leading-tight">
            Update available
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            {manifest.versionName
              ? `Version ${manifest.versionName} is ready to install.`
              : "A newer version is ready to install."}
          </p>
        </div>

        <button
          onClick={handleDownload}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-purple text-white text-xs font-semibold hover:bg-brand-purple/90 transition-colors"
        >
          <Download className="w-4 h-4" />
          Update
        </button>

        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss update notification"
          className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
