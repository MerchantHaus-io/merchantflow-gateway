import { type LucideIcon, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const colorMap = {
  primary:     { bg: "bg-primary/10",     text: "text-primary",        icon: "text-primary" },
  teal:        { bg: "bg-teal/10",        text: "text-teal",           icon: "text-teal" },
  success:     { bg: "bg-success/10",     text: "text-success",        icon: "text-success" },
  warning:     { bg: "bg-warning/10",     text: "text-warning",        icon: "text-warning" },
  destructive: { bg: "bg-destructive/10", text: "text-destructive",    icon: "text-destructive" },
  violet:      { bg: "bg-[hsl(262_83%_58%/0.1)]", text: "text-[hsl(262_83%_68%)]", icon: "text-[hsl(262_83%_68%)]" },
  muted:       { bg: "bg-muted/60",       text: "text-foreground",     icon: "text-muted-foreground" },
} as const;

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: keyof typeof colorMap;
  change?: number;
  changeSuffix?: string;
  sub?: string;
  onClick?: () => void;
  watermarkIcon?: LucideIcon;
}

export function StatCard({
  label, value, icon: Icon, color = "primary",
  change, changeSuffix = "", sub, onClick, watermarkIcon: WatermarkIcon,
}: StatCardProps) {
  const c = colorMap[color];
  return (
    <Card
      clickable={!!onClick}
      onClick={onClick}
      className={cn("relative overflow-hidden", onClick && "cursor-pointer")}
    >
      {WatermarkIcon && (
        <WatermarkIcon className="absolute -right-3 -bottom-3 h-20 w-20 text-foreground/[0.03] pointer-events-none" />
      )}
      <div className="p-4 relative">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", c.bg)}>
            <Icon className={cn("h-4 w-4", c.icon)} />
          </div>
          {change !== undefined && (
            <span className={cn(
              "text-[10px] font-medium flex items-center gap-0.5",
              change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"
            )}>
              {change > 0 ? <ArrowUpRight className="h-3 w-3" /> : change < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-2.5 w-2.5" />}
              {change > 0 ? "+" : ""}{change}{changeSuffix}
            </span>
          )}
        </div>
        <p className={cn("text-2xl font-bold font-display tabular-nums tracking-tight", c.text)}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-1">{sub}</p>}
      </div>
    </Card>
  );
}
