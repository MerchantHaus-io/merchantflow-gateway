import { AlertTriangle } from "lucide-react";

// Always-visible section — a hard stop must never hide in narrative (per spec).
export function HardStops({ items }: { items?: string[] }) {
  const stops = items ?? [];
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        Hard stops
      </h4>
      {stops.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-1">
          {stops.map((s, i) => (
            <li
              key={i}
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
