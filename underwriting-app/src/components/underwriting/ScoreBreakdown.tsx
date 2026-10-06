import type { ScoreBreakdownItem } from "@/lib/report-types";
import { scoreColor } from "@/lib/report-format";

export function ScoreBreakdown({ items }: { items?: ScoreBreakdownItem[] }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Score breakdown</h4>
      <div className="space-y-2">
        {items.map((it, i) => {
          const pct = it.max_score ? Math.round((it.score / it.max_score) * 100) : 0;
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{it.category}</span>
                <span className={scoreColor(pct)}>
                  {it.score}/{it.max_score}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              {it.note && <p className="text-xs text-muted-foreground">{it.note}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
