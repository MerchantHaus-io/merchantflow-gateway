// Purges documents tied to opportunities that were closed without approval
// (status='dead': covers closed_lost, disqualified, no_decision, underwriting_declined)
// AND have not been touched for 12+ months. Approved/won deals are NEVER purged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RETENTION_MONTHS = 12;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run !== false; // default to dry run for safety
    if (!dryRun && !ADMIN_EMAILS.includes(user.email ?? "")) {
      return json({ error: "Admin access required to execute purge" }, 403);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Cutoff = 12 months ago
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
    const cutoffIso = cutoff.toISOString();

    // Find eligible opportunities (dead + stale)
    const { data: opps, error: oppErr } = await sb
      .from("opportunities")
      .select("id, account_id, status, outcome_reason, updated_at")
      .eq("status", "dead")
      .lt("updated_at", cutoffIso);

    if (oppErr) throw oppErr;

    const oppIds = (opps ?? []).map((o) => o.id);
    if (oppIds.length === 0) {
      return json({
        ok: true,
        dry_run: dryRun,
        cutoff: cutoffIso,
        eligible_opportunities: 0,
        documents: 0,
        deleted: 0,
      });
    }

    // Fetch documents for those opps
    const { data: docs, error: docErr } = await sb
      .from("documents")
      .select("id, opportunity_id, file_name, file_path, file_size")
      .in("opportunity_id", oppIds);
    if (docErr) throw docErr;

    const all = docs ?? [];
    const totalBytes = all.reduce((n, d) => n + (d.file_size ?? 0), 0);

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        cutoff: cutoffIso,
        eligible_opportunities: oppIds.length,
        documents: all.length,
        bytes: totalBytes,
        sample: all.slice(0, 10).map((d) => ({
          file_name: d.file_name,
          opportunity_id: d.opportunity_id,
        })),
      });
    }

    // Execute: remove from storage + DB
    const paths = all.map((d) => d.file_path).filter(Boolean) as string[];
    let storageRemoved = 0;
    // Batch in 100s (Supabase storage remove limit-friendly)
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error } = await sb.storage.from("opportunity-documents").remove(batch);
      if (!error) storageRemoved += batch.length;
    }

    const docIds = all.map((d) => d.id);
    let rowsRemoved = 0;
    if (docIds.length) {
      const { error: delErr, count } = await sb
        .from("documents")
        .delete({ count: "exact" })
        .in("id", docIds);
      if (delErr) throw delErr;
      rowsRemoved = count ?? docIds.length;
    }

    console.log(
      `purge-stale-documents by ${user.email}: ${rowsRemoved} rows, ${storageRemoved} files, ${totalBytes} bytes`
    );

    return json({
      ok: true,
      dry_run: false,
      cutoff: cutoffIso,
      eligible_opportunities: oppIds.length,
      documents: all.length,
      storage_removed: storageRemoved,
      rows_removed: rowsRemoved,
      bytes: totalBytes,
    });
  } catch (err) {
    console.error("purge-stale-documents error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
