import * as React from "react";
import { cn } from "@/lib/utils";
import { Breadcrumb, type Crumb } from "@/components/ui/breadcrumb";

export function PageHeader({ title, description, breadcrumbs, actions, children, className }: { title: string; description?: React.ReactNode; breadcrumbs?: Crumb[]; actions?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 px-page-x pt-4 pb-3", className)}>
      {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold">{title}</h1>
          {description && <p className="mt-0.5 text-body text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function PageBody({ className, wide, ...props }: React.HTMLAttributes<HTMLDivElement> & { wide?: boolean }) {
  return <div className={cn("w-full px-page-x pb-8", !wide && "max-w-content", className)} {...props} />;
}
