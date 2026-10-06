import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import type { DocCompletenessItem } from "@/lib/report-types";

const ICON = {
  present: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  missing: <XCircle className="h-4 w-4 text-red-500" />,
  unverified: <HelpCircle className="h-4 w-4 text-amber-500" />,
} as const;

export function DocumentChecklist({ items }: { items?: DocCompletenessItem[] }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Document completeness</h4>
      <ul className="space-y-1.5">
        {items.map((d, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5">{ICON[d.status]}</span>
            <span>
              <span className="font-medium">{d.document}</span>
              {d.note && <span className="text-muted-foreground"> — {d.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
