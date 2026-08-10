import { describe, expect, it } from "vitest";

// Imported from supabase/functions/_shared on purpose.
//
// `tsc` does not cover `supabase/functions/`, so edge-function logic normally
// ships unverified by every local gate — CLAUDE.md records an incident where a
// regex edit truncated five edge functions and nothing caught it. Importing the
// pure module here pulls it into BOTH the typecheck (TypeScript follows
// imports) and the test run. The rest of the edge function still needs reading
// back by eye; this at least puts the business logic under test.
import {
  buildTeamSummary,
  cleanStr,
  deriveServiceType,
  escapeLike,
  oneBusinessDayFrom,
} from "../../supabase/functions/_shared/scoping-routing";

describe("deriveServiceType", () => {
  it("defaults to processing when nothing is selected", () => {
    expect(deriveServiceType(null)).toBe("processing");
    expect(deriveServiceType(undefined)).toBe("processing");
    expect(deriveServiceType([])).toBe("processing");
  });

  it("returns gateway_only when every route is gateway-only", () => {
    expect(deriveServiceType(["Direct API"])).toBe("gateway_only");
    expect(deriveServiceType(["Hosted payment page", "Mobile SDK"])).toBe("gateway_only");
    expect(
      deriveServiceType([
        "Direct API",
        "Hosted payment page",
        "Embedded fields/Collect.js",
        "Plugin or cart extension",
        "Mobile SDK",
      ]),
    ).toBe("gateway_only");
  });

  it("returns processing when a terminal option is present", () => {
    // This is the case the rule exists for: a gateway route alongside a
    // physical terminal is a processing deal, not a gateway-only one.
    expect(deriveServiceType(["Direct API", "Countertop/POS terminal"])).toBe("processing");
    expect(deriveServiceType(["Countertop/POS terminal"])).toBe("processing");
  });

  it("treats 'Virtual terminal only' as processing, not gateway-only", () => {
    // Easy to misread as a gateway route because it is software. It is not in
    // the gateway-only set, by decision.
    expect(deriveServiceType(["Virtual terminal only"])).toBe("processing");
    expect(deriveServiceType(["Direct API", "Virtual terminal only"])).toBe("processing");
  });

  it("treats 'Not sure — advise us' as processing", () => {
    expect(deriveServiceType(["Not sure — advise us"])).toBe("processing");
    expect(deriveServiceType(["Direct API", "Not sure — advise us"])).toBe("processing");
  });

  it("falls back to processing on unrecognised values", () => {
    // A renamed option in scopingFields.ts must never silently become
    // gateway_only. Defaulting the other way is the safe failure.
    expect(deriveServiceType(["Something New"])).toBe("processing");
    expect(deriveServiceType(["Direct API", "Something New"])).toBe("processing");
  });

  it("ignores blank entries and whitespace", () => {
    expect(deriveServiceType(["  Direct API  ", "", "   "])).toBe("gateway_only");
  });

  it("survives non-string junk in the array", () => {
    // The column is free-form text from a public form; do not assume shape.
    expect(deriveServiceType([null, 42, "Direct API"] as unknown as string[])).toBe("gateway_only");
    expect(deriveServiceType([null, 42] as unknown as string[])).toBe("processing");
  });
});

describe("oneBusinessDayFrom", () => {
  const day = (iso: string) => new Date(iso).getUTCDay();

  it("moves a weekday to the next weekday", () => {
    // Mon 10 Aug 2026 -> Tue 11 Aug
    expect(oneBusinessDayFrom(new Date("2026-08-10T09:00:00Z"))).toBe("2026-08-11T09:00:00.000Z");
  });

  it("skips the weekend from a Friday", () => {
    // Fri 14 Aug 2026 -> Mon 17 Aug, not Sat 15
    const due = oneBusinessDayFrom(new Date("2026-08-14T09:00:00Z"));
    expect(due).toBe("2026-08-17T09:00:00.000Z");
    expect(day(due)).toBe(1);
  });

  it("never lands on a Saturday or Sunday, from any starting day", () => {
    for (let i = 0; i < 14; i++) {
      const start = new Date(Date.UTC(2026, 7, 10 + i, 9, 0, 0));
      const d = day(oneBusinessDayFrom(start));
      expect(d).not.toBe(0);
      expect(d).not.toBe(6);
    }
  });

  it("does not mutate the input date", () => {
    const start = new Date("2026-08-14T09:00:00Z");
    const before = start.getTime();
    oneBusinessDayFrom(start);
    expect(start.getTime()).toBe(before);
  });
});

describe("cleanStr", () => {
  it("returns null for empty, blank and non-strings", () => {
    expect(cleanStr("")).toBeNull();
    expect(cleanStr("   ")).toBeNull();
    expect(cleanStr(null)).toBeNull();
    expect(cleanStr(undefined)).toBeNull();
    expect(cleanStr(7)).toBeNull();
  });

  it("trims and returns real values", () => {
    expect(cleanStr("  Acme Ltd ")).toBe("Acme Ltd");
  });
});

describe("escapeLike", () => {
  it("escapes the underscore wildcard, which is legal in an email", () => {
    // The bug this prevents: unescaped, jo_bloggs@x.test also matches
    // joXbloggs@x.test, attaching the submission to the wrong contact.
    expect(escapeLike("jo_bloggs@x.test")).toBe("jo\\_bloggs@x.test");
  });

  it("escapes percent", () => {
    expect(escapeLike("a%b@x.test")).toBe("a\\%b@x.test");
  });

  it("escapes backslash first so escapes are not double-escaped", () => {
    expect(escapeLike("a\\_b")).toBe("a\\\\\\_b");
  });

  it("leaves ordinary addresses untouched", () => {
    expect(escapeLike("jo.bloggs+tag@x.test")).toBe("jo.bloggs+tag@x.test");
  });
});

describe("buildTeamSummary", () => {
  it("summarises without dumping every field", () => {
    const summary = buildTeamSummary({
      legalBusinessName: "Acme Ltd",
      contactName: "Jo Bloggs",
      contactEmail: "jo@acme.test",
      monthlyVolume: "£50k-£100k",
      currentlyProcessing: "Yes",
      serviceType: "processing",
    });
    expect(summary).toContain("Acme Ltd");
    expect(summary).toContain("jo@acme.test");
    expect(summary).toContain("processing");
    expect(summary.split("\n")).toHaveLength(5);
  });

  it("renders em dashes for missing values rather than 'null'", () => {
    const summary = buildTeamSummary({
      legalBusinessName: null,
      contactName: null,
      contactEmail: null,
      monthlyVolume: null,
      currentlyProcessing: null,
      serviceType: "processing",
    });
    expect(summary).not.toContain("null");
    expect(summary).toContain("—");
  });
});
