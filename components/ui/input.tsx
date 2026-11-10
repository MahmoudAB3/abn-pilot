import * as React from "react";
import { cn } from "@/lib/utils";

export const inputBase =
  "w-full min-w-0 rounded-md border border-input bg-card px-2.5 text-body text-foreground transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-border-strong focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-disabled aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} data-slot="input" className={cn(inputBase, "h-8", className)} {...props} />
  ),
);
Input.displayName = "Input";
