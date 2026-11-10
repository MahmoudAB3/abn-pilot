import { NextRequest, NextResponse } from "next/server";
import { getUserCtx } from "@/server/session";
import { saveAttachment } from "@/modules/issues/attachments";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

/** Téléversement (multipart) — validation de taille et de type sur le contenu. */
export async function POST(req: NextRequest) {
  const ctx = await getUserCtx();
  if (!ctx) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.nextUrl.host) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  if (!rateLimit(`upload:${ctx.userId}`, 30, 60_000).ok) return NextResponse.json({ error: "Trop de téléversements." }, { status: 429 });
  const form = await req.formData();
  const file = form.get("file");
  const issueId = String(form.get("issueId") ?? "");
  if (!(file instanceof File) || !/^c[a-z0-9]{20,30}$/.test(issueId)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  try {
    const a = await saveAttachment(ctx, issueId, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    revalidatePath("/", "layout");
    return NextResponse.json({ id: a.id, filename: a.filename });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "INVALID" ? 400 : e.code === "NOT_FOUND" ? 404 : 403 });
    throw e;
  }
}
