// Editorial-style PDF generator for MerchantHaus gateway quotes.
//
// Layout mirrors the MerchantHaus SRR proposal house style (cover →
// scope/pricing → billing & terms → acceptance) but condensed to 3 pages
// suitable for a quote rather than a full consultative proposal.
//
// Built on jsPDF + jspdf-autotable to keep the production bundle small.
// Display headlines render in Times (built-in jsPDF serif) — close enough
// to the Playfair Display editorial mark without embedding a webfont.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import merchantHausLogo from "@/assets/merchanthaus-logo.png";
import {
  ANCILLARY_FEE_DEFAULTS,
  QUOTE_DISCLAIMERS,
  QUOTE_TERMS_VERSION,
} from "@/config/quoteSchedule";

// ─── Brand palette (RGB tuples for jsPDF) ─────────────────────────────────
const INK = [16, 18, 22] as const;       // near-black body
const MUTED = [110, 116, 124] as const;  // small caps / meta
const HAIRLINE = [205, 210, 217] as const;
const BRAND_RED = [200, 16, 46] as const; // MerchantHaus shield red
const CALLOUT_BG = [248, 245, 245] as const;
const ACCEPT_BG = [16, 18, 22] as const;
const ACCEPT_TEXT = [255, 255, 255] as const;

const PAGE_W = 612;  // US Letter @ 72dpi
const PAGE_H = 792;
const MARGIN = 54;   // ~0.75"

export interface QuotePdfLine {
  id: string;
  label: string;
  description: string;
  resale: number;
  bundled: boolean;
  perEvent?: { label: string; resale: number };
}

export interface QuotePdfAncillary {
  id: string;
  label: string;
  description: string;
  amount: number;
  cadence: "per_occurrence" | "monthly" | "annual" | "one_time";
  waived: boolean;
  waivedDescription?: string;
}

export interface QuotePdfInput {
  quoteNumber: string;
  issuedLabel: string;        // human-readable, e.g. "May 26, 2026"
  validThroughLabel: string;  // e.g. "Jun 25, 2026"
  currency: string;           // "USD"

  tierName: string;
  billingCycle: "monthly" | "annual";

  client: {
    businessName: string;
    contactName: string;
    email: string;
    phone: string;
    monthlyVolume?: string;
    averageTicket?: string;
    notes?: string;
  };

  sender: {
    name: string;
    title: string;
    company: string;
    email: string;
    phone: string;
    address: string;
  };

  platformBundleResale: number;
  lines: QuotePdfLine[];          // enabled lines only — bundled or metered
  ancillary: QuotePdfAncillary[]; // chargeback / PCI / setup / return-payment
  totals: {
    monthlyResale: number;
    annualResale: number;
    oneTime: number;
  };

  /** Public acceptance URL — embedded as the "Accept Online" CTA. */
  acceptUrl?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

const cadenceLabel = (c: QuotePdfAncillary["cadence"]) => {
  switch (c) {
    case "per_occurrence":
      return "per occurrence";
    case "monthly":
      return "monthly";
    case "annual":
      return "annual";
    case "one_time":
      return "one-time";
  }
};

const ancillaryPrice = (a: QuotePdfAncillary) => {
  if (a.waived || a.amount === 0)
    return a.waivedDescription ?? "Waived";
  return `${fmt(a.amount)} ${cadenceLabel(a.cadence)}`;
};

// ─── Reusable drawing primitives ──────────────────────────────────────────

function setFill(doc: jsPDF, c: readonly [number, number, number]) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setStroke(doc: jsPDF, c: readonly [number, number, number]) {
  doc.setDrawColor(c[0], c[1], c[2]);
}
function setText(doc: jsPDF, c: readonly [number, number, number]) {
  doc.setTextColor(c[0], c[1], c[2]);
}

/** Draws the small top metadata strip used on every interior page. */
function pageHeader(
  doc: jsPDF,
  quoteNumber: string,
  sectionLabel: string,
  pageNum: number,
  pageTotal: number,
) {
  setText(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`QUOTE № ${quoteNumber}`, MARGIN, 32, {
    charSpace: 0.8,
  } as never);
  doc.text(sectionLabel.toUpperCase(), PAGE_W / 2, 32, {
    align: "center",
    charSpace: 0.8,
  } as never);
  doc.text(`PAGE ${pageNum} / ${pageTotal}`, PAGE_W - MARGIN, 32, {
    align: "right",
    charSpace: 0.8,
  } as never);

  setStroke(doc, HAIRLINE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 38, PAGE_W - MARGIN, 38);
  setText(doc, INK);
}

/** Brand red 2-pt accent rule, used under section numbers. */
function brandRule(doc: jsPDF, x: number, y: number, w = 28) {
  setStroke(doc, BRAND_RED);
  doc.setLineWidth(1.6);
  doc.line(x, y, x + w, y);
  doc.setLineWidth(0.4);
}

function pageFooter(doc: jsPDF, sender: QuotePdfInput["sender"]) {
  setText(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    `${sender.company.toUpperCase()}  ·  ${sender.address.toUpperCase()}  ·  CONFIDENTIAL`,
    PAGE_W / 2,
    PAGE_H - 28,
    { align: "center", charSpace: 0.6 } as never,
  );
  setText(doc, INK);
}

/** Numbered section heading: "01" red, vertical rule, page label small caps. */
function sectionMark(
  doc: jsPDF,
  num: string,
  label: string,
  y: number,
) {
  setText(doc, BRAND_RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(num, MARGIN, y, { charSpace: 1.2 } as never);
  setText(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`·  ${label.toUpperCase()}`, MARGIN + 22, y, {
    charSpace: 1.2,
  } as never);
  setText(doc, INK);
}

/**
 * Renders a multi-line serif display headline.
 * Returns the y-cursor after the headline.
 */
function displayHeadline(
  doc: jsPDF,
  lines: string[],
  startY: number,
  size = 34,
  italic = false,
) {
  setText(doc, INK);
  doc.setFont("times", italic ? "italic" : "bold");
  doc.setFontSize(size);
  let y = startY;
  for (const ln of lines) {
    doc.text(ln, MARGIN, y);
    y += size * 0.95;
  }
  return y;
}

/** Small-caps eyebrow label above a section. */
function eyebrow(doc: jsPDF, text: string, y: number, x = MARGIN) {
  setText(doc, MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(text.toUpperCase(), x, y, { charSpace: 1.6 } as never);
  setText(doc, INK);
}

/** Outlined callout box (used for "WHAT'S INCLUDED", "BILLING CADENCE", etc.) */
function calloutBox(
  doc: jsPDF,
  title: string,
  body: string,
  x: number,
  y: number,
  w: number,
): number {
  const padX = 12;
  const padY = 12;
  setText(doc, INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const bodyLines = doc.splitTextToSize(body, w - padX * 2);
  const bodyH = bodyLines.length * 11;
  const totalH = padY + 12 + 6 + bodyH + padY;

  setFill(doc, CALLOUT_BG);
  setStroke(doc, HAIRLINE);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, totalH, 3, 3, "FD");

  // Red vertical bar on the left edge
  setFill(doc, BRAND_RED);
  doc.rect(x, y, 2.4, totalH, "F");

  setText(doc, MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(title.toUpperCase(), x + padX, y + padY + 2, {
    charSpace: 1.4,
  } as never);

  setText(doc, INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(bodyLines, x + padX, y + padY + 16);

  return y + totalH;
}

/** Two-column stats strip — big number above small label. */
function statsStrip(
  doc: jsPDF,
  stats: { value: string; label: string }[],
  y: number,
): number {
  const colW = (PAGE_W - MARGIN * 2) / stats.length;
  setStroke(doc, HAIRLINE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  const padTop = 14;
  stats.forEach((s, i) => {
    const x = MARGIN + i * colW;
    setText(doc, INK);
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.text(s.value, x, y + padTop + 18);
    setText(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(s.label.toUpperCase(), x, y + padTop + 32, {
      charSpace: 1.2,
    } as never);
  });

  const endY = y + padTop + 42;
  setStroke(doc, HAIRLINE);
  doc.line(MARGIN, endY, PAGE_W - MARGIN, endY);
  setText(doc, INK);
  return endY;
}

// ─── Page renderers ───────────────────────────────────────────────────────

async function renderCover(doc: jsPDF, q: QuotePdfInput, logoDataUri: string) {
  // Top metadata strip
  setText(doc, MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("PAYMENT GATEWAY QUOTE  ·  CONFIDENTIAL", MARGIN, 48, {
    charSpace: 1.2,
  } as never);

  // Logo (top right) — preserve aspect ratio, max width 110pt
  if (logoDataUri) {
    try {
      const img = new Image();
      img.src = logoDataUri;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });
      const targetW = 110;
      const targetH = (img.height / img.width) * targetW;
      doc.addImage(
        logoDataUri,
        "PNG",
        PAGE_W - MARGIN - targetW,
        38,
        targetW,
        targetH,
      );
    } catch {
      // logo is decorative — skip on failure
    }
  }

  // Hero block — sits mid-page for editorial weight
  const heroY = 220;
  setText(doc, BRAND_RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PREPARED FOR", MARGIN, heroY - 30, { charSpace: 1.6 } as never);
  brandRule(doc, MARGIN, heroY - 22, 28);

  // Big serif display headline — business name
  setText(doc, INK);
  doc.setFont("times", "bold");
  doc.setFontSize(42);
  const nameLines = doc.splitTextToSize(
    q.client.businessName || "Merchant",
    PAGE_W - MARGIN * 2,
  );
  let y = heroY + 8;
  for (const ln of nameLines.slice(0, 2)) {
    doc.text(ln, MARGIN, y);
    y += 44;
  }

  // Subtitle — Italic serif tagline
  doc.setFont("times", "italic");
  doc.setFontSize(16);
  setText(doc, MUTED);
  doc.text(
    `Gateway services — ${q.tierName} Plan, ${q.billingCycle === "annual" ? "annual" : "monthly"} billing.`,
    MARGIN,
    y + 14,
  );

  // Bottom metadata grid
  const metaY = PAGE_H - 180;
  setStroke(doc, HAIRLINE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, metaY, PAGE_W - MARGIN, metaY);

  const metaCols = [
    { label: "Quote №", value: q.quoteNumber },
    { label: "Issued", value: q.issuedLabel },
    { label: "Valid Through", value: q.validThroughLabel },
    { label: "Currency", value: q.currency },
  ];
  const colW = (PAGE_W - MARGIN * 2) / metaCols.length;
  metaCols.forEach((m, i) => {
    const x = MARGIN + i * colW;
    setText(doc, MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(m.label.toUpperCase(), x, metaY + 16, {
      charSpace: 1.4,
    } as never);
    setText(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(m.value, x, metaY + 32);
  });

  // Issuer / Recipient block
  const dpY = metaY + 60;
  setText(doc, MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("ISSUER", MARGIN, dpY, { charSpace: 1.4 } as never);
  doc.text("RECIPIENT", PAGE_W / 2 + 10, dpY, { charSpace: 1.4 } as never);

  setText(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(q.sender.company, MARGIN, dpY + 14);
  doc.text(q.client.businessName || "—", PAGE_W / 2 + 10, dpY + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, MUTED);
  const issuerLines = [
    q.sender.address,
    [q.sender.email, q.sender.phone].filter(Boolean).join("  ·  "),
  ].filter(Boolean);
  const recipientLines = [
    q.client.contactName ? `Attn: ${q.client.contactName}` : "",
    q.client.email,
    q.client.phone,
  ].filter(Boolean);
  issuerLines.forEach((ln, i) => doc.text(ln, MARGIN, dpY + 28 + i * 11));
  recipientLines.forEach((ln, i) =>
    doc.text(ln, PAGE_W / 2 + 10, dpY + 28 + i * 11),
  );

  pageFooter(doc, q.sender);
}

function renderScopeAndPricing(doc: jsPDF, q: QuotePdfInput, totalPages: number) {
  doc.addPage();
  pageHeader(doc, q.quoteNumber, "Scope & Pricing", 2, totalPages);

  let y = 78;
  sectionMark(doc, "01", "Scope & Pricing", y);
  y += 14;
  brandRule(doc, MARGIN, y, 28);
  y += 18;

  y = displayHeadline(doc, ["What's included."], y + 6, 30);
  y += 6;

  // Sub-deck
  setText(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const deck = doc.splitTextToSize(
    `The ${q.tierName} Plan bundles platform access with the gateway modules listed below. Items marked Included carry no additional charge; metered items are billed per event at the unit price shown.`,
    PAGE_W - MARGIN * 2 - 20,
  );
  doc.text(deck, MARGIN, y + 6);
  y += deck.length * 12 + 14;

  // Stats strip
  const platformLabel =
    q.billingCycle === "annual"
      ? `${fmt(q.platformBundleResale)} / mo (annual)`
      : `${fmt(q.platformBundleResale)} / mo`;
  y = statsStrip(doc, [
    { value: q.tierName, label: "Plan" },
    { value: platformLabel, label: "Platform Bundle" },
    { value: fmt(q.totals.monthlyResale), label: "Monthly Total" },
    { value: fmt(q.totals.annualResale), label: "Annualized" },
  ], y + 4);

  y += 18;

  // Line-item table
  const tableBody: string[][] = [
    [
      "Platform Bundle",
      `${q.tierName} — ${q.billingCycle === "annual" ? "Annual billing" : "Monthly billing"}`,
      `${fmt(q.platformBundleResale)} / mo`,
    ],
  ];
  q.lines.forEach((l) => {
    const detail = l.perEvent
      ? `${l.description}\nUnit: ${fmt(l.perEvent.resale)} ${l.perEvent.label}`
      : l.description;
    tableBody.push([
      l.label,
      detail,
      l.bundled ? "Included" : `${fmt(l.resale)} / mo`,
    ]);
  });
  // Ancillary disclosures
  q.ancillary.forEach((a) => {
    tableBody.push([
      a.label,
      a.description,
      ancillaryPrice(a),
    ]);
  });

  autoTable(doc, {
    startY: y,
    head: [["Item", "Detail", "Price"]],
    body: tableBody,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 8, right: 8, bottom: 8, left: 0 },
      textColor: INK as unknown as number[],
      lineColor: HAIRLINE as unknown as number[],
      lineWidth: 0,
      valign: "top",
    },
    headStyles: {
      fillColor: false as unknown as number[],
      textColor: MUTED as unknown as number[],
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: { top: 6, right: 8, bottom: 8, left: 0 },
      lineWidth: { bottom: 0.6, top: 0.6, left: 0, right: 0 },
      lineColor: INK as unknown as number[],
    },
    bodyStyles: {
      lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
      lineColor: HAIRLINE as unknown as number[],
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 145 },
      1: { textColor: MUTED as unknown as number[], cellWidth: "auto" },
      2: { halign: "right", cellWidth: 110, fontStyle: "bold" },
    },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (data) => {
      if (data.section === "head") {
        // upper-case header labels with letter spacing
        data.cell.text = data.cell.text.map((t) => t.toUpperCase());
      }
    },
  });
  // @ts-expect-error - lastAutoTable is added at runtime
  y = doc.lastAutoTable.finalY + 18;

  // Callout — clarifies bundled vs metered
  if (y < PAGE_H - 170) {
    calloutBox(
      doc,
      "Bundled vs metered",
      "Items marked Included are bundled into the Platform Bundle at no additional charge. Per-event unit prices shown alongside bundled items are informational only and not billed unless the Fee Schedule configures the line as metered.",
      MARGIN,
      y,
      PAGE_W - MARGIN * 2,
    );
  }

  pageFooter(doc, q.sender);
}

function renderBillingTermsAndAcceptance(
  doc: jsPDF,
  q: QuotePdfInput,
  totalPages: number,
) {
  // ─── Page: Billing & Terms ──────────────────────────────────────────
  doc.addPage();
  pageHeader(doc, q.quoteNumber, "Billing & Terms", 3, totalPages);

  let y = 78;
  sectionMark(doc, "02", "Billing & Terms", y);
  y += 14;
  brandRule(doc, MARGIN, y, 28);
  y += 18;

  y = displayHeadline(doc, ["Cadence, controls,", "and exit."], y + 6, 30);
  y += 10;

  // Two-column terms layout
  const colGap = 24;
  const colW = (PAGE_W - MARGIN * 2 - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + colGap;
  const colStart = y;

  const renderTermsCol = (
    x: number,
    heading: string,
    items: { label: string; body: string }[],
  ) => {
    eyebrow(doc, heading, colStart, x);
    let cy = colStart + 16;
    items.forEach((it) => {
      setText(doc, INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(it.label, x, cy);
      cy += 11;
      setText(doc, MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const body = doc.splitTextToSize(it.body, colW);
      doc.text(body, x, cy);
      cy += body.length * 10 + 8;
    });
    return cy;
  };

  const billingItems = [
    {
      label: "Cadence",
      body:
        "Recurring fees billed monthly in arrears, computed on UTC calendar boundaries, debited on the first business day of the following month.",
    },
    {
      label: "Method",
      body:
        "ACH primary, card-on-file fallback. ACH authority captured at acceptance. Accrued ancillary balances over $50 may bill more frequently.",
    },
    {
      label: "Proration",
      body:
        "Recurring fees prorate only in the first billing month following activation. One-time and ancillary fees do not prorate.",
    },
    {
      label: "Disputes",
      body:
        "Billing objections in writing within 30 days of statement date, specifying line items and grounds. Undisputed charges deemed accepted.",
    },
  ];

  const termsItems = [
    {
      label: "Term",
      body:
        "Initial term 12 months from activation, renewing monthly thereafter unless either party gives 30 days' written notice.",
    },
    {
      label: "Fee changes",
      body:
        "Provider may amend recurring fees on 30 days' written notice. Third-party pass-through cost changes may flow through immediately where externally mandated.",
    },
    {
      label: "PCI & data security",
      body:
        "Each party maintains security appropriate to its role under PCI DSS. Merchant remains responsible for its own PCI scope and lawful handling of customer data.",
    },
    {
      label: "Exit",
      body:
        "On termination, Provider cooperates in good faith on orderly wind-down and the return or migration of Merchant data, subject to payment of accrued fees.",
    },
  ];

  const leftEnd = renderTermsCol(leftX, "Billing", billingItems);
  const rightEnd = renderTermsCol(rightX, "Terms", termsItems);
  y = Math.max(leftEnd, rightEnd) + 8;

  // Master Agreement callout
  y = calloutBox(
    doc,
    "Master Agreement",
    "Acceptance of this quote constitutes the Merchant's binding agreement to the MerchantHaus Gateway Platform & Services Agreement, including Indemnification, Limitation of Liability, Arbitration, Confidentiality, and the obligations summarized above, attached or referenced as Appendix A.",
    MARGIN,
    y,
    PAGE_W - MARGIN * 2,
  );

  pageFooter(doc, q.sender);

  // ─── Page: Acceptance ───────────────────────────────────────────────
  doc.addPage();
  pageHeader(doc, q.quoteNumber, "Acceptance", 4, totalPages);

  y = 78;
  sectionMark(doc, "03", "Acceptance", y);
  y += 14;
  brandRule(doc, MARGIN, y, 28);
  y += 18;

  y = displayHeadline(doc, ["Sign to commence."], y + 6, 30);
  y += 10;

  setText(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const acceptDeck = doc.splitTextToSize(
    "Countersignature activates the Fee Schedule above and the Master Agreement summarized on the prior page. ACH authority is captured at acceptance; gateway provisioning begins within 5 business days.",
    PAGE_W - MARGIN * 2 - 20,
  );
  doc.text(acceptDeck, MARGIN, y + 6);
  y += acceptDeck.length * 12 + 14;

  // Commercial summary
  eyebrow(doc, "Summary of accepted commercial terms", y);
  y += 12;

  autoTable(doc, {
    startY: y,
    head: [["", ""]],
    body: [
      [
        `Platform Bundle (${q.tierName}, ${q.billingCycle === "annual" ? "annual" : "monthly"})`,
        `${fmt(q.platformBundleResale)} / mo`,
      ],
      ["Add-ons (fixed monthly, enabled lines)", `${fmt(q.totals.monthlyResale - q.platformBundleResale)} / mo`],
      ["Monthly total (recurring)", `${fmt(q.totals.monthlyResale)} / mo`],
      ["Annualized estimate", `${fmt(q.totals.annualResale)}`],
      ["One-time fees", `${fmt(q.totals.oneTime)}`],
    ],
    theme: "plain",
    showHead: "never",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 7, right: 8, bottom: 7, left: 0 },
      textColor: INK as unknown as number[],
      lineColor: HAIRLINE as unknown as number[],
      lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: {
        halign: "right",
        cellWidth: 160,
        fontStyle: "bold",
      },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  // @ts-expect-error - lastAutoTable is added at runtime
  y = doc.lastAutoTable.finalY + 22;

  // Accept Online CTA box
  if (q.acceptUrl) {
    const boxH = 86;
    const boxW = PAGE_W - MARGIN * 2;
    setFill(doc, ACCEPT_BG);
    doc.roundedRect(MARGIN, y, boxW, boxH, 4, 4, "F");
    // Brand red bar on the left
    setFill(doc, BRAND_RED);
    doc.rect(MARGIN, y, 3.2, boxH, "F");

    setText(doc, [255, 255, 255] as unknown as readonly [number, number, number]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("ACCEPT ONLINE", MARGIN + 18, y + 18, {
      charSpace: 1.6,
    } as never);

    setText(doc, ACCEPT_TEXT);
    doc.setFont("times", "italic");
    doc.setFontSize(18);
    doc.text("Sign instantly via secure link.", MARGIN + 18, y + 42);

    setText(doc, [200, 205, 215] as unknown as readonly [number, number, number]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const urlLines = doc.splitTextToSize(q.acceptUrl, boxW - 36);
    doc.text(urlLines.slice(0, 2), MARGIN + 18, y + 60);
    // Make it an actual hyperlink
    doc.link(MARGIN, y, boxW, boxH, { url: q.acceptUrl });
    y += boxH + 18;
    setText(doc, INK);
  }

  // Wet signature fallback
  eyebrow(doc, "Or sign by hand", y);
  y += 18;

  const sigColW = (PAGE_W - MARGIN * 2 - 30) / 2;
  // Merchant column
  setStroke(doc, INK);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y + 28, MARGIN + sigColW, y + 28);
  setText(doc, MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(
    `${(q.client.businessName || "MERCHANT").toUpperCase()}  ·  AUTHORIZED SIGNATORY`,
    MARGIN,
    y + 40,
    { charSpace: 1.2 } as never,
  );
  doc.line(MARGIN, y + 70, MARGIN + sigColW * 0.55, y + 70);
  doc.line(
    MARGIN + sigColW * 0.6,
    y + 70,
    MARGIN + sigColW,
    y + 70,
  );
  doc.text("PRINTED NAME", MARGIN, y + 82, { charSpace: 1.2 } as never);
  doc.text("TITLE", MARGIN + sigColW * 0.6, y + 82, {
    charSpace: 1.2,
  } as never);

  doc.line(MARGIN, y + 110, MARGIN + sigColW * 0.45, y + 110);
  doc.line(
    MARGIN + sigColW * 0.5,
    y + 110,
    MARGIN + sigColW,
    y + 110,
  );
  doc.text("DATE", MARGIN, y + 122, { charSpace: 1.2 } as never);
  doc.text("EMAIL", MARGIN + sigColW * 0.5, y + 122, {
    charSpace: 1.2,
  } as never);

  // MerchantHaus column
  const rx = MARGIN + sigColW + 30;
  setStroke(doc, INK);
  doc.line(rx, y + 28, rx + sigColW, y + 28);
  doc.text(`${q.sender.company.toUpperCase()}`, rx, y + 40, {
    charSpace: 1.2,
  } as never);

  setText(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(q.sender.name, rx, y + 64);
  setText(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(q.sender.title, rx, y + 76);
  if (q.sender.email) doc.text(q.sender.email, rx, y + 88);

  // Terms version stamp (audit trail)
  setText(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    `Terms version ${QUOTE_TERMS_VERSION}  ·  ${QUOTE_DISCLAIMERS.length} disclosures attached  ·  See cover for quote validity`,
    MARGIN,
    PAGE_H - 50,
    { charSpace: 0.6 } as never,
  );

  pageFooter(doc, q.sender);
}

// ─── Public entry ─────────────────────────────────────────────────────────

/**
 * Build a 4-page editorial quote PDF.
 *  Page 1 — Cover (proposal № strip, hero, particulars)
 *  Page 2 — Scope & Pricing (line-item table, callout)
 *  Page 3 — Billing & Terms (two-column, master agreement callout)
 *  Page 4 — Acceptance (commercial summary, Accept Online CTA, wet signature)
 */
export async function buildEditorialQuotePdf(
  q: QuotePdfInput,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const totalPages = 4;

  await renderCover(doc, q, merchantHausLogo);
  renderScopeAndPricing(doc, q, totalPages);
  renderBillingTermsAndAcceptance(doc, q, totalPages);

  return doc;
}
