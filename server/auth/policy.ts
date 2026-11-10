/**
 * Politique de connexion — fonction pure, testée unitairement.
 *
 * Le profil provient du jeton d'identité OpenID Connect de Google, dont Auth.js
 * vérifie la signature (JWKS Google), l'émetteur, l'audience, l'expiration et le state/PKCE.
 * On vérifie ensuite :
 *  1. que l'adresse est vérifiée par Google ;
 *  2. le claim `hd` (domaine Google Workspace) — jamais le seul suffixe de l'e-mail ;
 *  3. l'existence d'une invitation (ou approbation) dans la base interne ;
 *  4. que le compte n'est pas désactivé.
 */
export type SignInDecision =
  | { allow: true; activate: boolean; ensureAdmin?: true }
  | { allow: false; reason: "provider" | "email-non-verifie" | "domaine" | "en-attente" | "desactive" };

export interface GoogleClaims {
  email?: string | null;
  email_verified?: boolean | null;
  hd?: string | null;
}

export function evaluateSignIn(input: {
  provider: string;
  claims: GoogleClaims | undefined;
  allowedDomains: string[];
  membership: { status: "INVITED" | "ACTIVE" | "DEACTIVATED" } | null;
  /** Adresse listée dans SUPER_ADMIN_EMAILS : admis et (re)promu ADMIN actif, sans invitation. */
  superAdmin?: boolean;
}): SignInDecision {
  if (input.provider !== "google") return { allow: false, reason: "provider" };
  const c = input.claims;
  if (!c?.email || c.email_verified !== true) return { allow: false, reason: "email-non-verifie" };
  const hd = (c.hd ?? "").toLowerCase();
  if (!hd || !input.allowedDomains.includes(hd)) return { allow: false, reason: "domaine" };
  // Toujours après les contrôles d'identité (e-mail vérifié, claim hd) : le super-admin n'en est pas exempté.
  if (input.superAdmin) return { allow: true, activate: input.membership?.status !== "ACTIVE", ensureAdmin: true };
  if (!input.membership) return { allow: false, reason: "en-attente" };
  if (input.membership.status === "DEACTIVATED") return { allow: false, reason: "desactive" };
  return { allow: true, activate: input.membership.status === "INVITED" };
}

export const signInErrorMessages: Record<string, string> = {
  domaine: "Seuls les comptes Google Workspace de l'organisation sont acceptés.",
  "en-attente": "Votre demande d'accès a été transmise. Un administrateur doit l'approuver avant votre première connexion.",
  desactive: "Ce compte a été désactivé. Contactez un administrateur.",
  "email-non-verifie": "Votre adresse e-mail Google n'est pas vérifiée.",
  provider: "Méthode de connexion non autorisée.",
  session: "Votre session a expiré. Veuillez vous reconnecter.",
  AccessDenied: "Accès refusé.",
  Configuration: "La connexion Google n'est pas configurée sur ce serveur.",
  OAuthCallbackError: "La connexion avec Google a échoué. Réessayez.",
  default: "La connexion a échoué. Réessayez.",
};
