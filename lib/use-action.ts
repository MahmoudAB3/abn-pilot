"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/sonner";
import type { ActionResult } from "@/server/action";

/**
 * Exécute une server action avec état de chargement, toast d'erreur en français
 * et rafraîchissement des données serveur en cas de succès.
 */
export function useAction<I, O>(fn: (input: I) => Promise<ActionResult<O>>, opts: { success?: string | ((o: O) => string); refresh?: boolean } = {}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    async (input: I): Promise<ActionResult<O>> => {
      setPending(true);
      try {
        const r = await fn(input);
        if (!r.ok) {
          toast.error(r.error);
          if (r.code === "UNAUTHENTICATED") router.push("/connexion?erreur=session");
        } else {
          if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r.data) : opts.success);
          if (opts.refresh !== false) router.refresh();
        }
        return r;
      } catch {
        toast.error("Connexion au serveur impossible. Vérifiez votre réseau.");
        return { ok: false, error: "réseau" };
      } finally {
        setPending(false);
      }
    },
    [fn, opts, router],
  );
  return { run, pending };
}
