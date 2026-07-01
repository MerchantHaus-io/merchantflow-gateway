// Branded savings-proposal PDF for the Statement Analyzer tool.
//
// Turns a benchmarked processing statement into a clean, merchant-facing
// "cost savings review" proposal on MerchantHaus letterhead. Built on the same
// jsPDF + jspdf-autotable stack as quotePdf.ts to keep the bundle small.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import merchantHausLogo from "@/assets/merchanthaus-logo.png";
import {
  ExtractedStatement,
  BenchmarkResult,
  fmtCurrency,
  fmtPct,
} from "@/lib/statement-analysis";

const INK: [number, number, number] = [16, 18, 22];
const MUTED: [number, number, number] = [110, 116, 124];
const HAIRLINE: [number, number, number] = [205, 210, 217];
const BRAND_RED: [number, number, number] = [200, 16, 46];
const CALLOUT_BG: [number, number, number] = [248, 245, 245];
const SAVINGS_BG: [number, number, number] = [16, 18, 22];

const PAGE_W = 612;
const MARGIN = 54;

export interface ProposalMeta {
  merchantName: string;
  currentProcessor: string;
  statementPeriod: string;
  preparedBy?: string;
  /** e.g. "July 1, 2026" — passed in so the module stays deterministic. */
  dateLabel: string;
}

function loadLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = merchantHausLogo;
  });
}

export async function generateStatementProposalPdf(
  statement: ExtractedStatement,
  r: BenchmarkResult,
  meta: ProposalMeta,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  // Preload logo so the synchronous addImage doesn't race.
  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadLogo();
  } catch {
    logo = null;
  }

  // ─── Header ──────────────────────────────────────────────────────────────
  if (logo) doc.addImage(logo, "PNG", MARGIN, 44, 132, 29);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("MERCHANT COST SAVINGS REVIEW", PAGE_W - MARGIN, 52, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(meta.dateLabel, PAGE_W - MARGIN, 64, { align: "right" });

  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, 86, PAGE_W - MARGIN, 86);

  // ─── Title block ─────────────────────────────────────────────────────────
  doc.setTextColor(...INK);
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.text("Payment Processing Savings Proposal", MARGIN, 122);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const sub = `Prepared for ${meta.merchantName || "your business"}${
    meta.currentProcessor ? ` — currently with ${meta.currentProcessor}` : ""
  }${meta.statementPeriod ? ` · statement period ${meta.statementPeriod}` : ""}.`;
  doc.text(doc.splitTextToSize(sub, PAGE_W - MARGIN * 2), MARGIN, 142);

  // ─── Headline savings callout ────────────────────────────────────────────
  const calloutY = 168;
  const calloutH = 92;
  doc.setFillColor(...SAVINGS_BG);
  doc.roundedRect(MARGIN, calloutY, PAGE_W - MARGIN * 2, calloutH, 8, 8, "F");

  const colW = (PAGE_W - MARGIN * 2) / 3;
  const drawStat = (
    x: number,
    value: string,
    label: string,
    accent: [number, number, number] = [255, 255, 255],
  ) => {
    doc.setTextColor(...accent);
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.text(value, x + colW / 2, calloutY + 42, { align: "center" });
    doc.setTextColor(190, 194, 200);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), x + colW / 2, calloutY + 62, { align: "center" });
  };

  const savingsAccent: [number, number, number] =
    r.monthlySavings > 0 ? [122, 226, 158] : [255, 255, 255];
  drawStat(MARGIN, fmtCurrency(Math.max(0, r.monthlySavings)), "Est. monthly savings", savingsAccent);
  drawStat(MARGIN + colW, fmtCurrency(Math.max(0, r.annualSavings)), "Est. annual savings", savingsAccent);
  drawStat(
    MARGIN + colW * 2,
    r.savingsPct > 0 ? `${r.savingsPct.toFixed(0)}%` : "—",
    "Fee reduction",
    savingsAccent,
  );

  // ─── Current vs proposed comparison table ────────────────────────────────
  let cursorY = calloutY + calloutH + 26;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Your current program vs. MerchantHaus", MARGIN, cursorY);
  cursorY += 8;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    head: [["", "Current program", "MerchantHaus program"]],
    body: [
      ["Monthly processing volume", fmtCurrency(r.volume), fmtCurrency(r.volume)],
      ["Transactions", r.txCount.toLocaleString(), r.txCount.toLocaleString()],
      ["Total monthly fees", fmtCurrency(r.currentFees), fmtCurrency(r.proposedFeesTotal)],
      ["Effective rate", fmtPct(r.effectiveRate), fmtPct(r.proposedEffectiveRate)],
      [
        "Processor markup over cost",
        `${fmtCurrency(r.currentMarkup)} (${fmtPct(r.currentMarkupPct)})`,
        `${fmtCurrency(r.proposedMarkup + r.proposedMonthly)} (${fmtPct(
          r.volume > 0 ? ((r.proposedMarkup + r.proposedMonthly) / r.volume) * 100 : 0,
        )})`,
      ],
    ],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 6, textColor: INK },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontSize: 8, halign: "left" },
    columnStyles: {
      0: { cellWidth: 200, textColor: MUTED },
      1: { halign: "right" },
      2: { halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: CALLOUT_BG },
  });

  // @ts-expect-error - lastAutoTable is added at runtime by jspdf-autotable
  cursorY = doc.lastAutoTable.finalY + 24;

  // Start a fresh page whenever the cursor is too low to fit `needed` points
  // of upcoming content above the footer band.
  const ensureSpace = (needed: number) => {
    if (cursorY + needed > 700) {
      doc.addPage();
      cursorY = 60;
    }
  };

  // ─── Flags / what we found ───────────────────────────────────────────────
  if (r.flags.length > 0) {
    ensureSpace(40);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("What we found on your statement", MARGIN, cursorY);
    cursorY += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const flag of r.flags) {
      const lines = doc.splitTextToSize(flag, PAGE_W - MARGIN * 2 - 14);
      ensureSpace(lines.length * 12 + 4);
      doc.setTextColor(...BRAND_RED);
      doc.text("•", MARGIN, cursorY);
      doc.setTextColor(...INK);
      doc.text(lines, MARGIN + 14, cursorY);
      cursorY += lines.length * 12 + 4;
    }
    cursorY += 10;
  }

  // ─── Junk fee list ───────────────────────────────────────────────────────
  if (r.junkFeeItems.length > 0) {
    ensureSpace(48);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Padding & junk fees identified", MARGIN, cursorY);
    cursorY += 8;
    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN, right: MARGIN, bottom: 80 },
      theme: "plain",
      body: r.junkFeeItems.map((i) => [i.label, fmtCurrency(i.amount)]),
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3, textColor: INK },
      columnStyles: { 1: { halign: "right", textColor: BRAND_RED, fontStyle: "bold" } },
    });
    // @ts-expect-error - lastAutoTable is added at runtime by jspdf-autotable
    cursorY = doc.lastAutoTable.finalY + 20;
  }

  // ─── Footer note ─────────────────────────────────────────────────────────
  // Keep the footer band clear of body content on the final page.
  if (cursorY > 690) {
    doc.addPage();
  }
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 726, PAGE_W - MARGIN, 726);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  const disclaimer =
    "Savings estimates are based on the figures shown on the submitted statement and industry-standard interchange & assessment benchmarks. Actual results depend on card mix, ticket size and final approved pricing. This document is a proposal, not a binding offer.";
  doc.text(doc.splitTextToSize(disclaimer, PAGE_W - MARGIN * 2), MARGIN, 740);
  if (meta.preparedBy) {
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(`Prepared by ${meta.preparedBy}`, PAGE_W - MARGIN, 764, { align: "right" });
  }

  return doc;
}
