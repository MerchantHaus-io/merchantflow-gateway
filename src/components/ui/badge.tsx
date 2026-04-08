import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border font-display text-[10px] tracking-[0.05em] uppercase font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success:
          "bg-[hsl(142_76%_36%/0.15)] dark:bg-[hsl(142_76%_20%)] text-[hsl(142_76%_55%)] border-[hsl(142_76%_36%/0.3)] dark:border-[hsl(142_76%_30%)]",
        warning:
          "bg-[hsl(38_92%_50%/0.15)] dark:bg-[hsl(38_60%_18%)] text-[hsl(38_92%_60%)] border-[hsl(38_92%_50%/0.3)] dark:border-[hsl(38_70%_30%)]",
        teal: "bg-[hsl(174_72%_46%/0.15)] dark:bg-[hsl(174_50%_18%)] text-[hsl(174_72%_56%)] border-[hsl(174_72%_46%/0.3)] dark:border-[hsl(174_50%_30%)]",
        muted:
          "bg-muted/60 dark:bg-muted text-muted-foreground border-border/40 dark:border-border",
        gold: "bg-[hsl(43_51%_58%/0.15)] dark:bg-[hsl(43_40%_18%)] text-[hsl(43_51%_68%)] border-[hsl(43_51%_58%/0.3)] dark:border-[hsl(43_40%_30%)]",
        violet:
          "bg-[hsl(262_83%_58%/0.15)] dark:bg-[hsl(262_50%_20%)] text-[hsl(262_83%_68%)] border-[hsl(262_83%_58%/0.3)] dark:border-[hsl(262_50%_30%)]",
      },
      size: {
        sm: "px-2 py-0.5 text-[9px]",
        md: "px-2.5 py-0.5 text-[10px]",
        lg: "px-3 py-1 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  withDot?: boolean;
  dotClass?: string;
}

function Badge({ className, variant, size, withDot, dotClass, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {withDot && (
        <span className="relative mr-1.5 flex h-2 w-2">
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current", dotClass)} />
          <span className={cn("relative inline-flex rounded-full h-2 w-2 bg-current", dotClass)} />
        </span>
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
