import { NextRequest, NextResponse } from "next/server";
import { getUserCtx } from "@/server/session";
import { globalSearch } from "@/modules/search/service";
import { recentlyViewed } from "@/modules/issues/service";
import { rateLimit } from "@/server/rate-limit";

export async function GET(req: NextRequest) {
  const ctx = await getUserCtx();
  if (!ctx) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  if (!rateLimit(`search:${ctx.userId}`, 120, 60_000).ok) return NextResponse.json({ error: "Trop de recherches." }, { status: 429 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ issues: [], projects: [], comments: [], recent: await recentlyViewed(ctx) });
  return NextResponse.json(await globalSearch(ctx, q, { limit: 12 }), { headers: { "Cache-Control": "private, no-store" } });
}
