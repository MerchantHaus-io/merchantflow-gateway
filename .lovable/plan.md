

## Plan: Fix Email Composer Typing Bug + Auto-Populated Branded Signature

### Problem 1: Typing Direction Bug in GmailEditor

**Root cause:** The `GmailEditor` component (`src/components/GmailEditor.tsx`) uses `contentEditable` with `dangerouslySetInnerHTML={{ __html: value }}` on the same div. Every keystroke triggers `onInput → onChange(innerHTML) → parent re-renders → value prop changes → dangerouslySetInnerHTML re-renders the div`, which resets the cursor to the beginning. This makes characters appear in reverse order.

**Fix:** Remove `dangerouslySetInnerHTML` from the editor div. Instead, only set the initial content via a `useEffect` on mount, and only update the DOM when the value changes externally (e.g., AI Polish). The `onInput` handler continues to push innerHTML up to the parent, but the parent's re-render should NOT cause the div to re-render its content.

Specifically in `GmailEditor.tsx`:
- Remove `dangerouslySetInnerHTML={{ __html: value }}` from the contentEditable div
- Use a `useEffect` to set `editorRef.current.innerHTML = value` only on mount
- Improve the external-value-sync logic to only update DOM when the change comes from outside (AI Polish), not from the user's own typing

### Problem 2: Auto-Populated Branded Signature

**What changes:**
- In `src/pages/Outreach.tsx`, when the "New Cadence" dialog opens, auto-generate a branded HTML signature using:
  - The logged-in user's `full_name` and `email` from their profile (fetched from the `profiles` table)
  - The uploaded Merchant Haus logo (copied to `src/assets/merchanthaus-logo.png` — already exists)
  - The company phone number (to be provided by user)
  - Company website: merchanthaus.io

- The signature HTML will look like:
  ```
  ─────────────────────
  [User Full Name]
  Merchant Haus
  📞 [Company Phone] | ✉ [user email]
  🌐 merchanthaus.io
  [Merchant Haus Logo]
  ```

- Pre-populate the `signature` state with this HTML when the dialog opens, so users see it immediately but can still edit it
- Fetch the user's profile on component mount to get `full_name` and `phone`

### Files to Edit

1. **`src/components/GmailEditor.tsx`** — Fix the contentEditable cursor bug
2. **`src/pages/Outreach.tsx`** — Auto-populate signature with user profile + branding + company phone

### Waiting On

The company phone number from the user before implementing the signature.

