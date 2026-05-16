import { Search, Settings2, LayoutList, RefreshCw, Pencil, BarChart3, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ListViewToolbarProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Called when user clicks the refresh icon. */
  onRefresh?: () => void;
  /** Called when user clicks the filter icon — typically toggles a filter panel. */
  onToggleFilters?: () => void;
  filtersActive?: boolean;
  /** Optional extra controls rendered to the LEFT of the search box. */
  leftControls?: React.ReactNode;
  className?: string;
}

export function ListViewToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search this list...",
  onRefresh,
  onToggleFilters,
  filtersActive = false,
  leftControls,
  className,
}: ListViewToolbarProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2 flex-wrap", className)}>
      <div className="flex items-center gap-2 flex-wrap">{leftControls}</div>
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8 h-8 w-56 text-sm"
          />
        </div>
        <ToolbarIcon icon={Settings2} title="List settings" />
        <ToolbarIcon icon={LayoutList} title="Display density" />
        <ToolbarIcon icon={RefreshCw} title="Refresh" onClick={onRefresh} />
        <ToolbarIcon icon={Pencil} title="Edit list" />
        <ToolbarIcon icon={BarChart3} title="Chart" />
        <ToolbarIcon
          icon={Filter}
          title="Filters"
          active={filtersActive}
          onClick={onToggleFilters}
        />
      </div>
    </div>
  );
}

interface ToolbarIconProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick?: () => void;
  active?: boolean;
}

function ToolbarIcon({ icon: Icon, title, onClick, active }: ToolbarIconProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "h-8 w-8 rounded-md border border-border/60 flex items-center justify-center transition-colors",
        active
          ? "bg-primary/10 text-primary border-primary/30"
          : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
