import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.d4e766df1ab44f95a16a4c8c4222778a',
  appName: 'Ops Terminal',
  webDir: 'dist',
  server: {
    url: 'https://d4e766df-1ab4-4f95-a16a-4c8c4222778a.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
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
      style: 'DARK',
      backgroundColor: '#0F172A',
    },
  },
  android: {
    backgroundColor: '#0F172A',
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
    captureInput: true,
    useLegacyBridge: false,
    overrideUserAgent: undefined,
    appendUserAgent: 'OpsTerminalAndroid',
    // Ensure in-app WebView is used (no Chrome Custom Tabs / browser URL bar)
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
