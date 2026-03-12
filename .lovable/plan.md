

## Plan: Production Capacitor Config

Remove the `server` block from `capacitor.config.ts` so the APK serves local bundled assets from `dist/` instead of pointing to the remote Lovable preview URL.

### Change

**`capacitor.config.ts`** — Delete the `server` property:

```ts
// REMOVE this block:
server: {
  url: 'https://d4e766df-1ab4-4f95-a16a-4c8c4222778a.lovableproject.com?forceHideBadge=true',
  cleartext: true,
},
```

Everything else (appId, appName, webDir, plugins, android) stays unchanged.

### After Implementation

You will need to:
1. Git pull the updated project
2. Run `npm run build` to generate fresh `dist/` assets
3. Run `npx cap sync android`
4. Open the `android/` folder in Android Studio
5. **Build → Build Bundle(s) / APK(s) → Build APK** to generate your production APK

