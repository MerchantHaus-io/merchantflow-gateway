// Public, standalone rendering of the full scoping disclosures.
//
// Until now the ten disclosures existed only inside the /scoping wizard's
// step-6 review panel, so nothing could link a merchant to the full text.
// The Quick Scope form (/scope) shows a compressed four-point summary and
// links here for everything else. Deliberately plain: headings and body text,
// no chrome, no form.
import merchanthausLogo from "@/assets/merchanthaus-logo.png";
import { SCOPING_CAUTION, SCOPING_DISCLOSURES } from "@/config/scopingFields";

export default function ScopingDisclosures() {
  return (
    /* h-full + overflow-y-auto, NOT min-h-screen. src/index.css:1203 sets
       `html, body, #root { height: 100%; overflow: hidden }` globally, so the
       document itself never scrolls — a min-h-screen page taller than the
       viewport is simply cut off, with everything below the fold unreachable.
       This page is ~2600px of legal text, so all but the first screen was
       invisible. Every other public form here carries its own scroll
       container for the same reason. */
    <div className="merchant-form h-full w-full overflow-y-auto bg-background">
      <header className="bg-card border-b border-border px-3 py-2.5 md:px-4 md:py-4">
        <div className="max-w-3xl mx-auto">
          <img src={merchanthausLogo} alt="MerchantHaus" className="h-7 md:h-10 w-auto" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 md:py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Scoping form disclosures
          </h1>
          <p className="text-sm text-muted-foreground">
            These disclosures apply to the payments &amp; gateway scoping forms at{" "}
            <span className="font-medium text-foreground">/scope</span> and{" "}
            <span className="font-medium text-foreground">/scoping</span>.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {SCOPING_CAUTION}
        </div>

        <div className="space-y-6">
          {SCOPING_DISCLOSURES.map((d) => (
            <section key={d.heading} className="space-y-1.5">
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
                {d.heading}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{d.body}</p>
            </section>
          ))}
        </div>

        <p className="text-xs text-muted-foreground border-t border-border pt-6">
          Questions about any of the above? Email{" "}
          <a href="mailto:sales@merchanthaus.io" className="font-medium underline">
            sales@merchanthaus.io
          </a>
          .
        </p>
      </main>
    </div>
  );
}
