import { Check, X } from "lucide-react";
import type { WebsiteRequirement } from "@/lib/report-types";
import { scoreColor } from "@/lib/report-format";

export function WebsiteReview({
  requirements,
  websiteScore,
}: {
  requirements?: WebsiteRequirement[];
  websiteScore?: number;
}) {
  if (!requirements?.length && websiteScore == null) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Website review</h4>
        {websiteScore != null && (
          <span className={`text-sm font-semibold ${scoreColor(websiteScore)}`}>
            {websiteScore}/100
          </span>
        )}
      </div>
      {requirements?.length ? (
        <ul className="space-y-1.5">
          {requirements.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">
                {r.met ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </span>
              <span>
                <span className="font-medium">{r.requirement}</span>
                {r.detail && <span className="text-muted-foreground"> — {r.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
