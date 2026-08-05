import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.1";
import { requireInvoker } from "../_shared/require-invoker.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const ROOT_FOLDER = "MerchantHaus-Backups";
const BATCH = 500;

function driveAuth() {
  const lk = Deno.env.get("LOVABLE_API_KEY");
  const gk = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lk || !gk) throw new Error("Missing LOVABLE_API_KEY or GOOGLE_DRIVE_API_KEY");
  return { "Authorization": `Bearer ${lk}`, "X-Connection-Api-Key": gk };
}

async function ensureFolder(name: string, parent?: string): Promise<string> {
  const headers = driveAuth();
  const q = parent
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parent}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await fetch(`${GATEWAY}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, { headers });
  const j = await r.json();
  if (j.files?.length) return j.files[0].id;
  const meta: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parent) meta.parents = [parent];
  const c = await fetch(`${GATEWAY}/drive/v3/files?fields=id`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(meta),
  });
  const cj = await c.json();
  if (!cj.id) throw new Error(`folder fail ${JSON.stringify(cj)}`);
  return cj.id;
}

async function findFile(name: string, parent: string): Promise<string | null> {
  const headers = driveAuth();
  const q = `name='${name}' and '${parent}' in parents and trashed=false`;
  const r = await fetch(`${GATEWAY}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, { headers });
  const j = await r.json();
  return j.files?.[0]?.id ?? null;
}

async function downloadFile(fileId: string): Promise<string> {
  const headers = driveAuth();
  const r = await fetch(`${GATEWAY}/drive/v3/files/${fileId}?alt=media`, { headers });
  if (!r.ok) return "";
  return await r.text();
}

async function uploadText(fileName: string, parent: string, existingId: string | null, content: string) {
  const headers = driveAuth();
  const boundary = "----lov" + crypto.randomUUID();
  const enc = new TextEncoder();
  const metadata = existingId
    ? JSON.stringify({})
    : JSON.stringify({ name: fileName, parents: [parent] });
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/x-ndjson\r\n\r\n`
  );
  const body = enc.encode(content);
  const tail = enc.encode(`\r\n--${boundary}--`);
  const buf = new Uint8Array(head.length + body.length + tail.length);
  buf.set(head); buf.set(body, head.length); buf.set(tail, head.length + body.length);
  const url = existingId
    ? `${GATEWAY}/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id`
    : `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id`;
  const r = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: { ...headers, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: buf,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`upload fail ${r.status}: ${JSON.stringify(j)}`);
  return j.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireInvoker(req, corsHeaders);
  if ("response" in auth) return auth.response;



  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: queue, error } = await supabase
    .from("backup_change_queue")
    .select("id,table_name,op,row_pk,payload,created_at")
    .is("flushed_at", null)
    .order("id", { ascending: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!queue || queue.length === 0) {
    return new Response(JSON.stringify({ ok: true, flushed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: run } = await supabase.from("backup_runs").insert({
    kind: "flush", status: "running", triggered_by: "cron",
  }).select("id").single();
  const runId = run?.id;
  const t0 = Date.now();

  try {
    // Group by table + date
    const groups = new Map<string, typeof queue>();
    for (const row of queue) {
      const date = (row.created_at as string).slice(0, 10);
      const key = `${row.table_name}|${date}`;
      if (!groups.has(key)) groups.set(key, [] as typeof queue);
      groups.get(key)!.push(row);
    }

    const rootId = await ensureFolder(ROOT_FOLDER);
    const changesId = await ensureFolder("changes", rootId);

    for (const [key, rows] of groups) {
      const [table, date] = key.split("|");
      const tableId = await ensureFolder(table, changesId);
      const fileName = `${date}.jsonl`;
      const existingId = await findFile(fileName, tableId);
      let body = "";
      if (existingId) body = await downloadFile(existingId);
      const lines = rows.map((r) => JSON.stringify({
        ts: r.created_at, op: r.op, pk: r.row_pk, data: r.payload,
      })).join("\n");
      const combined = body ? `${body.trimEnd()}\n${lines}\n` : `${lines}\n`;
      await uploadText(fileName, tableId, existingId, combined);
    }

    const ids = queue.map((q) => q.id);
    await supabase.from("backup_change_queue")
      .update({ flushed_at: new Date().toISOString() })
      .in("id", ids);

    await supabase.from("backup_runs").update({
      status: "success", finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0, rows_flushed: queue.length,
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, flushed: queue.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("backup_runs").update({
      status: "error", finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0, error: msg, rows_flushed: 0,
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
