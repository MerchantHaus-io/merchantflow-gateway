// Public T&Cs page — /terms-processing
//
// Renders the binding agreement text from the shared single-source-of-truth
// content module at src/content/termsAndConditions.ts. The same content is
// embedded as Appendix B of the Merchant Services Agreement PDF, so an
// edit there updates every artifact.

import merchanthausLogo from "@/assets/merchanthaus-logo.png";
import { TermsContent } from "@/content/TermsAndConditionsRenderer";
import { QUOTE_TERMS_VERSION } from "@/config/quoteSchedule";

// Re-export so existing imports of TermsContent from this module keep working.
export { TermsContent };

export default function TermsProcessing() {
  return (
    <div
      className="fixed inset-0 z-50 bg-background overflow-y-auto"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <header className="bg-card border-b border-border px-3 py-2.5 md:px-4 md:py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <img
            src={merchanthausLogo}
            alt="MerchantHaus"
            className="h-7 md:h-10 w-auto"
          />
          <a
            href="/merchant-apply"
            className="text-xs text-primary hover:underline"
          >
            ← Back to Application
          </a>
        </div>
      </header>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
          Merchant Terms and Conditions
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Version {QUOTE_TERMS_VERSION}
        </p>
        <TermsContent />
        <div className="mt-12 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} MerchantHaus LLC. All rights reserved.
            <br />
            These Terms and Conditions are proprietary to MerchantHaus LLC and may
            not be reproduced without permission.
          </p>
        </div>
      </div>
    </div>
  );
}
