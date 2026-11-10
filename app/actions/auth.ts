"use server";
import { signIn, signOut } from "@/server/auth";

export async function signInWithGoogle(formData: FormData) {
  const retour = String(formData.get("retour") ?? "/tableau-de-bord");
  // Seuls les chemins internes sont acceptés (pas de redirection ouverte)
  await signIn("google", { redirectTo: retour.startsWith("/") && !retour.startsWith("//") ? retour : "/tableau-de-bord" });
}

/** Déconnexion : la session est supprimée en base (Auth.js), le cookie effacé. */
export async function signOutAction() {
  await signOut({ redirectTo: "/connexion" });
}
