import { DOCUMENT_TYPE_OPTIONS } from "@/components/DocumentsTab";

export interface SuggestedLabel {
  file: File;
  suggestedType: string;
  confidence: "high" | "medium" | "low";
}

const PATTERNS: { keywords: string[]; label: string }[] = [
  { keywords: ["passport", "license", "licence", "dl ", "driver", "id card", "identification"], label: "Passport/Drivers License" },
  { keywords: ["bank statement", "bank_statement", "bankstatement", "acct statement"], label: "Bank Statement" },
  { keywords: ["transaction history", "transaction_history", "txn history", "processing statement"], label: "Transaction History" },
  { keywords: ["article", "organisation", "organization", "incorporation", "formation", "certificate of formation"], label: "Articles of Organisation" },
  { keywords: ["void", "voided check", "voided_check", "bank confirmation", "bank letter", "bank_confirmation"], label: "Voided Check / Bank Confirmation Letter" },
  { keywords: ["var", "tear sheet", "tearsheet", "var sheet", "var/tear"], label: "VAR/Tear Sheet" },
  { keywords: ["ein", "employer identification", "tax id", "tax_id", "irs letter", "cp575"], label: "EIN" },
  { keywords: ["ssn", "social security", "ss card", "social_security"], label: "SSN" },
];

/**
 * Suggests a document label based on filename heuristics.
 * Returns confidence: high (strong match), medium (partial), low (no match / guess).
 */
export function suggestLabel(file: File): SuggestedLabel {
  const name = file.name.toLowerCase().replace(/[_\-\.]/g, " ");

  for (const { keywords, label } of PATTERNS) {
    for (const kw of keywords) {
      if (name.includes(kw)) {
        return { file, suggestedType: label, confidence: "high" };
      }
    }
  }

  // Partial / fuzzy match — check single keywords
  const singleKeywords: { word: string; label: string }[] = [
    { word: "passport", label: "Passport/Drivers License" },
    { word: "license", label: "Passport/Drivers License" },
    { word: "bank", label: "Bank Statement" },
    { word: "statement", label: "Bank Statement" },
    { word: "transaction", label: "Transaction History" },
    { word: "article", label: "Articles of Organisation" },
    { word: "void", label: "Voided Check / Bank Confirmation Letter" },
    { word: "check", label: "Voided Check / Bank Confirmation Letter" },
    { word: "var", label: "VAR/Tear Sheet" },
    { word: "tear", label: "VAR/Tear Sheet" },
    { word: "ein", label: "EIN" },
    { word: "tax", label: "EIN" },
    { word: "ssn", label: "SSN" },
    { word: "social", label: "SSN" },
  ];

  for (const { word, label } of singleKeywords) {
    if (name.includes(word)) {
      return { file, suggestedType: label, confidence: "medium" };
    }
  }

  return { file, suggestedType: "", confidence: "low" };
}

export function suggestLabels(files: File[]): SuggestedLabel[] {
  return files.map(suggestLabel);
}
