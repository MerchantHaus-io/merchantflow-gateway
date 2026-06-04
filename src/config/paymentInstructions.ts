// Receiving-bank details for the activation-fee "Payment Instructions" block.
//
// These values are deliberately NOT hardcoded as literals in this tracked file —
// the account/routing numbers must never be baked into git history. They are
// read from Vite env vars (see .env / .env.example) so they can be configured
// per environment without committing them.
//
//   VITE_MH_ACTIVATION_BANK_NAME     e.g. "Choice Financial Group (Member FDIC), via Mercury Technologies, Inc."
//   VITE_MH_ACTIVATION_ACCOUNT_NAME  e.g. "Merchant Haus LLC"
//   VITE_MH_ACTIVATION_SIGNATORY     e.g. "Taryn Engledoe"
//   VITE_MH_ACTIVATION_ROUTING       routing number
//   VITE_MH_ACTIVATION_ACCOUNT       account number
//   VITE_MH_ACTIVATION_NOTE          (optional) activation note override
//
// Note: like all VITE_ vars these are inlined into the client bundle at build
// time. That keeps them out of git history (the stated requirement); if they
// ever need to stay off the client entirely, move them to a server-side
// setting and fetch at render time.

export interface PaymentInstructions {
  bankName: string;
  accountName: string;
  signatory: string;
  routingNumber: string;
  accountNumber: string;
  /** Sentence shown beneath the bank details on the quote. */
  activationNote: string;
}

const env = import.meta.env;

const DEFAULT_ACTIVATION_NOTE =
  "The gateway account will be activated upon receipt of the activation fee payment.";

export const PAYMENT_INSTRUCTIONS: PaymentInstructions = {
  bankName: (env.VITE_MH_ACTIVATION_BANK_NAME as string) ?? "",
  accountName: (env.VITE_MH_ACTIVATION_ACCOUNT_NAME as string) ?? "",
  signatory: (env.VITE_MH_ACTIVATION_SIGNATORY as string) ?? "",
  routingNumber: (env.VITE_MH_ACTIVATION_ROUTING as string) ?? "",
  accountNumber: (env.VITE_MH_ACTIVATION_ACCOUNT as string) ?? "",
  activationNote:
    (env.VITE_MH_ACTIVATION_NOTE as string) || DEFAULT_ACTIVATION_NOTE,
};

/**
 * True when enough bank details are configured to render a meaningful block.
 * Used so a quote that charges an activation fee never shows an empty/partial
 * payment-instructions panel.
 */
export const hasPaymentInstructions = (
  p: PaymentInstructions = PAYMENT_INSTRUCTIONS,
): boolean => Boolean(p.bankName && p.routingNumber && p.accountNumber);
