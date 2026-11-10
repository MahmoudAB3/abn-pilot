import { z, ZodError } from "zod";
import { AppError } from "./errors";
import { logger } from "./logger";
import { requireUserCtx } from "./session";
import type { UserCtx } from "./authz";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[] | undefined> };

/** Message unique pour toute erreur non prévue : aucun détail interne n'est renvoyé au client. */
const GENERIC = "Une erreur inattendue est survenue. Réessayez ou contactez un administrateur.";

export function toActionError(e: unknown): Extract<ActionResult<never>, { ok: false }> {
  if (e instanceof AppError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ZodError) return { ok: false, error: "Certains champs sont invalides.", code: "INVALID", fieldErrors: e.flatten().fieldErrors as Record<string, string[]> };
  const pg = e as { code?: string };
  if (pg?.code === "P2002") return { ok: false, error: "Cet élément existe déjà.", code: "CONFLICT" };
  logger.error({ err: e instanceof Error ? { message: e.message, stack: e.stack } : e }, "action en échec");
  return { ok: false, error: GENERIC, code: "INTERNAL" };
}

/**
 * Enveloppe d'une server action : session obligatoire, validation Zod, erreurs normalisées.
 * L'autorisation fine est faite par le service appelé (qui reçoit le contexte serveur, jamais le client).
 * Les server actions Next.js vérifient l'en-tête Origin (protection CSRF).
 */
export function action<S extends z.ZodTypeAny, R>(schema: S, handler: (input: z.infer<S>, ctx: UserCtx) => Promise<R>) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const ctx = await requireUserCtx();
      const input = schema.parse(raw);
      return { ok: true, data: await handler(input, ctx) };
    } catch (e) {
      return toActionError(e);
    }
  };
}
