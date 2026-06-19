// Dry-run mapper: opportunity -> Kurv (EMS) SubmitSignedDealV2 payload.
// Returns { payload, issues, sources }. No EMS call. No mutations.
import { requireAuth } from "../_shared/require-auth.ts";
import { kurvCors, kurvJson, adminClient } from "../_shared/kurv.ts";

interface Issue { field: string; severity: "error" | "warning"; message: string }

function pick<T>(...vals: (T | null | undefined | "")[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v as T;
  return undefined;
}

function num(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: kurvCors });
  const unauth = await requireAuth(req, kurvCors);
  if (unauth) return unauth;

  try {
    const { opportunity_id } = await req.json();
    if (!opportunity_id) return kurvJson({ error: "opportunity_id required" }, 400);

    const sb = adminClient();
    const issues: Issue[] = [];

    // 1. Opportunity + account + contact
    const { data: opp, error: oppErr } = await sb
      .from("opportunities")
      .select("id, stage, service_type, pricing_plan, gateway_tier, account_id, contact_id")
      .eq("id", opportunity_id)
      .maybeSingle();
    if (oppErr || !opp) return kurvJson({ error: "Opportunity not found" }, 404);

    const [{ data: account }, { data: contact }] = await Promise.all([
      sb.from("accounts").select("name, address1, address2, city, state, zip, country, website").eq("id", opp.account_id).maybeSingle(),
      opp.contact_id
        ? sb.from("contacts").select("first_name, last_name, email, phone").eq("id", opp.contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // 2. Beneficial owners (CRM-side, linked by opportunity_id)
    const { data: bos } = await sb
      .from("beneficial_owners")
      .select("full_name, title, ownership_percentage, date_of_birth, address_line1, address_city, address_state, address_zip, address_country")
      .eq("opportunity_id", opportunity_id);

    // 3. Try to find a linked merchant application via contact email
    let application: any = null;
    let merchant: any = null;
    let bank: any = null;
    let principals: any[] = [];
    if (contact?.email) {
      const { data: appRow } = await sb
        .from("applications")
        .select("id, legal_name, dba_name, federal_tax_id, business_type, business_structure, monthly_volume, avg_ticket, high_ticket, ecommerce_percent, in_person_percent, keyed_percent, website, address, address2, city, state, zip, email, phone, owner_name, owner_title, owner_dob, owner_address, owner_city, owner_state, owner_zip, state_of_incorporation, date_established")
        .ilike("email", contact.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      application = appRow;
      if (appRow?.id) {
        const [{ data: m }, { data: b }, { data: p }] = await Promise.all([
          sb.from("merchants").select("*").eq("application_id", appRow.id).maybeSingle(),
          sb.from("bank_accounts").select("bank_name, account_holder_name, account_last4").eq("application_id", appRow.id).maybeSingle(),
          sb.from("principals").select("*").eq("application_id", appRow.id),
        ]);
        merchant = m; bank = b; principals = p || [];
      }
    }

    // 4. Documents (CRM bucket)
    const { data: docs } = await sb
      .from("documents")
      .select("id, file_name, file_path, content_type, document_type")
      .eq("opportunity_id", opportunity_id);

    // ---- Build EMS-shaped payload (PascalCase, best-effort) ----
    const dbaName = pick<string>(merchant?.dba_name, application?.dba_name, account?.name);
    const legalName = pick<string>(merchant?.legal_entity_name, application?.legal_name, account?.name);
    const tin = pick<string>(merchant?.federal_tax_id, application?.federal_tax_id);
    const mcc = pick<string>(merchant?.sic_mcc_code);
    const monthlyVolume = num(merchant?.monthly_volume ?? application?.monthly_volume);
    const avgTicket = num(merchant?.average_transaction ?? application?.avg_ticket);
    const highTicket = num(merchant?.high_ticket ?? application?.high_ticket);
    const website = pick<string>(merchant?.website_url, application?.website, account?.website);

    const dbaAddress = {
      Line1: pick(merchant?.dba_address_line1, application?.address, account?.address1),
      Line2: pick(merchant?.dba_address_line2, application?.address2, account?.address2),
      City:  pick(merchant?.dba_city, application?.city, account?.city),
      State: pick(merchant?.dba_state, application?.state, account?.state),
      Zip:   pick(merchant?.dba_zip, application?.zip, account?.zip),
      Country: pick(merchant?.dba_country, "US"),
    };
    const legalAddress = {
      Line1: pick(merchant?.legal_address_line1, dbaAddress.Line1),
      Line2: pick(merchant?.legal_address_line2, dbaAddress.Line2),
      City:  pick(merchant?.legal_city, dbaAddress.City),
      State: pick(merchant?.legal_state, dbaAddress.State),
      Zip:   pick(merchant?.legal_zip, dbaAddress.Zip),
      Country: pick(merchant?.legal_country, "US"),
    };

    // Owners: merge CRM beneficial_owners + application principals
    const owners = [
      ...(bos || []).map((o) => ({
        FullName: o.full_name,
        Title: o.title,
        OwnershipPercent: Number(o.ownership_percentage ?? 0),
        DateOfBirth: o.date_of_birth,
        Address: {
          Line1: o.address_line1, City: o.address_city, State: o.address_state,
          Zip: o.address_zip, Country: o.address_country || "US",
        },
        SSN: null,
      })),
      ...principals.map((p) => ({
        FullName: [p.first_name, p.last_name].filter(Boolean).join(" "),
        Title: p.title,
        OwnershipPercent: Number(p.ownership_percentage ?? 0),
        DateOfBirth: p.date_of_birth,
        Address: {
          Line1: p.address_line1, City: p.address_city, State: p.address_state,
          Zip: p.address_zip, Country: p.address_country || "US",
        },
        SSN: null,
      })),
    ];

    // Fallback owner from application's owner_* fields when no structured owners exist
    if (owners.length === 0 && application?.owner_name) {
      owners.push({
        FullName: application.owner_name,
        Title: application.owner_title,
        OwnershipPercent: 100,
        DateOfBirth: application.owner_dob,
        Address: {
          Line1: application.owner_address, City: application.owner_city,
          State: application.owner_state, Zip: application.owner_zip, Country: "US",
        },
        SSN: null,
      } as any);
    }

    const payload = {
      Merchant: {
        DbaName: dbaName,
        LegalName: legalName,
        FederalTaxId: tin,
        BusinessType: merchant?.ownership_type ?? application?.business_structure ?? application?.business_type,
        FormationDate: pick(merchant?.business_formation_date, application?.date_established),
        StateOfIncorporation: pick(merchant?.state_incorporated, application?.state_of_incorporation),
        Mcc: mcc,
        Website: website,
        DbaAddress: dbaAddress,
        LegalAddress: legalAddress,
        Contact: {
          FirstName: pick(merchant?.dba_contact_first_name, contact?.first_name),
          LastName:  pick(merchant?.dba_contact_last_name, contact?.last_name),
          Email:     pick(merchant?.dba_contact_email, contact?.email, application?.email),
          Phone:     pick(merchant?.dba_contact_phone, contact?.phone, application?.phone),
        },
      },
      Owners: owners,
      Bank: bank ? {
        BankName: bank.bank_name,
        AccountHolderName: bank.account_holder_name,
        AccountLast4: bank.account_last4,
        RoutingNumber: null,
        AccountNumber: null,
      } : null,
      Volumes: {
        MonthlyVolume: monthlyVolume,
        AverageTicket: avgTicket,
        HighTicket: highTicket,
        PercentSwiped: num(merchant?.percent_swiped ?? application?.in_person_percent),
        PercentKeyed: num(merchant?.percent_keyed ?? application?.keyed_percent),
        PercentEcommerce: num(merchant?.percent_ecommerce ?? application?.ecommerce_percent),
        PercentMoto: num(merchant?.percent_moto),
      },
      Pricing: {
        Plan: opp.pricing_plan,
        GatewayTier: opp.gateway_tier,
      },
      Documents: (docs || []).map((d) => ({
        Id: d.id,
        Type: d.document_type,
        FileName: d.file_name,
        StoragePath: d.file_path,
        ContentType: d.content_type,
      })),
    };

    // ---- Validation ----
    const req2 = (path: string, val: any) => {
      if (val === undefined || val === null || val === "") {
        issues.push({ field: path, severity: "error", message: `${path} is required by EMS` });
      }
    };
    req2("Merchant.DbaName", payload.Merchant.DbaName);
    req2("Merchant.LegalName", payload.Merchant.LegalName);
    req2("Merchant.FederalTaxId", payload.Merchant.FederalTaxId);
    req2("Merchant.Mcc", payload.Merchant.Mcc);
    req2("Merchant.DbaAddress.Line1", payload.Merchant.DbaAddress.Line1);
    req2("Merchant.DbaAddress.City",  payload.Merchant.DbaAddress.City);
    req2("Merchant.DbaAddress.State", payload.Merchant.DbaAddress.State);
    req2("Merchant.DbaAddress.Zip",   payload.Merchant.DbaAddress.Zip);
    req2("Merchant.Contact.Email", payload.Merchant.Contact.Email);
    req2("Merchant.Contact.Phone", payload.Merchant.Contact.Phone);
    req2("Volumes.MonthlyVolume", payload.Volumes.MonthlyVolume);
    req2("Volumes.AverageTicket", payload.Volumes.AverageTicket);
    if (!payload.Bank) issues.push({ field: "Bank", severity: "error", message: "Bank details missing (routing + account need re-entry, never persisted)" });
    if (!owners.length) issues.push({ field: "Owners", severity: "error", message: "At least one owner is required" });
    const totalPct = owners.reduce((s, o) => s + (Number(o.OwnershipPercent) || 0), 0);
    if (owners.length && Math.abs(totalPct - 100) > 0.01) {
      issues.push({ field: "Owners", severity: "warning", message: `Ownership totals ${totalPct}% (should sum to 100%)` });
    }
    owners.forEach((o, i) => {
      if (!o.DateOfBirth) issues.push({ field: `Owners[${i}].DateOfBirth`, severity: "error", message: `${o.FullName || "Owner"} missing DOB` });
      if (!o.SSN) issues.push({ field: `Owners[${i}].SSN`, severity: "warning", message: `${o.FullName || "Owner"} SSN must be entered at submit time (never stored)` });
    });
    if (!payload.Documents.length) issues.push({ field: "Documents", severity: "warning", message: "No documents on file to attach" });

    if (opp.service_type === "gateway_only") {
      issues.push({ field: "service_type", severity: "error", message: "Gateway-only deals are blocked from underwriting/boarding submission" });
    }

    return kurvJson({
      payload,
      issues,
      sources: {
        opportunity: !!opp,
        account: !!account,
        contact: !!contact,
        application: !!application,
        merchant: !!merchant,
        bank: !!bank,
        principals: principals.length,
        beneficial_owners: (bos || []).length,
        documents: (docs || []).length,
      },
    });
  } catch (err) {
    return kurvJson({ error: (err as Error).message }, 500);
  }
});
