import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import type { UserCtx } from "@/server/authz";

/**
 * Recherche globale : clé exacte, plein texte (tsvector français + index GIN) sur tickets
 * et commentaires, préfixe sur les titres, et projets. Restreinte aux projets visibles.
 */
export async function globalSearch(ctx: UserCtx, rawQ: string, opts: { projectId?: string; limit?: number } = {}) {
  const q = rawQ.trim().slice(0, 200);
  const limit = Math.min(opts.limit ?? 20, 50);
  if (!q) return { issues: [], projects: [], comments: [] };
  const visible = ctx.role === "ADMIN"
    ? Prisma.sql`p."orgId" = ${ctx.orgId}`
    : Prisma.sql`p."orgId" = ${ctx.orgId} AND EXISTS (SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id AND pm."userId" = ${ctx.userId})`;
  const projectFilter = opts.projectId ? Prisma.sql`AND i."projectId" = ${opts.projectId}` : Prisma.empty;
  const like = `${q.replace(/[%_\\]/g, (c) => `\\${c}`).toLowerCase()}%`;

  const issues = await db.$queryRaw<{ id: string; key: string; title: string; type: string; projectKey: string; statusName: string; statusCategory: string; rank: number }[]>`
    SELECT i.id, i.key, i.title, i.type::text, p.key AS "projectKey", s.name AS "statusName", s.category::text AS "statusCategory",
      (CASE WHEN i.key = upper(${q}) THEN 10 ELSE 0 END)
      + ts_rank(i."searchVector", websearch_to_tsquery('french', ${q}))
      + (CASE WHEN lower(i.title) LIKE ${like} THEN 1 ELSE 0 END) AS rank
    FROM "Issue" i
    JOIN "Project" p ON p.id = i."projectId"
    JOIN "WorkflowStatus" s ON s.id = i."statusId"
    WHERE ${visible} AND i."archivedAt" IS NULL ${projectFilter}
      AND (i.key = upper(${q}) OR i."searchVector" @@ websearch_to_tsquery('french', ${q}) OR lower(i.title) LIKE ${like})
    ORDER BY rank DESC, i."updatedAt" DESC
    LIMIT ${limit}`;

  const comments = await db.$queryRaw<{ id: string; body: string; issueKey: string; issueTitle: string }[]>`
    SELECT c.id, left(c.body, 200) AS body, i.key AS "issueKey", i.title AS "issueTitle"
    FROM "Comment" c JOIN "Issue" i ON i.id = c."issueId" JOIN "Project" p ON p.id = i."projectId"
    WHERE ${visible} AND c."deletedAt" IS NULL AND i."archivedAt" IS NULL ${projectFilter}
      AND c."searchVector" @@ websearch_to_tsquery('french', ${q})
    ORDER BY ts_rank(c."searchVector", websearch_to_tsquery('french', ${q})) DESC
    LIMIT 10`;

  const projects = await db.project.findMany({
    where: {
      orgId: ctx.orgId,
      ...(ctx.role === "ADMIN" ? {} : { members: { some: { userId: ctx.userId } } }),
      OR: [{ name: { contains: q, mode: "insensitive" } }, { key: { startsWith: q.toUpperCase() } }],
    },
    select: { id: true, key: true, name: true },
    take: 5,
  });
  return { issues, projects, comments };
}
