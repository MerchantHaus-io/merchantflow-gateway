# Team outreach upgrade

## Delivery boundary

The data-only phase is applied. The existing Outreach screens and delivery functions are unchanged, as required by the project's migration/client separation rule. The new cadence is **not yet executable from the team UI**. No AI request, contact email or phone call has been made by this phase.

The next separate app/function session must implement the items below before presenting this as usable. Existing bulk outreach remains separate. `cadence_active` contacts must never be fed to the old sender.

## Source: Xavier SDR Outreach Cadence — 12 Touches

| Touch | Working day | Channel | Action | Email thread |
|---|---:|---|---|---|
| 1 | 1 | LinkedIn | View profile, follow company, connect with a short note; no pitch | — |
| 2 | 1 | Email | Intro and one question | New |
| 3 | 3 | Quo call | Leave voicemail pointing to email 1 | — |
| 4 | 5 | LinkedIn | Genuine comment on a recent post | — |
| 5 | 7 | Email | Short bump | Reply to touch 2 |
| 6 | 9 | Quo call | Different slot; no voicemail | — |
| 7 | 10 | LinkedIn | DM if connected; otherwise like/comment | — |
| 8 | 14 | Email | Disputes and fraud angle | New |
| 9 | 16 | Quo call | Voicemail referencing email 3 | — |
| 10 | 18 | LinkedIn | Useful point without an ask | — |
| 11 | 21 | Email | Ask for the right person | Reply to touch 8 |
| 12 | 24 | Email | Polite close-out | New |

Working days skip weekends and observed US federal holidays, including an observed New Year in the prior year. Planning is 11:00–16:00 Cape Town; outreach starts no earlier than 16:00 Cape Town. First East/Central calls start 16:30; West Coast calls start 18:30; call 2 uses the later slot. Due times also respect 09:00 in the contact's timezone. Show dates in CT in the CRM, with the source timezone explicit when editing schedules.

Start five companies/day over three days for the PDF's 15-company cohort, keeping contacts from one company together. Any reply stops the sequence; positive/maybe replies require a 15-minute-call handoff to Darryn. Not interested, opt-out, bounce and conversion stop further outreach. Never resume a suppressed contact silently.

## Data now available

- `outreach_enrollments`: contact/campaign/tenant, assigned member and canonical membership email, start date/timezone, website/LinkedIn links, research with sources and status/error/run ID.
- `outreach_touches`: generated twelve steps, due times, pending/completed/skipped/cancelled, editable subject and text, notes/outcome/verbatim reply, completed-by/time, provider message/thread references, reminder claim.
- `outreach_contacts.phone`: retain imported phone numbers for Quo.
- `outreach_touch_template`, `outreach_working_day`, `outreach_due_at`: read-only authenticated functions for exact template/scheduling.
- Validation requires same-organisation parent records and an active internal assignee. Sender email is overwritten with the membership email, not trusted from input.
- A contact reply cancels pending touches transactionally. Touch outcomes `positive`, `maybe`, `replied`, `not_interested`, or a verbatim reply also stop the sequence.
- Enrolment creation generates all twelve touches atomically and removes the contact from legacy pending/sent eligibility.
- `outreach_notify_due`: service-only bounded (250) reminder writer, one alert per next incomplete due touch, row-lock deduplication, active memberships/organisations only. Hourly job `outreach-next-step-reminders` produces bell links to the existing campaign page. No automated outbound communication.

## Next-session execution screens

1. Team queue: Mine/Team, due/overdue/upcoming/paused/replied, assignee, company, channel and step count; contact drawer with all twelve steps, scripts, history, research and source links. Clear loading/error/empty states.
2. CSV: robust CSV parser (quoted commas/newlines/BOM), preview and column mapping for first/last/email/phone/company/website/LinkedIn/timezone/assignee; validation, duplicates and skipped-row report. Preview before saving/enrolling, bounded batch import, explicit default assignee. Support manual enrolment too.
3. Assignment: same-organisation active internal members only; use the assignee's connected/verified sending identity. Do not silently substitute a campaign/global sender when unavailable.
4. Quo: existing proxy/dialler integration for rep-initiated calls; do not mark a touch complete simply because the dialler opens. Log call outcome and provider reference; distinguish voicemail/no answer/live conversation/meeting/not interested.
5. Email: editable per-contact review before every send; server tenant/assignee checks, suppression/reply checks immediately before delivery, idempotent provider send, genuine thread references for touches 5 and 11. Mark complete only after confirmed send. Surface unavailable sender/service configuration rather than falling back.
6. LinkedIn: manual external profile/post actions with editable notes; completion is explicit, not implied by opening a link. Do not automate LinkedIn scraping, connection requests or messaging.
7. Replies: wire Gmail/inbound provider events to the exact tenant/contact/provider message. Stop sequence on all replies; show verbatim reply, classify intent for review, notify Darryn within the same organisation for warm replies. Existing Google API enablement remains an external dependency to verify.
8. Pause/resume/skip/snooze, reasons, audit history; suppression cannot be bypassed by resume. Track completed touches, connection acceptance, reply rate, live conversations and booked meetings.

## AI research and messaging (not implemented in this phase)

- Use server-side tenant-scoped calls through the supported AI Gateway SDK; inspect current skills before implementing. Secrets, prompts and model calls stay server-side. Stream, allow Stop, preserve run IDs and terminal denial/pause semantics.
- Research only the contact's supplied business website/public sources. Fetching requires HTTPS, SSRF protection for DNS/redirects, bounded content and source citations. Treat source content as untrusted, never instructions; never include other ISO records or unnecessary sensitive personal data.
- Separate cited facts from assumptions. If no specific company detail is supported, flag insufficient research rather than inventing one. The source asks for one real detail and a recent LinkedIn post; accept a user-supplied post when public access is unavailable.
- Generate editable per-contact email drafts, LinkedIn notes/comments/DMs, call openers and voicemail scripts. Do not send automatically. Each email: under 90 words, one question, no attachments, no pricing, no other MerchantHaus clients. Use the assigned person's name, not Xavier for every assignee.
- Keep fintech claims grounded and current; do not guarantee 3DS liability shift or assert unsupported Visa policy changes. Never expose supplier costs, markup or another customer's information.
- PDF email angles: payments setup/gateway/fraud/processing intro; free statement second opinion with Darryn; disputes/fraud tools; right-person question; respectful final note. Call goal is booking 15 minutes, not a product explanation. Voicemail under 20 seconds.
- AI costs draw from workspace credits; research/generation starts only on explicit team action. No unbounded bulk research or automatic retries of terminal failures.

## Verification

Run `python3 scripts/check-outreach-cadence.py` after minting the authorized app session: live template/date/assignment/stop/isolation checks create a throwaway campaign and cascade-delete it. No contact delivery occurs.

Run `scripts/check-outreach-reminders.py prepare`, invoke the privileged due-reminder function twice, then `verify`: asserts recipient/tenant, one alert per step, and blocks later-step alerts. Cleans its notification and campaign. These are data-phase checks, not end-to-end verification of the pending UI, Quo, email or AI flows.

Measured on 23 Nov 2026: all 17 live cadence checks passed; the reminder check delivered exactly one alert to the assigned user across two runs, with later steps withheld. Both test campaigns, their contacts/touches and the test alert were removed. The preview reported build OK; lint reported 0 errors and 321 inherited warnings. No manual app build was run because the platform runs it automatically.