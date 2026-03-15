

## Problem
The Quo Dialler and other internal-only components (IncomingCallToast, IncomingMessageToast, CommandPalette, KeyboardShortcutsModal) render on all routes, including public-facing pages like `/contact`, `/apply`, `/auth`, etc.

## Solution
Wrap the internal-only global components in a small guard component that checks the current route and only renders them on authenticated/internal routes.

### Changes

**`src/App.tsx`**:
- Create a small `InternalWidgets` component that reads `useLocation()` and defines a list of public route prefixes (`/auth`, `/login`, `/contact`, `/apply`, `/merchant-apply`, `/forgot-password`, `/update-password`, `/terms-processing`).
- If the current path matches a public route, render nothing.
- Otherwise, render `<Dialler />`, `<IncomingCallToast />`, `<IncomingMessageToast />`, `<CommandPalette />`, and `<KeyboardShortcutsModal />`.
- Replace the current five standalone component calls with `<InternalWidgets />`.

This also fixes the logo issue — will update the Contact form to use `/images/merchanthaus-logo.png` instead of the theme-based logos in the same pass.

**`src/pages/Contact.tsx`**:
- Remove `useTheme` import and `logoDark`/`logoLight` imports.
- Use `/images/merchanthaus-logo.png` as the logo source.

