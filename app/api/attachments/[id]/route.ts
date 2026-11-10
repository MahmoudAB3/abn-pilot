import { NextResponse } from "next/server";
import { getUserCtx } from "@/server/session";
import { INLINE_TYPES, readAttachment } from "@/modules/issues/attachments";
import { AppError } from "@/server/errors";

/** Téléchargement authentifié ; en-têtes défensifs contre l'exécution de contenu téléversé. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserCtx();
  if (!ctx) return new NextResponse("Session expirée", { status: 401 });
  try {
    const { id } = await params;
    const { attachment, bytes } = await readAttachment(ctx, id);
    const inline = INLINE_TYPES.has(attachment.mimeType);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new NextResponse(e.message, { status: 404 });
    throw e;
  }
}
