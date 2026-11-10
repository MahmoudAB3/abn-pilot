import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Sonde de santé (Docker / reverse proxy) : application + base de données. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", service: "ABNSoft Pilotage" });
  } catch {
    return NextResponse.json({ status: "degraded", database: "indisponible" }, { status: 503 });
  }
}
