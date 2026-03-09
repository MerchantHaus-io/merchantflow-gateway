import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-lg border bg-card text-card-foreground transition-all duration-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.035)_0%,_transparent_48px)] shadow-[0_2px_8px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04),inset_0_1px_0_rgba(255,255,255,0.06)] hover:translate-y-[-1px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.08)]",
  {
    variants: {
      variant: {
        default: "border-border",
        glass: "bg-white/[0.03] border-white/[0.08] backdrop-blur-xl",
        "glow-primary": "border-primary/25 shadow-[inset_0_0_40px_hsl(348_83%_47%/0.05),0_2px_8px_rgba(0,0,0,0.5)]",
        "glow-teal": "border-teal/25 shadow-[inset_0_0_40px_hsl(174_72%_46%/0.05),0_2px_8px_rgba(0,0,0,0.5)]",
        inset: "bg-background/50 border-border/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]",
        flat: "border-transparent shadow-none bg-transparent hover:translate-y-0 hover:shadow-none",
      },
      clickable: {
        true: "cursor-pointer hover:border-primary/40 hover:translate-y-[-3px] hover:shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_0_1px_hsl(348_83%_47%/0.3)]",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      clickable: false,
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, clickable, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant, clickable }), className)} {...props} />
  )
);
Card.displayName = "Card";

// Accent bar colors
const accentColors = {
  primary: "from-primary to-primary/60",
  teal: "from-teal to-teal/60",
  gold: "from-gold to-gold/60",
  success: "from-success to-success/60",
  warning: "from-warning to-warning/60",
} as const;

interface CardAccentBarProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: keyof typeof accentColors;
}

const CardAccentBar = React.forwardRef<HTMLDivElement, CardAccentBarProps>(
  ({ className, color = "primary", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r rounded-t-lg",
        accentColors[color],
        className
      )}
      {...props}
    />
  )
);
CardAccentBar.displayName = "CardAccentBar";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-5", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-base font-semibold leading-none tracking-tight font-display", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-5 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardAccentBar, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
