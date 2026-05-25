// One-off cleanup: remove Outlook signature images mistakenly stored as documents.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const bucket = "opportunity-documents";
  let removedStorage = 0;
  let removedRows = 0;
  const errors: string[] = [];

  // Page through storage.objects via DB query (service role can read).
  const { data: rows, error: qErr } = await supabase
    .from("documents")
    .select("id, file_path")
    .or("file_name.ilike.Outlook-%,file_path.ilike.%Outlook-%");

  if (qErr) return new Response(JSON.stringify({ error: qErr.message }), { status: 500 });

  const paths = (rows ?? []).map((r) => r.file_path).filter(Boolean) as string[];

  // Also pick up orphan storage objects (no documents row) via REST list — skip for simplicity; rely on docs table.
  // Delete storage in batches of 100.
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) errors.push(`storage chunk ${i}: ${error.message}`);
    else removedStorage += chunk.length;
  }

  // Delete documents rows.
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length) {
    const { error, count } = await supabase
      .from("documents")
      .delete({ count: "exact" })
      .in("id", ids);
    if (error) errors.push(`docs delete: ${error.message}`);
    else removedRows = count ?? ids.length;
  }

  // Sweep any remaining orphan Outlook-* objects in storage not tracked in documents.
  // List per opportunity folder is expensive; use a direct query against storage.objects via RPC if available.
  // We'll do a second pass using the storage list at bucket root prefixes seen.
  const prefixes = Array.from(new Set(paths.map((p) => p.split("/")[0])));
  for (const prefix of prefixes) {
    const { data: list } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    const orphan = (list ?? [])
      .filter((o) => o.name.includes("Outlook-"))
      .map((o) => `${prefix}/${o.name}`);
    if (orphan.length) {
      const { error } = await supabase.storage.from(bucket).remove(orphan);
      if (error) errors.push(`orphan ${prefix}: ${error.message}`);
      else removedStorage += orphan.length;
    }
  }

  return new Response(
    JSON.stringify({ removedStorage, removedRows, errors }),
    { headers: { "Content-Type": "application/json" } }
  );
});
