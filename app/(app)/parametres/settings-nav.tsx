"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections des paramètres" className="flex gap-4 overflow-x-auto border-b">
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn("-mb-px h-9 shrink-0 border-b-2 border-transparent text-body font-medium text-muted-foreground hover:text-foreground", active && "border-primary text-primary-text")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
