import { describe, expect, it } from "vitest";
import {
  accountNameFor,
  buildLeadNotes,
  leadProblems,
  leadToForm,
  normaliseEmail,
  normalisePhone,
  normaliseWebsite,
  scaledSize,
  type LeadForm,
} from "./leadIntake";

const blank: LeadForm = {
  first_name: "", last_name: "", email: "", phone: "", company: "", website: "",
  lead_source: "", notes: "", email_subject: "", email_body: "",
};

describe("leadToForm", () => {
  it("cleans and normalises what the AI returned", () => {
    const form = leadToForm({
      first_name: "  Jane ",
      last_name: "Smith",
      email: " MAILTO:Jane@Acme.COM ",
      phone: "Tel: +1 (555) 123-4567 ext",
      company: "Acme   Coffee",
      website: "https://www.Acme.com/menu",
      lead_source: "WhatsApp",
      summary: "Coffee shop wanting cheaper processing.",
      current_processor: "Square",
      email_subject: "Quick idea\nfor Acme",
      email_body: "Hi Jane,\r\n\r\nThanks!",
    });
    expect(form).toMatchObject({
      first_name: "Jane",
      email: "jane@acme.com",
      phone: "+1 (555) 123-4567",
      company: "Acme Coffee",
      website: "acme.com",
      lead_source: "WhatsApp",
      email_subject: "Quick idea for Acme",
      email_body: "Hi Jane,\n\nThanks!",
    });
    expect(form.notes).toBe("Coffee shop wanting cheaper processing.\nCurrent processor: Square");
  });

  it("leaves missing fields empty instead of inventing them", () => {
    expect(leadToForm({})).toEqual(blank);
  });
});

describe("normalisers", () => {
  it("email", () => expect(normaliseEmail(" Bob@X.io ")).toBe("bob@x.io"));
  it("phone keeps only phone characters", () => expect(normalisePhone("call 555.123.4567!")).toBe("555.123.4567"));
  it("website keeps a bare host", () => {
    expect(normaliseWebsite("http://shop.example.co.uk/a?b")).toBe("shop.example.co.uk");
    expect(normaliseWebsite("not a site")).toBe("");
  });
});

describe("buildLeadNotes", () => {
  it("joins location parts and skips empty lines", () => {
    expect(buildLeadNotes({ city: "Austin", state: "TX", monthly_volume: "$40k" })).toBe(
      "Location: Austin, TX\nMonthly volume: $40k",
    );
  });
});

describe("accountNameFor", () => {
  it("prefers company, then person, then email", () => {
    expect(accountNameFor({ ...blank, company: "Acme", first_name: "Jane", email: "j@a.com" })).toBe("Acme");
    expect(accountNameFor({ ...blank, first_name: "Jane", last_name: "Smith", email: "j@a.com" })).toBe("Jane Smith");
    expect(accountNameFor({ ...blank, email: " J@A.com " })).toBe("j@a.com");
  });
});

describe("leadProblems", () => {
  it("requires a valid, external email to save", () => {
    expect(leadProblems(blank, { sending: false })).toEqual(["Add the lead's email address."]);
    expect(leadProblems({ ...blank, email: "nope" }, { sending: false })).toEqual(["The email address doesn't look right."]);
    expect(leadProblems({ ...blank, email: "rep@merchanthaus.io" }, { sending: false })).toHaveLength(1);
    expect(leadProblems({ ...blank, email: "j@acme.com" }, { sending: false })).toEqual([]);
  });

  it("also requires subject and body to send", () => {
    expect(leadProblems({ ...blank, email: "j@acme.com" }, { sending: true })).toEqual([
      "Add a subject line.",
      "The email body is empty.",
    ]);
  });
});

describe("scaledSize", () => {
  it("shrinks the longest edge to the cap and keeps aspect ratio", () => {
    expect(scaledSize(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
