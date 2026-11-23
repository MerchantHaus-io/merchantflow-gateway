# TAMI lead imports

## Status — 23 November 2026

Storage foundation applied in a database-only session. The mapping controls and importer have **not yet been updated**. The sample has 14 contacts and 161 columns; no sample contacts were imported or contacted. Continue in a separate app/function session under the project's database/client separation rule.

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