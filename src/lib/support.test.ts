import { describe, expect, it } from "vitest";
import {
  checkBlockableDomain,
  emailDomain,
  messagePreview,
  normaliseBlockedDomain,
  spamReasonLabel,
  splitQuotedText,
  statusMeta,
  TICKET_STATUSES,
} from "./support";

describe("splitQuotedText", () => {
  it("separates an 'On … wrote:' chain from the new text", () => {
    const body = "Thanks, that worked.\n\nOn Tue, Nov 4, 2026 at 9:00 AM Support <support@x.io> wrote:\n> Try again\n> please";
    expect(splitQuotedText(body)).toEqual({
      main: "Thanks, that worked.",
      quoted: "On Tue, Nov 4, 2026 at 9:00 AM Support <support@x.io> wrote:\n> Try again\n> please",
    });
  });

  it("separates an Original Message block and a forwarded From: header", () => {
    expect(splitQuotedText("Hi\n-----Original Message-----\nold").main).toBe("Hi");
    expect(splitQuotedText("See below\nFrom: Jo <jo@x.io>\nold").quoted).toBe("From: Jo <jo@x.io>\nold");
  });

  it("treats only a trailing run of > lines as quoted", () => {
    expect(splitQuotedText("New\n> old\n> older").main).toBe("New");
    expect(splitQuotedText("> quoting you\nmy answer").quoted).toBe("");
  });

  it("keeps the whole message when everything would be quoted, or nothing is", () => {
    expect(splitQuotedText("On Mon X wrote:\n> only quote")).toEqual({
      main: "On Mon X wrote:\n> only quote",
      quoted: "",
    });
    expect(splitQuotedText("plain message")).toEqual({ main: "plain message", quoted: "" });
  });
});

describe("messagePreview", () => {
  it("flattens whitespace, drops quoted text and truncates", () => {
    expect(messagePreview("Hello\n\n there\nOn A wrote:\n> x")).toBe("Hello there");
    expect(messagePreview("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
  });
});

describe("spam status", () => {
  it("is known to statusMeta but kept out of the status picker", () => {
    expect(statusMeta("spam").label).toBe("Spam");
    expect(TICKET_STATUSES.map((s) => s.value)).not.toContain("spam");
    expect(spamReasonLabel("blocked_domain")).toBe("Blocked domain");
    expect(spamReasonLabel("manual")).toBe("Marked manually");
  });
});

describe("blocked-domain helpers", () => {
  it("extracts the domain from an address or From header", () => {
    expect(emailDomain("Jo Bloggs <Jo@Spam.Example.com>")).toBe("spam.example.com");
    expect(emailDomain("a@b.com.")).toBe("b.com");
    expect(emailDomain("no address")).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });

  it("normalises like the database trigger", () => {
    expect(normaliseBlockedDomain("  Example.COM ")).toBe("example.com");
    expect(normaliseBlockedDomain("@example.com")).toBe("example.com");
    expect(normaliseBlockedDomain("*.example.com")).toBe("example.com");
    expect(normaliseBlockedDomain("example.com.")).toBe("example.com");
    expect(normaliseBlockedDomain("Spammer <x@bad.example>")).toBe("bad.example");
  });

  it("allows an ordinary company domain", () => {
    expect(checkBlockableDomain("spam-co.com")).toEqual({ ok: true, domain: "spam-co.com" });
    expect(checkBlockableDomain("x@mailer.badcorp.co.uk")).toEqual({ ok: true, domain: "mailer.badcorp.co.uk" });
  });

  it("refuses our own domain and its subdomains", () => {
    for (const d of ["merchanthaus.io", "MerchantHaus.io", "ops@merchanthaus.io", "mail.merchanthaus.io"]) {
      const r = checkBlockableDomain(d);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("internal");
    }
    // A lookalike is not ours.
    expect(checkBlockableDomain("notmerchanthaus.io").ok).toBe(true);
  });

  it("refuses shared free-mail providers, including regional variants", () => {
    for (const d of ["gmail.com", "someone@Outlook.com", "yahoo.com", "hotmail.com", "icloud.com", "yahoo.co.uk", "hotmail.fr"]) {
      const r = checkBlockableDomain(d);
      expect(r.ok, d).toBe(false);
      if (!r.ok) expect(r.reason).toBe("free_mail");
    }
  });

  it("refuses registry suffixes, empty and malformed input", () => {
    const reason = (d: string) => {
      const r = checkBlockableDomain(d);
      return r.ok ? "ok" : r.reason;
    };
    expect(reason("co.uk")).toBe("public_suffix");
    expect(reason("com.au")).toBe("public_suffix");
    expect(reason("   ")).toBe("empty");
    expect(reason("com")).toBe("invalid");
    expect(reason("bad_domain.com")).toBe("invalid");
    expect(reason("-x.com")).toBe("invalid");
  });
});
