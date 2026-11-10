import * as React from "react";
import { cn } from "@/lib/utils";

/** Tableau dense : lignes 36px, en-tête en petites capitales, survol et sélection. */
export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom border-collapse text-body", className)} {...props} />
    </div>
  );
}
export const TableHeader = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("bg-surface-subtle", className)} {...props} />
);
export const TableBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
);
export const TableRow = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    className={cn("border-b transition-colors hover:bg-surface-hover/60 data-[state=selected]:bg-selected", className)}
    {...props}
  />
);
export const TableHead = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn("h-8 border-b px-3 text-left align-middle text-overline-caps whitespace-nowrap text-muted-foreground", className)}
    {...props}
  />
);
export const TableCell = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("h-9 px-3 py-1.5 align-middle", className)} {...props} />
);
