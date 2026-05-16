import { type LucideIcon, ChevronDown, Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/hooks/useFavorites";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ListView {
  key: string;
  label: string;
}

interface ListViewHeaderProps {
  icon: LucideIcon;
  /** Small breadcrumb-style label above the title, e.g. "Leads". */
  category: string;
  /** Current list view name, e.g. "All - Leads". */
  viewLabel: string;
  /** Available list views (rendered in the dropdown). Pass [] to hide the dropdown. */
  views?: ListView[];
  onViewChange?: (key: string) => void;
  /** URL used for the pin/favorite toggle. */
  pinUrl?: string;
  /** Status sentence rendered under the title — e.g. "1 item selected" or "9 items". */
  status?: string;
  /** Right-aligned action buttons. */
  actions?: React.ReactNode;
  /** Color accent used for the icon orb. */
  color?: "primary" | "teal" | "success" | "warning";
  className?: string;
}

const orbColors = {
  primary: "bg-primary/15",
  teal: "bg-teal/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
} as const;

const iconColors = {
  primary: "text-primary",
  teal: "text-teal",
  success: "text-success",
  warning: "text-warning",
} as const;

export function ListViewHeader({
  icon: Icon,
  category,
  viewLabel,
  views = [],
  onViewChange,
  pinUrl,
  status,
  actions,
  color = "primary",
  className,
}: ListViewHeaderProps) {
  const { isFavorite, toggle } = useFavorites();
  const pinned = pinUrl ? isFavorite(pinUrl) : false;

  return (
    <div className={cn("shrink-0 border-b border-border/60 bg-background px-4 lg:px-6 pt-3 pb-2", className)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left: icon + view selector */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("h-10 w-10 rounded-md flex items-center justify-center shrink-0", orbColors[color])}>
            <Icon className={cn("h-5 w-5", iconColors[color])} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground leading-none mb-0.5">{category}</div>
            <div className="flex items-center gap-1.5">
              {views.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1 group">
                      <span className="text-base font-bold text-foreground leading-tight">{viewLabel}</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-popover min-w-[200px]">
                    <DropdownMenuLabel className="text-xs">List Views</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {views.map((v) => (
                      <DropdownMenuItem
                        key={v.key}
                        onClick={() => onViewChange?.(v.key)}
                        className="text-sm"
                      >
                        {v.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="text-base font-bold text-foreground leading-tight">{viewLabel}</span>
              )}
              {pinUrl && (
                <button
                  onClick={() => toggle(pinUrl)}
                  className={cn(
                    "h-6 w-6 rounded-sm flex items-center justify-center transition-colors",
                    pinned
                      ? "text-amber-500 hover:bg-amber-500/10"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  title={pinned ? "Unpin from favorites" : "Pin to favorites"}
                >
                  {pinned ? <Pin className="h-3.5 w-3.5 fill-current" /> : <PinOff className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            {status && (
              <div className="text-[11px] text-muted-foreground leading-none mt-1">{status}</div>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        {actions && <div className="flex items-center gap-1.5 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}
