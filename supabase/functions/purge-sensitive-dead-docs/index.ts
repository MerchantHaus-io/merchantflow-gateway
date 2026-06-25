// One-shot purge: bank statements & driver's licenses on dead opportunities
// created before 2026-05-01. Excludes opportunities whose account also has
// a won/active opportunity (live/billing). Closed Won is never touched.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let invokerEmail = "anon";
    const isService = authHeader === `Bearer ${serviceKey}`;
    if (!isService && authHeader.startsWith("Bearer ")) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      invokerEmail = user?.email ?? "anon";
    } else if (isService) {
      invokerEmail = "service-role";
    }



    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run !== false; // default dry-run

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch dead opp ids excluding those whose account has any won/active opp
    const { data: deadOpps, error: oppErr } = await sb
      .from("opportunities")
      .select("id, account_id, status")
      .eq("status", "dead");
    if (oppErr) throw oppErr;

    const accountIds = [...new Set((deadOpps ?? []).map((o) => o.account_id).filter(Boolean))];
    const { data: liveOpps } = await sb
      .from("opportunities")
      .select("account_id, status")
      .in("status", ["won", "active"])
      .in("account_id", accountIds);
    const liveAccts = new Set((liveOpps ?? []).map((o) => o.account_id));
    const eligibleOppIds = (deadOpps ?? [])
      .filter((o) => !liveAccts.has(o.account_id))
      .map((o) => o.id);

    if (eligibleOppIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, eligible_opportunities: 0, documents: 0 }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: docs, error: docErr } = await sb
      .from("documents")
      .select("id, opportunity_id, file_name, file_path, file_size, document_type, created_at")
      .in("opportunity_id", eligibleOppIds)
      .in("document_type", ["Bank Statement", "Passport/Drivers License"])
      .lt("created_at", "2026-05-01");
    if (docErr) throw docErr;

    const all = docs ?? [];
    const totalBytes = all.reduce((n, d) => n + (d.file_size ?? 0), 0);

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true, dry_run: true,
        eligible_opportunities: eligibleOppIds.length,
        documents: all.length, bytes: totalBytes,
        breakdown: {
          bank_statements: all.filter((d) => d.document_type === "Bank Statement").length,
          drivers_licenses: all.filter((d) => d.document_type === "Passport/Drivers License").length,
        },
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Delete from storage in 100-batches
    const paths = all.map((d) => d.file_path).filter(Boolean) as string[];
    let storageRemoved = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error, data } = await sb.storage.from("opportunity-documents").remove(batch);
      if (!error) storageRemoved += (data?.length ?? batch.length);
      else console.error("storage remove error:", error);
    }

    const ids = all.map((d) => d.id);
    let rowsRemoved = 0;
    if (ids.length) {
      const { error: delErr, count } = await sb
        .from("documents")
        .delete({ count: "exact" })
        .in("id", ids);
      if (delErr) throw delErr;
      rowsRemoved = count ?? ids.length;
    }

    console.log(`purge-sensitive-dead-docs by ${invokerEmail}: ${rowsRemoved} rows, ${storageRemoved} files, ${totalBytes} bytes`);

    return new Response(JSON.stringify({
      ok: true, dry_run: false,
      eligible_opportunities: eligibleOppIds.length,
      documents: all.length, storage_removed: storageRemoved,
      rows_removed: rowsRemoved, bytes: totalBytes,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("purge-sensitive-dead-docs error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
