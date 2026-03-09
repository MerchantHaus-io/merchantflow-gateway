import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  color?: "primary" | "teal" | "success" | "warning";
  className?: string;
}

const orbColors = {
  primary: "bg-primary/15 shadow-[0_0_16px_hsl(348_83%_47%/0.3)]",
  teal: "bg-teal/15 shadow-[0_0_16px_hsl(174_72%_46%/0.3)]",
  success: "bg-success/15 shadow-[0_0_16px_hsl(142_76%_36%/0.3)]",
  warning: "bg-warning/15 shadow-[0_0_16px_hsl(38_92%_50%/0.3)]",
} as const;

const iconColors = {
  primary: "text-primary",
  teal: "text-teal",
  success: "text-success",
  warning: "text-warning",
} as const;

export function PageHeader({
  icon: Icon, title, description, actions, breadcrumb, color = "primary", className,
}: PageHeaderProps) {
  return (
    <div className={cn("shrink-0 border-b border-border/60 px-6 py-4 bg-background", className)}>
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", orbColors[color])}>
            <Icon className={cn("h-4 w-4", iconColors[color])} />
          </div>
          <div>
            <h1 className="text-lg font-bold font-display text-foreground">{title}</h1>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}
