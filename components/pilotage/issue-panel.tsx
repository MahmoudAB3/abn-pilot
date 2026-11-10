"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { IssueDetailView } from "./issue-detail";

const Ctx = React.createContext<{ open: (key: string) => void; current?: string }>({ open: () => {} });
export const useIssuePanel = () => React.useContext(Ctx);

/**
 * Panneau latéral de détail : l'URL porte ?ticket=ERP-14, donc le lien est partageable
 * et le bouton « Précédent » du navigateur ferme le panneau.
 */
export function IssuePanelProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("ticket") ?? undefined;
  const setKey = React.useCallback(
    (key?: string) => {
      const p = new URLSearchParams(params.toString());
      if (key) p.set("ticket", key);
      else p.delete("ticket");
      const qs = p.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [params, pathname, router],
  );
  return (
    <Ctx.Provider value={{ open: setKey, current }}>
      {children}
      <Sheet open={!!current} onOpenChange={(o) => !o && setKey(undefined)}>
        <SheetContent side="right" className="sm:max-w-[min(42rem,100vw)]" hideClose aria-describedby={undefined}>
          <SheetTitle className="sr-only">Détail du ticket {current}</SheetTitle>
          <SheetDescription className="sr-only">Panneau de détail</SheetDescription>
          {current && <IssueDetailView key={current} issueKey={current} onClose={() => setKey(undefined)} />}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}
