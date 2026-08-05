import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.1";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const ROOT_FOLDER = "MerchantHaus-Backups";

const TABLES = [
  "accounts","action_items","activities","admin_popup_acknowledgments","admin_popups",
  "agenda_items","application_documents","application_secrets","applications","audit_entries",
  "bank_accounts","beneficial_owners","billing_doc_sequences","billing_documents",
  "broadcast_acknowledgments","cadence_steps","calendar_events","call_logs",
  "chat_channels","chat_messages","client_interactions","comments","commission_periods",
  "commission_records","commission_sync_logs","contacts","deletion_requests","direct_messages",
  "documents","kurv_deal_submissions","kurv_merchants","kurv_sync_logs","kurv_transactions_daily",
  "lead_referrers","merchant_consents","merchants","message_logs","message_reactions",
  "nmi_boarding_submissions","notifications","office_avatars","onboarding_wizard_states",
  "opportunities","outreach_campaigns","outreach_contacts","principals","profiles",
  "push_subscriptions","quote_acceptances","quotes","referrers","shared_todos",
  "sop_change_requests","support_ticket_comments","support_tickets","synced_emails","tasks",
  "team_roster","terminal_updates","user_favorites","user_roles","user_sessions",
  "validation_reports","website_scrutiny_reports",
];

async function driveAuth() {
  const lk = Deno.env.get("LOVABLE_API_KEY");
  const gk = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lk || !gk) throw new Error("Missing LOVABLE_API_KEY or GOOGLE_DRIVE_API_KEY");
  return {
    "Authorization": `Bearer ${lk}`,
    "X-Connection-Api-Key": gk,
  };
}

async function ensureFolder(name: string, parent?: string): Promise<string> {
  const headers = await driveAuth();
  const q = parent
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parent}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await fetch(`${GATEWAY}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, { headers });
  const j = await list.json();
  if (j.files?.length) return j.files[0].id;
  const meta: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parent) meta.parents = [parent];
  const create = await fetch(`${GATEWAY}/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  const cj = await create.json();
  if (!cj.id) throw new Error(`Folder create failed: ${JSON.stringify(cj)}`);
  return cj.id;
}

async function uploadZip(folderId: string, fileName: string, bytes: Uint8Array) {
  const headers = await driveAuth();
  const boundary = "----lovable" + crypto.randomUUID();
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  const res = await fetch(`${GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size`, {
    method: "POST",
    headers: { ...headers, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await res.json();
  if (!res.ok || !j.id) throw new Error(`Upload failed [${res.status}]: ${JSON.stringify(j)}`);
  return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireInvoker(req, corsHeaders);
  if ("response" in auth) return auth.response;



  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: run } = await supabase.from("backup_runs").insert({
    kind: "snapshot", status: "running", triggered_by: "cron",
  }).select("id").single();
  const runId = run?.id;
  const t0 = Date.now();

  try {
    const data: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const t of TABLES) {
      const { data: rows, error } = await supabase.from(t).select("*");
      if (error) { console.error(t, error.message); data[t] = []; counts[t] = 0; }
      else { data[t] = rows ?? []; counts[t] = rows?.length ?? 0; }
    }

    const zip = new JSZip();
    const now = new Date();
    zip.file("_metadata.json", JSON.stringify({
      exported_at: now.toISOString(), table_counts: counts, source: "backup-snapshot-to-drive",
    }, null, 2));
    for (const [t, rows] of Object.entries(data)) {
      zip.file(`${t}.json`, JSON.stringify(rows, null, 2));
    }
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    const yyyy = now.getUTCFullYear().toString();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const fileName = `merchanthaus-${ts}.zip`;

    const rootId = await ensureFolder(ROOT_FOLDER);
    const snapsId = await ensureFolder("snapshots", rootId);
    const yId = await ensureFolder(yyyy, snapsId);
    const mId = await ensureFolder(mm, yId);
    const up = await uploadZip(mId, fileName, bytes);

    await supabase.from("backup_runs").update({
      status: "success", finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      drive_file_id: up.id, drive_file_name: up.name, drive_web_link: up.webViewLink,
      bytes: bytes.length, table_counts: counts,
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, file: up }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("backup_runs").update({
      status: "error", finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0, error: msg,
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
