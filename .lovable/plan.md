

# Industry-Standard Compliance Features — Implemented

## ✅ 1. Owner Identity Verification (KYC / CDD)
- Added "Passport/Drivers License" as 5th hard-requirement document in underwriting gate (`src/lib/underwriting-gate.ts`)
- Updated ApplicationProgress checklist to show 5 required docs
- Updated AI underwriting review prompt to flag missing Owner ID

## ✅ 2. OFAC / Sanctions Screening
- Extended AI underwriting review prompt with OFAC/SDN screening dimension
- AI now screens business name, DBA, and principal owner names against sanctions patterns
- Results included in auto-saved note with 🛡️ OFAC Screening section
- Added `ofac_screening` field to the AI tool schema

## ✅ 3. Beneficial Ownership Declaration (FinCEN CDD Rule)
- Created `beneficial_owners` table with RLS policies (migration applied)
- Built `BeneficialOwners` component in opportunity detail modal overview
- Underwriting gate now verifies at least one beneficial owner is recorded
- Form captures: name, title, ownership %, DOB, address

## ✅ 4. Stage SLA Timers with Escalation
- Created `sla-escalation` edge function with per-stage thresholds
- Automatically calculates amber/red SLA status for all active opportunities
- Creates high-priority tasks on red breach with notification
- SLA config also available client-side via `src/lib/sla-config.ts`
- Registered in `supabase/config.toml`

## ✅ 5. Duplicate / Existing Merchant Check
- Created `src/lib/duplicate-check.ts` utility
- Checks EIN, legal entity name, and DBA against existing records
- Fires warning toast when moving past Discovery on the pipeline board
- Non-blocking (warning only) to avoid false positive blocks

## ✅ 6. High-Risk MCC Flagging
- Created `src/lib/high-risk-mcc.ts` with known high-risk MCC codes
- Added `risk_tier` column to `validation_reports` table (migration applied)
- AI underwriting review now assesses and returns `risk_tier`
- Auto-saved note includes 🔴 HIGH-RISK MCC warning when flagged

## Pipeline Board Hardening
- Added underwriting gate check to Index.tsx `handleUpdateOpportunity` (was only on Opportunities page)
- Duplicate check fires on Discovery → next stage transition
