import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "@supabase/supabase-js/cors";

/**
 * NMI Webhook Receiver
 * Handles: transaction.*, chargeback.*, settlement.*, recurring.*, acu.*
 * Configure in NMI merchant control panel → Options → Webhooks
 * Endpoint: POST /functions/v1/nmi-webhook
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const { event_id, event_type, event_body } = body;

    if (!event_type || !event_body) {
      console.warn("Invalid webhook payload — missing event_type or event_body");
      return json({ error: "Invalid webhook payload" }, 400);
    }

    console.log(`NMI webhook received: ${event_type} (event_id: ${event_id})`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Route by event type
    const [category, ...rest] = event_type.split(".");
    const action = rest.join(".");

    switch (category) {
      case "transaction":
        await handleTransaction(sb, event_type, event_body, event_id);
        break;
      case "chargeback":
        await handleChargeback(sb, event_type, event_body, event_id);
        break;
      case "settlement":
        await handleSettlement(sb, event_type, event_body, event_id);
        break;
      case "recurring":
        await handleRecurring(sb, event_type, event_body, event_id);
        break;
      case "acu":
        await handleACU(sb, event_type, event_body, event_id);
        break;
      default:
        console.log(`Unhandled webhook category: ${category}, full type: ${event_type}`);
    }

    // Always log the raw webhook
    await logWebhookEvent(sb, event_id, event_type, event_body);

    return json({ received: true, event_type });
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Still return 200 to prevent NMI retries on processing errors
    return json({ received: true, error: (err as Error).message });
  }
});

// ── Transaction events ──
async function handleTransaction(sb: any, eventType: string, body: any, eventId: string) {
  const merchantId = body.merchant?.id ?? body.merchant_id;
  const merchantName = body.merchant?.name ?? body.merchant_name;
  const txnId = body.transaction_id;
  const amount = parseFloat(body.amount) || 0;
  const action = body.action; // sale, auth, void, capture, refund, credit
  const condition = body.condition; // pendingsettlement, settled, failed

  console.log(`Transaction ${action}: ${txnId}, merchant=${merchantId}, amount=${amount}, condition=${condition}`);

  // Notify team on failures
  if (eventType.includes("failure")) {
    await notifyTeam(sb, 
      `Transaction Failed — ${merchantName || merchantId}`,
      `${action} of $${amount.toFixed(2)} failed. Transaction ID: ${txnId}`,
      "warning"
    );
  }
}

// ── Chargeback events ──
async function handleChargeback(sb: any, eventType: string, body: any, eventId: string) {
  const count = body.count || 0;
  const totalAmount = parseFloat(body.chargeback_amount) || 0;
  const chargebacks = body.chargebacks || [];

  console.log(`Chargeback batch: ${count} chargebacks totaling $${totalAmount.toFixed(2)}`);

  // Alert team immediately on chargebacks
  for (const cb of chargebacks) {
    const merchantName = cb.merchant_name || cb.customer_name || "Unknown";
    await notifyTeam(sb,
      `⚠️ Chargeback Alert — ${merchantName}`,
      `Amount: $${parseFloat(cb.amount).toFixed(2)}, Reason: ${cb.reason || "Not specified"}, Date: ${cb.date}`,
      "warning"
    );
  }

  // Post to ops-updates chat channel
  await postSystemMessage(sb,
    `⚠️ **Chargeback Batch**: ${count} chargeback(s) totaling $${totalAmount.toFixed(2)}. Review immediately.`
  );
}

// ── Settlement events ──
async function handleSettlement(sb: any, eventType: string, body: any, eventId: string) {
  const batchId = body.batch_id;
  const count = body.count || 0;
  const amount = parseFloat(body.amount) || 0;

  console.log(`Settlement batch ${batchId}: ${count} transactions, $${amount.toFixed(2)}`);

  if (eventType.includes("failure")) {
    await notifyTeam(sb,
      `🚨 Settlement Failed — Batch ${batchId}`,
      `${count} transactions failed to settle. Investigate immediately.`,
      "warning"
    );
    await postSystemMessage(sb,
      `🚨 **Settlement Failure**: Batch ${batchId} with ${count} transactions failed. Requires investigation.`
    );
  } else {
    await postSystemMessage(sb,
      `✅ **Settlement Complete**: Batch ${batchId} — ${count} transactions, $${amount.toFixed(2)} settled.`
    );
  }
}

// ── Recurring/subscription events ──
async function handleRecurring(sb: any, eventType: string, body: any, eventId: string) {
  console.log(`Recurring event: ${eventType}`, JSON.stringify(body).substring(0, 300));

  if (eventType.includes("charge.failure")) {
    const subscriptionId = body.subscription_id;
    await notifyTeam(sb,
      `Recurring Payment Failed`,
      `Subscription ${subscriptionId} charge failed. Customer may need to update payment method.`,
      "warning"
    );
  }
}

// ── Automatic Card Updater events ──
async function handleACU(sb: any, eventType: string, body: any, eventId: string) {
  const vaultUpdated = body.vault_updated_cards?.length || 0;
  const recurringUpdated = body.recurring_updated_cards?.length || 0;
  const total = vaultUpdated + recurringUpdated;

  console.log(`ACU update: ${total} cards updated (vault: ${vaultUpdated}, recurring: ${recurringUpdated})`);

  if (total > 0) {
    await postSystemMessage(sb,
      `🔄 **Card Updater**: ${total} card(s) automatically updated (${vaultUpdated} vault, ${recurringUpdated} recurring).`
    );
  }
}

// ── Helpers ──

async function logWebhookEvent(sb: any, eventId: string, eventType: string, body: any) {
  try {
    // Log to activities table as a system activity for audit trail
    await sb.from("activities").insert({
      opportunity_id: "00000000-0000-0000-0000-000000000000", // System placeholder
      type: "nmi_webhook",
      description: `NMI webhook: ${eventType} (${eventId || "no-id"})`,
      user_email: "system@ops.internal",
    }).then(() => {}).catch(() => {}); // Non-critical, don't fail on logging
  } catch {
    // Logging is non-critical
  }
}

async function notifyTeam(sb: any, title: string, message: string, type = "info") {
  try {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, email")
      .not("email", "is", null);

    for (const p of profiles || []) {
      await sb.from("notifications").insert({
        user_id: p.id,
        user_email: p.email,
        title,
        message,
        type,
        link: "/transactions",
      });
    }
  } catch (err) {
    console.warn("Failed to notify team:", err);
  }
}

async function postSystemMessage(sb: any, content: string) {
  try {
    await sb.rpc("post_system_chat_message", { p_content: content });
  } catch (err) {
    console.warn("Failed to post system message:", err);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
