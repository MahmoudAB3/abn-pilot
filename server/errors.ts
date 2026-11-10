/** Erreurs métier : le message est destiné à l'utilisateur (français), jamais de détail technique. */
export class AppError extends Error {
  constructor(
    public code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID" | "UNAUTHENTICATED" | "RATE_LIMITED" | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "Vous n'avez pas les droits nécessaires pour cette action.") => new AppError("FORBIDDEN", msg);
export const notFound = (msg = "Élément introuvable.") => new AppError("NOT_FOUND", msg);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const invalid = (msg: string) => new AppError("INVALID", msg);
export const unauthenticated = () => new AppError("UNAUTHENTICATED", "Votre session a expiré. Veuillez vous reconnecter.");
