import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_hsl(348_83%_47%/0.35)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_20px_hsl(348_83%_47%/0.4),0_0_60px_hsl(348_83%_47%/0.12)] hover:-translate-y-px after:absolute after:inset-0 after:bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.08)_50%,transparent_60%)] after:bg-[length:200%_100%] after:translate-x-[-200%] hover:after:translate-x-[200%] after:transition-transform after:duration-500",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        teal: "bg-teal text-teal-foreground hover:bg-teal/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_hsl(174_72%_46%/0.35)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_20px_hsl(174_72%_46%/0.4)] hover:-translate-y-px",
        gold: "bg-gold text-gold-foreground hover:bg-gold/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_hsl(43_51%_58%/0.35)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_20px_hsl(43_51%_58%/0.4)] hover:-translate-y-px",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        xl: "h-12 px-10 text-base font-semibold rounded-lg",
        icon: "h-10 w-10",
        "icon-sm": "h-7 w-7 rounded-md",
        "icon-lg": "h-11 w-11 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        <span className={cn(loading && "opacity-60")}>{children}</span>
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
