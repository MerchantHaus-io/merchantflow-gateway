import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: { icon: "h-10 w-10", iconInner: "h-5 w-5", title: "text-sm", desc: "text-xs", py: "py-8" },
  md: { icon: "h-14 w-14", iconInner: "h-6 w-6", title: "text-base", desc: "text-sm", py: "py-12" },
  lg: { icon: "h-16 w-16", iconInner: "h-8 w-8", title: "text-lg", desc: "text-sm", py: "py-16" },
} as const;

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function EmptyState({
  icon: Icon, title, description, actionLabel, onAction,
  secondaryLabel, onSecondary, size = "md", className,
}: EmptyStateProps) {
  const s = sizeMap[size];
  return (
    <div className={cn("flex flex-col items-center text-center", s.py, className)}>
      <div className={cn(
        "rounded-xl bg-primary/10 flex items-center justify-center mb-4",
        "shadow-[0_0_24px_hsl(348_83%_47%/0.15)]",
        s.icon
      )}>
        <Icon className={cn(s.iconInner, "text-primary")} />
      </div>
      <p className={cn("font-semibold font-display text-foreground mb-1", s.title)}>{title}</p>
      {description && (
        <p className={cn("text-muted-foreground max-w-xs mb-4", s.desc)}>{description}</p>
      )}
      <div className="flex items-center gap-2">
        {actionLabel && onAction && (
          <Button size="sm" onClick={onAction}>{actionLabel}</Button>
        )}
        {secondaryLabel && onSecondary && (
          <Button size="sm" variant="ghost" onClick={onSecondary}>{secondaryLabel}</Button>
        )}
      </div>
    </div>
  );
}
