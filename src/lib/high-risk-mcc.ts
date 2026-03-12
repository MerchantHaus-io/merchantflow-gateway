/**
 * High-risk MCC codes that typically require reserves,
 * delayed funding, or enhanced monitoring.
 */
export const HIGH_RISK_MCC_CODES: Record<string, string> = {
  "4816": "Computer Network Services",
  "5122": "Drugs, Drug Proprietors",
  "5912": "Drug Stores, Pharmacies",
  "5962": "Direct Marketing – Travel",
  "5966": "Direct Marketing – Outbound Telemarketing",
  "5967": "Direct Marketing – Inbound Teleservices",
  "5968": "Direct Marketing – Continuity/Subscription",
  "5969": "Direct Marketing – Not Elsewhere Classified",
  "6051": "Non-Financial Institutions – Foreign Currency/Money Orders",
  "6211": "Security Brokers/Dealers",
  "6513": "Real Estate Agents and Managers – Rentals",
  "7012": "Timeshares",
  "7273": "Dating/Escort Services",
  "7297": "Massage Parlors",
  "7801": "Government-Licensed Online Casinos (Gambling)",
  "7802": "Government-Licensed Horse/Dog Racing",
  "7995": "Betting/Casino Gambling",
  "8641": "Civic, Social, Fraternal Associations",
  "8651": "Political Organizations",
  "8661": "Religious Organizations",
  "9223": "Bail and Bond Payments",
  "9311": "Tax Payments",
};

/**
 * Returns the risk tier for a given MCC code.
 * "high_risk" if in the known high-risk list, otherwise "standard".
 */
export function getMccRiskTier(mccCode: string | null | undefined): "high_risk" | "standard" {
  if (!mccCode) return "standard";
  return HIGH_RISK_MCC_CODES[mccCode.trim()] ? "high_risk" : "standard";
}

/**
 * Returns the high-risk description if the MCC is flagged.
 */
export function getHighRiskLabel(mccCode: string | null | undefined): string | null {
  if (!mccCode) return null;
  return HIGH_RISK_MCC_CODES[mccCode.trim()] || null;
}
