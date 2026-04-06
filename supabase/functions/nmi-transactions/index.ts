import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NMI_TRANSACTIONS_REPORT_URL = "https://secure.nmi.com/api/v4/transactions/reports";
const MAX_RESULTS_PER_PAGE = 1000;
const MAX_REPORT_PAGES = 10;
const ALL_MODE_RETURN_LIMIT = 500;
const GATEWAY_MODE_RETURN_LIMIT = 100;
const PRIMARY_ACTION_TYPES = new Set(["sale", "capture", "refund", "credit", "void", "auth", "validate"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const nmiApiKey = Deno.env.get("NMI_API_KEY");
    if (!nmiApiKey) {
      throw new Error("NMI_API_KEY is not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { gateway_ids, start_date, end_date, mode } = body ?? {};
    const fetchMode = mode === "all" ? "all" : "gateway";
    const merchantIds = Array.isArray(gateway_ids)
      ? gateway_ids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];

    if (fetchMode === "gateway" && merchantIds.length === 0) {
      return jsonResponse({ error: "No gateway IDs provided" }, 400);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDateInput = typeof start_date === "string" && start_date.trim()
      ? start_date
      : formatCompactDate(thirtyDaysAgo);
    const endDateInput = typeof end_date === "string" && end_date.trim()
      ? end_date
      : formatCompactDate(now);

    const startIso = toIsoDateBoundary(startDateInput, "start");
    const endIso = toIsoDateBoundary(endDateInput, "end");

    console.log(`Fetching partner transactions [${fetchMode}] from ${startIso} to ${endIso}`);

    const report = await fetchTransactionsReport({
      nmiApiKey,
      merchantIds: fetchMode === "gateway" ? merchantIds : undefined,
      startIso,
      endIso,
    });

    const allTransactions = report.results.map(mapTransaction);
    const seenMerchantIds = [...new Set(allTransactions.map((tx) => tx.merchant_id).filter(Boolean))];

    console.log(`Total transactions in partner response: ${allTransactions.length}`);
    console.log(`Distinct merchant_ids: ${JSON.stringify(seenMerchantIds)}`);

    if (fetchMode === "all") {
      const summary = buildSummary(allTransactions);
      const byMerchant: Record<string, typeof allTransactions> = {};

      for (const tx of allTransactions) {
        const merchantId = tx.merchant_id || "unknown";
        if (!byMerchant[merchantId]) byMerchant[merchantId] = [];
        byMerchant[merchantId].push(tx);
      }

      const merchantSummaries = Object.entries(byMerchant).map(([merchantId, transactions]) => ({
        merchant_id: merchantId,
        transaction_count: transactions.length,
        ...buildSummary(transactions),
      }));

      return jsonResponse({
        mode: "all",
        transactions: allTransactions.slice(0, ALL_MODE_RETURN_LIMIT),
        total_count: report.totalResults,
        summary,
        merchant_summaries: merchantSummaries,
        seen_merchant_ids: seenMerchantIds,
        truncated: report.truncated,
      });
    }

    const results = merchantIds.map((gatewayId) => {
      const matched = allTransactions.filter((tx) => String(tx.merchant_id).trim() === gatewayId);
      return {
        gateway_id: gatewayId,
        transactions: matched.slice(0, GATEWAY_MODE_RETURN_LIMIT),
        summary: buildSummary(matched),
      };
    });

    return jsonResponse({
      mode: "gateway",
      results,
      _debug: {
        total_in_response: allTransactions.length,
        seen_merchant_ids: seenMerchantIds,
        truncated: report.truncated,
      },
    });
  } catch (err) {
    console.error("NMI transactions error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchTransactionsReport({
  nmiApiKey,
  merchantIds,
  startIso,
  endIso,
}: {
  nmiApiKey: string;
  merchantIds?: string[];
  startIso: string;
  endIso: string;
}) {
  const results: any[] = [];
  let offset = 0;
  let totalResults = 0;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore && pageCount < MAX_REPORT_PAGES) {
    const payload: Record<string, unknown> = {
      maxResults: String(MAX_RESULTS_PER_PAGE),
      offset: String(offset),
      date: {
        start: startIso,
        end: endIso,
      },
    };

    if (merchantIds?.length === 1) {
      payload.merchantId = merchantIds[0];
    } else if (merchantIds && merchantIds.length > 1) {
      payload.merchantIds = merchantIds;
    }

    const response = await fetch(NMI_TRANSACTIONS_REPORT_URL, {
      method: "POST",
      headers: {
        Authorization: nmiApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let parsed: any = null;

    try {
      parsed = responseText ? JSON.parse(responseText) : null;
    } catch (_error) {
      parsed = null;
    }

    if (!response.ok) {
      console.error(`NMI API HTTP error [${response.status}]:`, responseText.substring(0, 500));
      throw new Error(extractNmiError(parsed) || `NMI API returned HTTP ${response.status}`);
    }

    const pageResults = Array.isArray(parsed?.results) ? parsed.results : [];
    results.push(...pageResults);

    totalResults = toNumber(parsed?.totalResults) || results.length;
    hasMore = Boolean(parsed?.hasMore) && pageResults.length > 0;
    offset += pageResults.length;
    pageCount += 1;

    if (pageResults.length === 0) {
      break;
    }
  }

  return {
    results,
    totalResults: totalResults || results.length,
    truncated: hasMore,
  };
}

function extractNmiError(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.detail === "string") return payload.detail;

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (typeof item?.message === "string") return item.message;
        return JSON.stringify(item);
      })
      .join("; ");
  }

  return null;
}

function mapTransaction(tx: any) {
  const primaryAction = pickPrimaryAction(tx?.actions);
  const billing = tx?.billingAddress ?? {};
  const paymentInfo = tx?.paymentInfo ?? {};

  return {
    merchant_id: String(tx?.merchantId ?? ""),
    id: String(tx?.id ?? ""),
    date: String(primaryAction?.date ?? tx?.updated ?? tx?.created ?? ""),
    amount: String(primaryAction?.amount?.amount ?? tx?.amount?.amount ?? tx?.refundableBalance?.amount ?? "0.00"),
    condition: normaliseStatus(tx?.status),
    type: normaliseType(primaryAction?.actionType ?? tx?.transactionType ?? ""),
    card_type: String(paymentInfo?.cardType ?? ""),
    last_four: extractLastFour(String(paymentInfo?.cardNumber ?? "")),
    customer_name: [billing?.firstName, billing?.lastName].filter(Boolean).join(" "),
    customer_email: String(billing?.email ?? ""),
    response_text: String(primaryAction?.responseText ?? ""),
    response_code: String(primaryAction?.responseCode ?? ""),
    authorization: String(tx?.authorizationCode ?? ""),
    processor_id: String(tx?.processorId ?? ""),
    currency: String(primaryAction?.amount?.currency ?? tx?.amount?.currency ?? "USD"),
    settlement_amount: "",
    settlement_currency: "",
    avs_response: String(paymentInfo?.avsResponse ?? ""),
    cvv_response: String(paymentInfo?.cscResponse ?? ""),
    billing_city: String(billing?.city ?? ""),
    billing_state: String(billing?.state ?? ""),
    billing_zip: String(billing?.postalCode ?? ""),
    billing_country: String(billing?.country ?? ""),
    ip_address: String(primaryAction?.ipAddress ?? ""),
    platform_id: String(tx?.platformId ?? ""),
    subscription_id: String(tx?.subscriptionId ?? ""),
    merchant_defined_field_1: firstMerchantDefinedField(tx?.merchantDefinedFields),
  };
}

function pickPrimaryAction(actions: any[] | undefined) {
  if (!Array.isArray(actions) || actions.length === 0) return null;

  const sorted = [...actions].sort((a, b) => {
    const aTime = new Date(a?.date ?? 0).getTime();
    const bTime = new Date(b?.date ?? 0).getTime();
    return aTime - bTime;
  });

  const preferred = sorted.filter((action) => PRIMARY_ACTION_TYPES.has(normaliseType(action?.actionType)));
  return preferred[preferred.length - 1] ?? sorted[sorted.length - 1] ?? sorted[0] ?? null;
}

function extractLastFour(cardNumber: string) {
  const digits = cardNumber.replace(/\D/g, "");
  return digits ? digits.slice(-4) : "";
}

function firstMerchantDefinedField(fields: Record<string, unknown> | undefined) {
  if (!fields || typeof fields !== "object") return "";
  const firstValue = Object.values(fields).find((value) => value != null && `${value}`.trim().length > 0);
  return firstValue ? String(firstValue) : "";
}

function formatCompactDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function toIsoDateBoundary(input: string, boundary: "start" | "end") {
  const value = String(input).trim();

  if (/^\d{8}$/.test(value)) {
    const yyyy = value.slice(0, 4);
    const mm = value.slice(4, 6);
    const dd = value.slice(6, 8);
    return `${yyyy}-${mm}-${dd}T${boundary === "start" ? "00:00:00" : "23:59:59"}Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${boundary === "start" ? "00:00:00" : "23:59:59"}Z`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${boundary === "start" ? "start_date" : "end_date"} format`);
  }

  if (boundary === "start") {
    parsed.setUTCHours(0, 0, 0, 0);
  } else {
    parsed.setUTCHours(23, 59, 59, 999);
  }

  return parsed.toISOString();
}

function normaliseStatus(status: string | undefined) {
  const value = String(status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (value === "pendingsettlement") return "pending_settlement";
  if (value === "approved") return "complete";
  if (value === "declined") return "failed";

  return value;
}

function normaliseType(type: string | undefined) {
  return String(type ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSummary(transactions: any[]) {
  const summary = {
    total_count: transactions.length,
    approved_count: 0,
    declined_count: 0,
    total_amount: 0,
    approved_amount: 0,
    refund_count: 0,
    refund_amount: 0,
    void_count: 0,
    sale_count: 0,
    auth_count: 0,
  };

  for (const tx of transactions) {
    const amount = parseFloat(tx.amount || "0");
    const condition = normaliseStatus(tx.condition);
    const txType = normaliseType(tx.type);

    summary.total_amount += amount;

    if (["complete", "pending", "pending_settlement"].includes(condition)) {
      summary.approved_count += 1;
      summary.approved_amount += amount;
    } else {
      summary.declined_count += 1;
    }

    if (txType === "refund" || txType === "credit") {
      summary.refund_count += 1;
      summary.refund_amount += amount;
    } else if (txType === "void") {
      summary.void_count += 1;
    } else if (txType === "sale" || txType === "capture") {
      summary.sale_count += 1;
    } else if (txType === "auth") {
      summary.auth_count += 1;
    }
  }

  return summary;
}