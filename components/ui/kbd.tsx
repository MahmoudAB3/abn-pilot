import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border-strong bg-surface-subtle px-1 font-mono text-[0.6875rem] text-muted-foreground", className)}
      {...props}
    />
  );
}
