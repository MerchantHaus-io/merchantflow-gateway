

## Create Web Submission for Tatum Lugo

### What this does
Creates a web submission record in the CRM for Tatum Lugo using the information already captured in the sales email thread. This will make her visible in the Web Submissions dashboard for conversion to the pipeline.

### Data to insert
From the email correspondence, we have:

| Field | Value |
|-------|-------|
| Full Name | TATUM LUGO |
| Email | help@pliantgraceumbrellas.org |
| Phone | 4084589592 |
| Company/DBA | Pliant Grace Umbrellas |
| Website | https://pliantgraceumbrellas.org/ |
| Monthly Volume | 15000 |
| Avg Ticket | 80 |
| Ecommerce % | 100 |
| Current Processor | None |
| Service Type | processing (covers both gateway + processing) |
| Status | pending |
| Source | web_form |
| Message | "Inbound inquiry via sales@merchanthaus.io — needs NMI Gateway integration and merchant account for online payments. No prior processing history." |

### Steps

1. **Insert application record** into the `applications` table using the database insert tool with all extracted fields
2. **No documents to attach** — the email thread contained no file attachments; documents (Articles of Incorporation, EIN, voided check, IDs) are still outstanding per the KYC request sent by Dylan

### What does NOT change
- No code changes needed — this is a data operation only
- The SSN mentioned in the email thread will NOT be stored in the submission
- No new accounts, contacts, or opportunities created — those are created when the operator clicks "Convert to Pipeline" in Web Submissions

### Note
The Gmail sync did not capture Tatum's inbound emails because they were sent from `help@pliantgraceumbrellas.org` to `sales@merchanthaus.io`, and the sync only captured the outbound replies from `sales@`. The auto-lead creation didn't fire because `sales@merchanthaus.io` is a team email in the exclusion list, so the "from" address was always team-side. After this submission is created, you can convert her to the pipeline from Web Submissions.

