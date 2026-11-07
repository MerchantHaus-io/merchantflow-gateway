import { describe, it, expect } from "vitest";
import {
  QUOTE_STATUSES,
  CHECK_VIOLATION,
  isQuoteVoid,
  canVoidQuote,
  countsAsLiveQuote,
  isQuoteVoidRefusal,
  isWithdrawnPayload,
  voidConfirmDescription,
} from "./quote-schema";

describe("quote void helpers", () => {
  it("knows every DB status, void included", () => {
    expect(QUOTE_STATUSES).toEqual(["draft", "sent", "accepted", "rejected", "expired", "void"]);
  });

  it("any known non-void status can be voided; void and unknowns cannot", () => {
    for (const s of ["draft", "sent", "accepted", "rejected", "expired"]) {
      expect(canVoidQuote(s)).toBe(true);
    }
    expect(canVoidQuote("void")).toBe(false);
    expect(canVoidQuote("bogus")).toBe(false);
    expect(canVoidQuote(null)).toBe(false);
  });

  it("void quotes do not count as live quotes", () => {
    expect(isQuoteVoid("void")).toBe(true);
    expect(countsAsLiveQuote("void")).toBe(false);
    expect(countsAsLiveQuote("accepted")).toBe(true);
    expect(countsAsLiveQuote(null)).toBe(true);
  });

  it("recognises each DB void guard by SQLSTATE + message", () => {
    for (const message of [
      "quote_void: cannot record an acceptance against a void quote",
      "quote_void_terminal: quote Q-1 is void and cannot change status",
      "quote_void_on_insert: a quote cannot be created void",
    ]) {
      expect(isQuoteVoidRefusal({ code: CHECK_VIOLATION, message })).toBe(true);
    }
    // Another check constraint, or the right text on a different code, is not a void refusal.
    expect(isQuoteVoidRefusal({ code: CHECK_VIOLATION, message: "quotes_status_check" })).toBe(false);
    expect(isQuoteVoidRefusal({ code: "23505", message: "quote_void" })).toBe(false);
    expect(isQuoteVoidRefusal(null)).toBe(false);
  });

  it("reads the accept-quote withdrawn flag", () => {
    expect(isWithdrawnPayload({ error: "This quote has been withdrawn", withdrawn: true })).toBe(true);
    expect(isWithdrawnPayload({ error: "Quote is rejected" })).toBe(false);
    expect(isWithdrawnPayload({ withdrawn: "true" })).toBe(false);
    expect(isWithdrawnPayload(null)).toBe(false);
  });

  it("confirm text warns about partner earnings only for accepted quotes", () => {
    const accepted = voidConfirmDescription({ quoteNumber: "Q-1", businessName: "Acme", status: "accepted" });
    expect(accepted).toContain("Q-1 for Acme");
    expect(accepted).toContain("partner earnings for this merchant stop from this month");
    expect(accepted).toContain("can't be undone");

    const sent = voidConfirmDescription({ quoteNumber: "Q-2", businessName: "  ", status: "sent" });
    expect(sent).toContain("Q-2 for this merchant");
    expect(sent).not.toContain("partner earnings");
  });
});
