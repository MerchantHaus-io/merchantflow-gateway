// Fetch a merchant website and reduce it to plain text for the underwriting
// review. Ported verbatim from the origin CRM (ai-assistant) — behavior is
// intentionally identical (script/style strip, tag strip, 15k char cap).
export async function fetchWebsiteText(
  websiteUrl: string | null | undefined,
): Promise<{ content: string; error: string }> {
  if (!websiteUrl) return { content: "", error: "" };
  try {
    const formattedUrl = websiteUrl.startsWith("http")
      ? websiteUrl
      : `https://${websiteUrl}`;
    const res = await fetch(formattedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; UnderwritingBot/1.0)",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return { content: "", error: `Website returned HTTP ${res.status}` };
    }
    const html = await res.text();
    const content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 15000);
    return { content, error: "" };
  } catch (e) {
    return {
      content: "",
      error: `Could not fetch website: ${
        e instanceof Error ? e.message : "Unknown error"
      }`,
    };
  }
}
