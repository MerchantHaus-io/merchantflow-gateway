// Send an email through the connected Google Workspace account via the Lovable
// connector gateway. Used for support@merchanthaus.io outbound mail so replies
// thread inside Gmail.

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const b64url = (s: string): string => {
  // deno-lint-ignore no-explicit-any
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export interface GmailSendOpts {
  from: string;          // e.g. "Merchant Haus Support <support@merchanthaus.io>"
  to: string;
  subject: string;
  html: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  inReplyTo?: string;    // RFC Message-ID for threading
  references?: string;
  threadId?: string;     // Gmail thread id
}

export async function sendGmail(opts: GmailSendOpts): Promise<{ ok: boolean; error?: string; id?: string; threadId?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
    return { ok: false, error: "Gmail connector not configured" };
  }

  const joinAddr = (v?: string | string[]) =>
    Array.isArray(v) ? v.filter(Boolean).join(", ") : (v || "");

  const headers: string[] = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
  ];
  const cc = joinAddr(opts.cc);
  const bcc = joinAddr(opts.bcc);
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headers.push(`References: ${opts.references}`);

  const raw = b64url(headers.join("\r\n") + "\r\n\r\n" + opts.html);

  const body: Record<string, unknown> = { raw };
  if (opts.threadId) body.threadId = opts.threadId;

  const res = await fetch(`${GATEWAY}/users/me/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Gmail send failed", res.status, text);
    return { ok: false, error: `${res.status}: ${text}` };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, id: data.id, threadId: data.threadId };
}
