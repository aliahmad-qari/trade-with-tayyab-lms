/**
 * Centralized API base URL.
 *
 * - On the **web** build the value is an empty string, so calls stay relative
 *   (`/api/...`) and are rewritten to the backend by `frontend/vercel.json`
 *   in production and by the Vite dev proxy locally.
 * - On the **native** mobile app (Capacitor Android/iOS) the WebView loads the
 *   bundle from a `https://localhost` / `file://` origin that has no server to
 *   resolve `/api/...`, which produced the "Login server link error". There we
 *   point at the absolute production backend instead.
 * - `VITE_API_URL` overrides both when set (useful for staging builds).
 *
 * Native detection reads the global `window.Capacitor` that the native runtime
 * injects into the WebView, so the web bundle needs no @capacitor/core import.
 */
const PROD_API = "https://trade-with-tayyab-lms.onrender.com";

function isNativePlatform(): boolean {
  const cap = (typeof window !== "undefined"
    ? (window as any).Capacitor
    : undefined) as { isNativePlatform?: () => boolean; platform?: string } | undefined;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
  return cap.platform != null && cap.platform !== "web";
}

const envBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

export const BASE_API_URL: string =
  envBase ?? (isNativePlatform() ? PROD_API : "");

/**
 * Drop-in replacement for `fetch` that prefixes the API base URL.
 * Pass an app-relative path beginning with `/api/...`.
 */
export const apiFetch = (path: string, init?: RequestInit): Promise<Response> =>
  fetch(`${BASE_API_URL}${path}`, init);
