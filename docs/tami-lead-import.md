# TAMI lead imports

## Status — 23 November 2026

Storage foundation applied in a database-only session; the separate app/function update now adds TAMI auto-mapping, grouped editable column selections and paginated expandable contact previews. Both campaign-header and execution CSV uploads route through the same review before enrollment. The sample has 14 contacts and 161 columns: 13 pass validation; row 11 has an invalid contact email and is reported as skipped. No sample contacts were imported or contacted.

## Mapping contract for the next app/function session

| Lead field | TAMI source column | Storage |
|---|---|---|
| First name | Contact First Name | first_name |
| Last name | Contact Last Name | last_name |
| Contact email | Contact Email Address | email |
| Company | Company Name | company |
| Street | Address Street | address_street |
| City | Address City | address_city |
| State | Address State | address_state |
| State code | Address State Code | address_state_code |
| ZIP/postal code | Address ZIP | address_zip |
| Country | Address Country | address_country |
| Country code | Address Country Code | address_country_code |
| Company website | Website; fall back to Simple Url | website_url |
| Contact LinkedIn | Contact LinkedIn Link | linkedin_url |
| Job title | Contact Title | job_title |
| Preferred calling number | Contact Direct Dial; Contact Primary Phone Number; valid mobile; first contact number; Company Primary Phone Number | phone |
| Direct phone | Contact Direct Dial | direct_phone |
| Mobile | Contact mobile phone | mobile_phone |
| All contact phones | Contact Phone Numbers + primary/direct/mobile | contact_phone_numbers |
| Company primary phone | Company Primary Phone Number | company_primary_phone |
| All company phones | Company Phone Numbers + company primary | company_phone_numbers |
| Source email-quality label | Contact Email Status | email_quality |
| Industry | Industries | industry |
| Sub-industry | Sub-Industries | sub_industry |
| Employees | No. of Employees | employee_count |
| Employee range | Employee LinkedIn Range | employee_range |
| Reported turnover | Turnover | reported_turnover |
| Estimated online turnover | Estimated Online Turnover | estimated_online_turnover |
| Payment providers | Payment Providers | payment_providers |
| Website technology | Website Technology | website_technology |
| Company description | Company Description | company_description |
| Source | Recognized TAMI headers | source_system = TAMI |
| Company source ID | Tami Company Id | source_company_id |
| Contact source ID | TAMI Contact Id | source_contact_id |
| Scheduling timezone | Time Zone | enrollment.contact_timezone |

## Import requirements

- Review before import; let the team override guessed column selections. Show names, email, company, full address/state, all phone groups, website and expandable business context.
- Contact email is not Company Email. Source email status is not application delivery status or evidence of consent.
- Preserve separate contact/company phone groups and a single preferred dial number. Split semicolon-separated phone lists; deduplicate equivalent numeric values without losing international prefixes. Exclude unavailable values such as `Upgrade your plan to get this info.`; do not truncate a list into the old 40-character preferred-number field.
- Normalize bare business domains to HTTPS and apply existing public URL safety checks. Copy contact website/LinkedIn to enrollment links so existing research remains available.
- Convert recognized Windows timezone labels (including Pacific Standard Time) to IANA zones (America/Los_Angeles), which automatically respect daylight saving. Unrecognized timezone labels require a reviewed default rather than silently discarding the row.
- Preserve text labels/ranges for turnover and company size. Imported financial context is not verified processing volume; never use it to calculate pipeline value. Imported payment-provider claims must be verified before AI presents them as facts.
- Treat imported descriptions as untrusted data, not instructions, and retain them separately from provider-cited AI research.
- Keep source IDs/quality labels internal. Do not persist unnecessary export columns or plan-upsell placeholders. Existing duplicate, assignment, tenant and suppression checks still apply.

## Verification

`python3 scripts/check-tami-storage.py` performs read-only live schema checks for each required field group, optional business context, safe empty phone-list defaults and unchanged enabled RLS. It imports no leads and sends no messages. This is storage verification, not an end-to-end import claim.

- `npx vitest run src/lib/outreachImport.test.ts src/lib/outreachCadence.test.ts`: 26 passing tests, covering required fields, separate phone lists, placeholders, websites, LinkedIn, Windows timezones, editable mappings and untrusted context boundaries.
- Supplied sample parsed without writing data: 13 valid, one invalid email, no timezone warnings; all three Windows labels converted to IANA zones.
- Deployed `outreach-execute`; a real authenticated disposable enrollment persisted names, email, full address/state/ZIP, distinct phone groups, company links, source context and a Pacific timezone with exactly 12 pending touches. Temporary records were removed; no communication was delivered.
- Browser upload/readback verification remains incomplete: initial update notice and page-loading waits blocked early attempts, then the file-upload action timed out before opening the review. Stopped the upload walkthrough after three attempts. A separate queue-readback attempt also timed out waiting for the campaign heading. No desktop/mobile review screenshot or full UI end-to-end success is claimed.
- Preview compilation reports build OK; lint: zero errors, 323 inherited warnings. Deno check passed with `--node-modules-dir=auto`; the default resolver initially failed on the existing SDK CORS subpath. Mechanical design detector returned no findings. Manual application build/typecheck was not run because the platform runs these checks automatically.