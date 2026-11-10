import { NextResponse } from "next/server";
import { getUserCtx } from "@/server/session";
import { orgCan } from "@/server/authz";
import { installUrl } from "@/modules/github/app";
import { githubConfigured } from "@/server/env";

/** Redirige un administrateur vers l'installation de la GitHub App avec un `state` signé. */
export async function GET(req: Request) {
  const ctx = await getUserCtx();
  if (!ctx || !orgCan(ctx, "github.manage")) return new NextResponse("Accès refusé", { status: 403 });
  if (!githubConfigured()) return NextResponse.redirect(new URL("/parametres/github?erreur=configuration", req.url));
  return NextResponse.redirect(installUrl(ctx.userId));
}
