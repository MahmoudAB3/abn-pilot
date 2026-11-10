import { NextResponse } from "next/server";
import { getUserCtx } from "@/server/session";
import { getIssueDetail } from "@/modules/issues/service";
import { AppError } from "@/server/errors";
import { renderMarkdown } from "@/lib/markdown";

/** Détail d'un ticket pour le panneau latéral (TanStack Query). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getUserCtx();
  if (!ctx) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  try {
    const { key } = await params;
    const d = await getIssueDetail(ctx, key);
    const json = JSON.parse(JSON.stringify(d, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    json.issue.descriptionHtml = renderMarkdown(d.issue.description);
    json.issue.comments = d.issue.comments.map((c) => ({ ...JSON.parse(JSON.stringify(c)), html: renderMarkdown(c.body) }));
    json.viewer = { id: ctx.userId, isAdmin: ctx.role === "ADMIN" };
    return NextResponse.json(json, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "NOT_FOUND" ? 404 : 403 });
    throw e;
  }
}
