import { cn } from "@/lib/utils";

/**
 * Monogramme ABNSoft Pilotage : un « P » accompagné d'une flèche de cap
 * montante (↗) — progresser vers la livraison. Lisible à 24px sur le rail bleu.
 */
export function PilotageMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="7" fill="currentColor" opacity="0.14" />
      <path d="M9 24V8h6.5a5 5 0 0 1 0 10H9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 24.5 24.5 18M20.5 18h4v4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">ABNSoft</span>
      <span className="text-body font-bold tracking-tight">Pilotage</span>
    </span>
  );
}
