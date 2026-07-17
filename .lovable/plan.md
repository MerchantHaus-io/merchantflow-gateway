## Why the dashboard looks messy

I pulled the latest email-sourced tickets. The `description` column stores whatever the poller extracts, and the detail view just dumps it into a `whitespace-pre-wrap` `<p>`. The recent tickets show three concrete pollution patterns coming through untouched:

1. **Unfilled template tokens** from marketing platforms — `${buttontext}`, `<[[${btn_link}]]>`, `<[[https://…]]>` — appear as raw text mid-body.
2. **Tracking URLs** from HubSpot / Marketo / SendGrid wrappers — 400-character `info.nuvei.com/e3t/Ctc/…` links pasted inline blow out the layout and hide the actual sentence.
3. **Marketing chrome** — "View in browser", "View as webpage", "Unsubscribe", footer address blocks, `© 2026 …` — kept in full because `stripQuotedReply` only trims replies, not headers/footers.

On top of that the dashboard renders raw text, so real URLs aren't clickable, whitespace runs (`\n\n\n`, NBSPs, zero-width chars) survive, and quoted-printable soft-wrap artifacts (`=\n`, `=20`) occasionally slip through when the text/plain part is missing and we fall back to the HTML strip.

The MH-1008 ticket (real customer, `darryn182@gmail.com`) is clean — so the pipeline works; it's marketing/newsletter mail that exposes the gaps. Fixing this cleans real inbound too.

## Proposed changes

### 1. Extend `stripHtml` / add `sanitizeInboundBody` in `supabase/functions/_shared/support-intake.ts`
A single new helper that runs on every intake path (Gmail poller + inbound webhook). It layers:
- **Template-token strip** — drop lines matching `${…}`, `[[…]]`, or `<\[\[.*?\]\]>` fragments. Also strip Mustache-style `{{…}}` remnants.
- **Tracking-URL shortening** — detect long redirect URLs (`info.*/e3t/`, `list-manage.com`, `sendgrid.net/ls/click`, `hubspotlinks.com`, `mandrillapp.com/track`) and either drop bare-line links or replace with `[link]`. Preserve real anchors.
- **Marketing-chrome strip** — drop lines matching a small allow-list of newsletter boilerplate: `View in browser`, `View as webpage`, `Unsubscribe`, `Manage preferences`, `You are receiving…`, `© 20xx …`, and standalone postal-address footers (heuristic: 2–3 consecutive short lines ending in a US state + ZIP or country).
- **Quoted-printable cleanup** — collapse `=\r?\n` soft breaks, decode common `=XX` sequences when the text obviously wasn't decoded upstream.
- **Whitespace normalisation** — replace NBSP/zero-width chars with regular spaces, collapse runs of blank lines to a single blank line, trim.
- **Length cap** — hard cap description at ~8 KB (keep the head, append `[…truncated]`). Prevents 8 KB Nuvei blasts from dominating the dashboard row.

Order matters: strip HTML → decode QP → drop template tokens → drop tracking URLs → drop marketing chrome → strip quoted reply → normalise whitespace → cap length.

Existing exports (`stripHtml`, `stripQuotedReply`) stay so nothing else breaks; the new `sanitizeInboundBody(rawText, rawHtml)` composes them.

### 2. Wire it into both intake paths
- `supabase/functions/gmail-poll-support/index.ts`: replace the current `body = text || (html ? stripHtml(html) : "")` + `stripQuotedReply(body)` with `sanitizeInboundBody(text, html)`.
- `supabase/functions/support-inbound-email/index.ts`: same swap in `parseInbound` / just before insert.

### 3. Backfill existing tickets (one-off)
A single migration that re-runs the sanitiser against `support_tickets.description` for `source = 'email'` rows where the description matches known noise markers (`${`, `[[`, `View in browser`, etc.). Runs once, idempotent — safe to re-run.
(Cleanest to do this in a small edge function called manually rather than SQL, since the sanitiser is TS. I'll add a `sanitize-existing-tickets` one-shot function guarded by a header secret.)

### 4. Dashboard rendering upgrade in `src/pages/SupportTicketDetail.tsx`
Small, presentation-only:
- Replace the raw `<p>` with a helper that:
  - `whitespace-pre-wrap` still preserves paragraphs.
  - Auto-links bare URLs (safe regex → `<a target="_blank" rel="noopener">`).
  - Truncates displayed URL text to ~60 chars with an ellipsis; full URL stays in `href`.
  - Wraps long unbroken tokens with `break-words`/`overflow-wrap: anywhere` so tracking URLs (if any survive) don't stretch the card.
- Also show a "Show original" toggle that reveals the pre-sanitise body — kept in a new nullable column `description_raw` so ops can inspect what came in when triage is unsure. (Optional; happy to skip if you want to keep the schema untouched.)

### 5. Not doing
- Full HTML rendering of the ticket body — too much attack surface (marketing HTML is a mess and would need DOMPurify + iframe sandboxing). Sanitised plain text with clickable links is the right level.
- Blocking newsletter senders outright — that's a separate "filter marketing at the inbox" conversation; today's fix makes them at least readable in the desk.

## Files touched
- `supabase/functions/_shared/support-intake.ts` — add `sanitizeInboundBody` + helpers.
- `supabase/functions/gmail-poll-support/index.ts` — use it.
- `supabase/functions/support-inbound-email/index.ts` — use it.
- `src/pages/SupportTicketDetail.tsx` — auto-link + wrap the description block (small render helper, no new deps).
- (Optional) `supabase/functions/sanitize-existing-tickets/index.ts` — one-shot backfill, `supabase/config.toml` entry for it, and a new nullable `description_raw text` column via migration if you want the "Show original" toggle.

## Verification
- Unit test the new `sanitizeInboundBody` against fixture strings taken from MH-1010, MH-1011, MH-1012 — assert the tokens/tracking links/chrome are gone and the real sentences survive.
- Manually trigger `gmail-poll-support` with `?includeRead=1` on a small window and spot-check the new descriptions in the dashboard.

Say the word and I'll ship #1–#4 (skip the optional `description_raw` column unless you want that toggle).