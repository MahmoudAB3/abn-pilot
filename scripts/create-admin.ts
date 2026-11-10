/**
 * Amorçage : crée (ou promeut) le premier administrateur — `npm run admin:create -- prenom.nom@domaine "Prénom Nom"`.
 * Le compte est « invité » : il s'active à sa première connexion Google (claim hd vérifié).
 */
import "../server/load-env";
import { db } from "../server/db";
import { getOrganization } from "../server/org";
import { audit } from "../server/audit";

async function main() {
  const email = (process.argv[2] ?? "").toLowerCase().trim();
  const name = process.argv[3] ?? null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Usage : npm run admin:create -- email@domaine.ma "Prénom Nom"');
  const org = await getOrganization();
  const user = await db.user.upsert({ where: { email }, update: name ? { name } : {}, create: { email, name } });
  const m = await db.organizationMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    update: { role: "ADMIN", status: "ACTIVE", deactivatedAt: null },
    create: { orgId: org.id, userId: user.id, role: "ADMIN", status: "INVITED" },
  });
  await audit({ orgId: org.id, actorId: null, action: "admin.bootstrap", targetType: "user", targetId: user.id, data: { email } });
  console.log(`✓ ${email} est administrateur (${m.status === "INVITED" ? "actif dès sa première connexion Google" : "actif"}).`);
}
main().catch((e) => (console.error(e.message), process.exit(1))).finally(() => db.$disconnect());
