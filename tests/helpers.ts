import type { OrgRole } from "@prisma/client";
import { db } from "@/server/db";
import { getOrganization } from "@/server/org";
import type { UserCtx } from "@/server/authz";
import { createProject } from "@/modules/projects/service";

/** Vide toutes les tables applicatives (ordre géré par CASCADE). */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function makeUser(role: OrgRole, status: "ACTIVE" | "INVITED" | "DEACTIVATED" = "ACTIVE"): Promise<UserCtx> {
  const org = await getOrganization();
  n++;
  const email = `${role.toLowerCase()}${n}@abnsoft.ma`;
  const user = await db.user.create({ data: { email, name: `${role} ${n}` } });
  await db.organizationMembership.create({ data: { orgId: org.id, userId: user.id, role, status } });
  return { userId: user.id, orgId: org.id, role, name: user.name!, email };
}

export async function makeTeam() {
  const admin = await makeUser("ADMIN");
  const po = await makeUser("PRODUCT_OWNER");
  const dev = await makeUser("DEVELOPER");
  const dev2 = await makeUser("DEVELOPER");
  const viewer = await makeUser("VIEWER");
  const outsider = await makeUser("DEVELOPER");
  const project = await createProject(po, { name: "Synergie ERP", key: "ERP", description: "", memberIds: [dev.userId, dev2.userId, viewer.userId], leadId: po.userId, targetDate: null });
  return { admin, po, dev, dev2, viewer, outsider, project };
}

export async function statusByCategory(projectId: string, category: string) {
  return db.workflowStatus.findFirstOrThrow({ where: { projectId, category: category as never }, orderBy: { position: "asc" } });
}
