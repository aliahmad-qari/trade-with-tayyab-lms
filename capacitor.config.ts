import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexuscapital.app',
  appName: 'Nexus Capital',
  webDir: 'dist',                   // Vite's output folder

  server: {
    // In production APK, all API calls go to the Render backend.
    // The app itself loads from the bundled dist/ folder (no server URL needed).
    // Uncomment the line below ONLY for live-reload during development:
    // url: 'http://192.168.x.x:3000',
    // androidScheme: 'https',
    cleartext: false,               // disallow plain-HTTP traffic in release
  },

  android: {
    buildOptions: {
      keystorePath: undefined,      // set when building release APK
      keystoreAlias: undefined,
    },
    // Allows the WebView to make HTTPS requests to Render backend
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // set true only during dev/debug
  },

  plugins: {
    // SplashScreen config (if @capacitor/splash-screen is added later)
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#070b14',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
