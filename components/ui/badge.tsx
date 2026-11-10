import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Badge générique. Les badges métier (statut, priorité, étiquette) en dérivent. */
export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm font-semibold [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "bg-status-afaire-bg text-status-afaire-fg",
        primary: "bg-selected text-selected-foreground",
        success: "bg-success-subtle text-success-subtle-foreground",
        warning: "bg-warning-subtle text-warning-subtle-foreground",
        danger: "bg-destructive-subtle text-destructive-subtle-foreground",
        info: "bg-info-subtle text-info-subtle-foreground",
        outline: "border border-border-strong text-fg-secondary",
        count: "min-w-5 justify-center rounded-full bg-surface-active px-1.5 text-caption text-fg-secondary",
      },
      size: {
        sm: "h-4 px-1 text-[0.6875rem] leading-4",
        md: "h-5 px-1.5 text-caption",
      },
      caps: { true: "uppercase tracking-[0.03em]", false: "" },
    },
    defaultVariants: { variant: "neutral", size: "md", caps: false },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, caps, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, size, caps }), className)} {...props} />;
}
