import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Live-reload against a dev server, opt-in via the environment (#147).
 *
 * This config used to hardcode `server.url` pointing at the Lovable preview
 * sandbox, which meant the shipped native app was a thin wrapper around that
 * sandbox: `webDir` was never used, every preview edit reached installed users
 * instantly, and the app was dead whenever the sandbox was. For an app that
 * handles merchant data that is also a compliance problem — the code running
 * on a user's phone was whatever was last typed into the editor, with no build,
 * no review and no version.
 *
 * A release build now serves the bundled assets in `dist`. To get live reload
 * back while developing, set CAP_SERVER_URL to your dev server before running
 * `npx cap sync` — e.g.
 *
 *   CAP_SERVER_URL=http://192.168.1.20:8080 npx cap sync
 */
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'app.lovable.d4e766df1ab44f95a16a4c8c4222778a',
  appName: 'Ops Terminal',
  webDir: 'dist',
  server: {
    ...(devServerUrl ? { url: devServerUrl } : {}),
    androidScheme: 'https',
    iosScheme: 'https',
    // `cleartext` and `allowMixedContent` used to be on here, permitting plain
    // HTTP inside the app (#148). Play Store review flags it, and nothing in a
    // Supabase-backed app needs it.
    //
    // Keeps in-app navigation inside the WebView rather than bouncing the user
    // to the system browser with a URL bar. External links go through
    // openExternal(), which uses the in-app browser deliberately.
    allowNavigation: [
      '*.lovableproject.com',
      '*.lovable.app',
      '*.supabase.co',
    ],
  },
  plugins: {
    SplashScreen: {
      // Held until the app has painted and main.tsx calls SplashScreen.hide()
      // (#150). The old fixed 2500ms ran regardless of readiness, and was the
      // first of three loading screens on a cold start.
      launchAutoHide: false,
      // Fallback only, in case the web layer fails to boot and never calls
      // hide() — without it the splash would stay up forever.
      launchShowDuration: 8000,
      backgroundColor: '#0F172A',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'large',
      spinnerColor: '#3B82F6',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: false,
      // Starting values only. syncNativeChrome() in src/lib/nativeChrome.ts
      // repoints both from the active theme's --background at runtime, because
      // #0F172A matches none of the fourteen themes (#149).
      style: 'DARK',
      backgroundColor: '#0F172A',
    },
  },
  android: {
    backgroundColor: '#0F172A',
    webContentsDebuggingEnabled: false,
    // captureInput was true, which is known to interfere with hardware and
    // Bluetooth keyboards on Android tablets (#153). Nothing here needs it.
    useLegacyBridge: false,
    overrideUserAgent: undefined,
    appendUserAgent: 'OpsTerminalAndroid',
    loggingBehavior: 'production',
    buildOptions: {
      releaseType: 'AAB',
    },
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0F172A',
    scrollEnabled: true,
  },
};

export default config;
