// Editorial-style PDF generator for MerchantHaus invoices & receipts.
// Mirrors the brand palette and editorial flow of src/lib/quotePdf.ts so that
// invoices and receipts feel like a direct continuation of the quote.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import merchantHausLogo from "@/assets/merchanthaus-logo.png";
import { stripInternalCostRefs } from "@/lib/redactCost";

// ─── Brand palette (RGB tuples for jsPDF) ─────────────────────────────────
const INK = [16, 18, 22] as const;
const MUTED = [110, 116, 124] as const;
const HAIRLINE = [205, 210, 217] as const;
const BRAND_RED = [200, 16, 46] as const;
const CALLOUT_BG = [248, 245, 245] as const;
const PAID_GREEN = [22, 101, 52] as const;

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;

export interface BillingDocLine {
  label: string;
  description?: string;
  qty: number;
  unit_price: number;
  amount: number;
  cadence?: string;
}

export interface BillingDocAncillary {
  label: string;
  description?: string;
  amount: number;
  cadence: string;
  waived: boolean;
}

export interface BillingDocPdfInput {
  docType: "invoice" | "receipt";
  docNumber: string;
  issuedLabel: string;
  dueLabel?: string;
  paidLabel?: string;
  periodLabel?: string;
  currency: string;

  tierName?: string;
  billingCycle?: "monthly" | "annual";

  merchant: {
    name: string;
    contact?: string;
    email?: string;
    phone?: string;
    address?: string;
    merchantId?: string;
  };

  sender: {
    name: string;
    title: string;
    company: string;
    email: string;
    phone: string;
    address: string;
  };

  lines: BillingDocLine[];
  ancillary?: BillingDocAncillary[];

  subtotal: number;
  tax?: number;
  total: number;
  amountPaid?: number;

  notes?: string;
}

const formatMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);

const setColor = (doc: jsPDF, rgb: readonly [number, number, number] | readonly number[]) => {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
};

const setFill = (doc: jsPDF, rgb: readonly [number, number, number] | readonly number[]) => {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
};

const setDraw = (doc: jsPDF, rgb: readonly [number, number, number] | readonly number[]) => {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
};

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(merchantHausLogo);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildBillingDocPdf(input: BillingDocPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const eyebrow = input.docType === "invoice" ? "MERCHANTHAUS · INVOICE" : "MERCHANTHAUS · RECEIPT";
  const headline = input.docType === "invoice" ? "Invoice" : "Receipt";

  const logo = await loadLogo();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", MARGIN, MARGIN - 4, 36, 36);
    } catch { /* ignore */ }
  }

  // Eyebrow
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setColor(doc, BRAND_RED);
  doc.text(eyebrow, MARGIN + 48, MARGIN + 10, { charSpace: 1.4 });

  // Headline (Times serif)
  doc.setFont("times", "normal");
  doc.setFontSize(34);
  setColor(doc, INK);
  doc.text(headline, MARGIN + 48, MARGIN + 36);

  // Right side meta
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(doc, MUTED);
  const rightX = PAGE_W - MARGIN;
  let metaY = MARGIN + 8;
  const metaLine = (label: string, value: string) => {
    setColor(doc, MUTED);
    doc.text(label.toUpperCase(), rightX, metaY, { align: "right", charSpace: 1.2 });
    setColor(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.text(value, rightX, metaY + 11, { align: "right" });
    doc.setFont("helvetica", "normal");
    metaY += 26;
  };
  metaLine("Document", input.docNumber);
  metaLine("Issued", input.issuedLabel);
  if (input.docType === "invoice" && input.dueLabel) metaLine("Due", input.dueLabel);
  if (input.docType === "receipt" && input.paidLabel) metaLine("Paid", input.paidLabel);
  if (input.periodLabel) metaLine("Period", input.periodLabel);

  // Hairline rule
  let y = MARGIN + 90;
  setDraw(doc, HAIRLINE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 22;

  // Bill-to / From two-column
  const colW = (PAGE_W - MARGIN * 2 - 24) / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setColor(doc, MUTED);
  doc.text("BILL TO", MARGIN, y, { charSpace: 1.2 });
  doc.text("FROM", MARGIN + colW + 24, y, { charSpace: 1.2 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  setColor(doc, INK);
  let ly = y + 14;
  const lh = 13;
  const billTo = [
    input.merchant.name,
    input.merchant.contact,
    input.merchant.email,
    input.merchant.phone,
    input.merchant.address,
    input.merchant.merchantId ? `MID: ${input.merchant.merchantId}` : null,
  ].filter(Boolean) as string[];
  billTo.forEach((line, i) => {
    if (i === 0) doc.setFont("helvetica", "bold");
    doc.text(line, MARGIN, ly + i * lh);
    if (i === 0) doc.setFont("helvetica", "normal");
  });

  const fromTo = [
    input.sender.company || "MerchantHaus LLC",
    input.sender.name,
    input.sender.title,
    input.sender.email,
    input.sender.phone,
    input.sender.address,
  ].filter(Boolean) as string[];
  fromTo.forEach((line, i) => {
    if (i === 0) doc.setFont("helvetica", "bold");
    doc.text(line, MARGIN + colW + 24, ly + i * lh);
    if (i === 0) doc.setFont("helvetica", "normal");
  });

  y = ly + Math.max(billTo.length, fromTo.length) * lh + 14;

  // Tier subtitle
  if (input.tierName) {
    doc.setFont("times", "italic");
    doc.setFontSize(11);
    setColor(doc, MUTED);
    doc.text(
      `${input.tierName} Plan · ${input.billingCycle === "annual" ? "Annual" : "Monthly"} billing`,
      MARGIN,
      y,
    );
    y += 18;
  }

  // Line items table
  autoTable(doc, {
    startY: y,
    head: [["Description", "Qty", "Unit", "Amount"]],
    body: input.lines.map((l) => {
      // Scrub partner-cost/markup text (e.g. from a pre-fix catalog snapshot)
      // before it prints on the merchant invoice.
      const desc = stripInternalCostRefs(l.description);
      return [
        desc ? `${l.label}\n${desc}` : l.label,
        String(l.qty),
        formatMoney(l.unit_price, input.currency),
        formatMoney(l.amount, input.currency),
      ];
    }),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: { top: 8, right: 6, bottom: 8, left: 6 },
      textColor: [INK[0], INK[1], INK[2]],
      lineColor: [HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]],
      lineWidth: 0.5,
    },
    headStyles: {
      fontStyle: "bold",
      fontSize: 8,
      textColor: [MUTED[0], MUTED[1], MUTED[2]],
      fillColor: false as any,
      lineWidth: { top: 0, bottom: 0.6, left: 0, right: 0 } as any,
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 40, halign: "right" },
      2: { cellWidth: 70, halign: "right" },
      3: { cellWidth: 80, halign: "right", fontStyle: "bold" },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // @ts-expect-error autotable extends doc
  y = (doc.lastAutoTable?.finalY ?? y) + 12;

  // Totals
  const totalsX = PAGE_W - MARGIN - 200;
  const totalsW = 200;
  setDraw(doc, HAIRLINE);
  doc.line(totalsX, y, totalsX + totalsW, y);
  y += 14;
  const totalsRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 10);
    setColor(doc, bold ? INK : MUTED);
    doc.text(label, totalsX, y);
    setColor(doc, INK);
    doc.text(value, totalsX + totalsW, y, { align: "right" });
    y += 16;
  };
  totalsRow("Subtotal", formatMoney(input.subtotal, input.currency));
  if (input.tax && input.tax > 0) totalsRow("Tax", formatMoney(input.tax, input.currency));
  totalsRow("Total", formatMoney(input.total, input.currency), true);

  if (input.docType === "receipt") {
    totalsRow("Amount paid", formatMoney(input.amountPaid ?? input.total, input.currency), true);
    // PAID stamp
    setColor(doc, PAID_GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("PAID", MARGIN, y - 6, { charSpace: 4 });
    setDraw(doc, PAID_GREEN);
    doc.setLineWidth(1.5);
    doc.rect(MARGIN - 6, y - 28, 90, 32);
  } else if (input.dueLabel) {
    setColor(doc, BRAND_RED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Payment due ${input.dueLabel}`, MARGIN, y);
  }

  y += 20;

  // Notes / disclaimer
  if (input.notes) {
    setFill(doc, CALLOUT_BG);
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 0, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(doc, INK);
    const wrapped = doc.splitTextToSize(input.notes, PAGE_W - MARGIN * 2 - 24);
    setFill(doc, CALLOUT_BG);
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, wrapped.length * 12 + 16, "F");
    doc.text(wrapped, MARGIN + 12, y + 14);
    y += wrapped.length * 12 + 24;
  }

  // Footer
  const footerY = PAGE_H - MARGIN + 8;
  setDraw(doc, HAIRLINE);
  doc.line(MARGIN, footerY - 14, PAGE_W - MARGIN, footerY - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, MUTED);
  doc.text("MerchantHaus LLC · 1209 Mountain Road Pl NE Ste N, Albuquerque, NM 87110", MARGIN, footerY);
  doc.text(input.docNumber, PAGE_W - MARGIN, footerY, { align: "right" });

  return doc.output("blob");
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const result = r.result as string;
      resolve(result.split(",")[1] || "");
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
