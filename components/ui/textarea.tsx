import * as React from "react";
import { cn } from "@/lib/utils";
import { inputBase } from "./input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} data-slot="textarea" className={cn(inputBase, "min-h-20 py-1.5 leading-5", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";
