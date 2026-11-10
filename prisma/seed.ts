/**
 * Données de démonstration (développement uniquement) — `npm run db:seed`.
 * Les tickets, transitions, sprints et commentaires passent par les services réels :
 * clés, historique, activité et notifications sont cohérents.
 * Seuls les horodatages passés (dates de complétion, relevés de burndown antérieurs à aujourd'hui,
 * activité GitHub) sont simulés pour que les graphiques aient du sens en démonstration.
 */
import "../server/load-env";
import type { OrgRole } from "@prisma/client";
import { db } from "../server/db";
import { getOrganization } from "../server/org";
import type { UserCtx } from "../server/authz";
import { createProject, createLabel, saveAutomations } from "../modules/projects/service";
import { addComment, createIssue, moveIssue, updateIssue } from "../modules/issues/service";
import { assignToSprint, completeSprint, createSprint, startSprint } from "../modules/sprints/service";
import { createMilestone, createRelease } from "../modules/releases/service";

if (process.env.NODE_ENV === "production") {
  console.error("Le jeu de démonstration ne doit pas être chargé en production.");
  process.exit(1);
}

const day = (offset: number) => new Date(new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10) + "T00:00:00Z");
const domain = (process.env.ALLOWED_GOOGLE_DOMAINS ?? "abnsoft.ma").split(",")[0]!.trim();

async function main() {
  const existing = await db.project.count();
  if (existing && !process.argv.includes("--force")) {
    console.log("La base contient déjà des projets. Relancez avec --force après `npm run db:reset` pour recharger la démo.");
    return;
  }
  const org = await getOrganization();
  const people: [string, string, OrgRole][] = [
    ["Omar Berrada", "o.berrada", "ADMIN"],
    ["Karim El Idrissi", "k.elidrissi", "PRODUCT_OWNER"],
    ["Yasmine Benali", "y.benali", "DEVELOPER"],
    ["Mehdi Tazi", "m.tazi", "DEVELOPER"],
    ["Sofia Haddad", "s.haddad", "DEVELOPER"],
    ["Nadia Ouazzani", "n.ouazzani", "VIEWER"],
  ];
  const ctx: Record<string, UserCtx> = {};
  for (const [name, local, role] of people) {
    const email = `${local}@${domain}`;
    const user = await db.user.upsert({ where: { email }, update: { name }, create: { email, name } });
    await db.organizationMembership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
      update: { role, status: "ACTIVE" },
      create: { orgId: org.id, userId: user.id, role, status: "ACTIVE", activatedAt: new Date() },
    });
    ctx[local] = { userId: user.id, orgId: org.id, role, name, email };
  }
  const admin = ctx["o.berrada"]!, po = ctx["k.elidrissi"]!, yb = ctx["y.benali"]!, mt = ctx["m.tazi"]!, sh = ctx["s.haddad"]!, dir = ctx["n.ouazzani"]!;
  const devs = [yb, mt, sh];

  // Demande d'accès en attente (pour la démo de l'approbation)
  await db.accessRequest.upsert({ where: { email: `stagiaire@${domain}` }, update: {}, create: { email: `stagiaire@${domain}`, name: "Ilyas Stagiaire", hostedDomain: domain } });

  /* ─────────────────────────── Projet 1 : Synergie ERP ─────────────────────────── */
  const erp = await createProject(po, { name: "Synergie ERP", key: "ERP", description: "Cœur ERP d'ABN Software Synergie : achats, stocks, comptabilité et facturation.", leadId: po.userId, targetDate: day(55), memberIds: [admin.userId, ...devs.map((d) => d.userId), dir.userId] });
  await saveAutomations(admin, { projectId: erp.id, autoReviewOnPrOpen: true, autoInProgressOnChangesAsked: false, autoOnMergeCategory: "IN_TEST" });
  const lbl = {
    api: await createLabel(po, { projectId: erp.id, name: "API", color: "bleu" }),
    ux: await createLabel(po, { projectId: erp.id, name: "UX", color: "rose" }),
    dette: await createLabel(po, { projectId: erp.id, name: "Dette technique", color: "gris" }),
    client: await createLabel(po, { projectId: erp.id, name: "Demande client", color: "orange" }),
  };
  const statuses = await db.workflowStatus.findMany({ where: { projectId: erp.id } });
  const st = (c: string) => statuses.find((s) => s.category === c)!.id;

  const ms1 = await createMilestone(po, { projectId: erp.id, name: "Version 3.2 — Stocks multi-dépôts", description: "Transferts, inventaires tournants et alertes.", targetDate: day(20) });
  const ms2 = await createMilestone(po, { projectId: erp.id, name: "Version 3.3 — Facturation récurrente", description: "", targetDate: day(55) });

  const epic = async (title: string, milestoneId: string) => {
    const e = await createIssue(po, { projectId: erp.id, title, description: "", type: "EPIC", priority: "HIGH", labelIds: [] });
    await updateIssue(admin, { issueId: e.id, patch: { milestoneId } });
    return e;
  };
  const e1 = await epic("Gestion des stocks multi-dépôts", ms1.id);
  const e2 = await epic("Facturation récurrente", ms2.id);
  const e3 = await epic("Tableaux de bord financiers", ms2.id);

  type Spec = { t: string; type?: "STORY" | "TASK" | "BUG"; p?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "LOWEST"; pts?: number; who?: UserCtx; epic?: string; labels?: string[]; desc?: string; due?: number };
  const mk = async (s: Spec) =>
    createIssue(po, { projectId: erp.id, title: s.t, description: s.desc ?? "", type: s.type ?? "STORY", priority: s.p ?? "MEDIUM", storyPoints: s.pts ?? null, assigneeId: s.who?.userId ?? null, parentId: s.epic ?? null, labelIds: s.labels ?? [], dueDate: s.due != null ? day(s.due) : null });

  // Sprint 1 (terminé) — 2 semaines passées
  const s1 = await createSprint(po, { projectId: erp.id, name: "Sprint 1", goal: "Fondations du module stocks", startDate: day(-28), endDate: day(-15) });
  const s1Issues = await Promise.all([
    mk({ t: "Modèle de données des dépôts et emplacements", pts: 5, who: mt, epic: e1.id, labels: [lbl.api.id] }),
    mk({ t: "Écran de liste des dépôts", pts: 3, who: sh, epic: e1.id, labels: [lbl.ux.id] }),
    mk({ t: "Historique des mouvements par article", pts: 5, who: yb, epic: e1.id }),
    mk({ t: "Index composite dépôt + article", type: "TASK", pts: 2, who: mt, epic: e1.id, labels: [lbl.dette.id] }),
    mk({ t: "Import initial des stocks depuis Excel", pts: 8, who: yb, epic: e1.id, labels: [lbl.client.id] }),
  ]);
  await assignToSprint(po, { sprintId: s1.id, issueIds: s1Issues.map((i) => i.id) });
  await startSprint(po, s1.id);
  for (const i of s1Issues.slice(0, 4)) await moveIssue(devs[0]!, { issueId: i.id, statusId: st("DONE") });
  await moveIssue(yb, { issueId: s1Issues[4]!.id, statusId: st("IN_PROGRESS") });

  // Sprint 2 (actif)
  const s2 = await createSprint(po, { projectId: erp.id, name: "Sprint 2", goal: "Transferts inter-dépôts et alertes de seuil", startDate: day(-6), endDate: day(7) });
  await completeSprint(po, { sprintId: s1.id, carryOverTo: s2.id });

  const s2Issues = {
    transfert: await mk({ t: "Transférer du stock entre deux dépôts avec bon de transfert", pts: 5, who: yb, epic: e1.id, labels: [lbl.api.id], desc: "En tant que **magasinier**, je veux transférer des articles d'un dépôt à un autre afin de rééquilibrer les stocks sans double saisie.\n\n### Critères d'acceptation\n- Le stock source est décrémenté et le stock cible incrémenté dans la même transaction\n- Un bon de transfert numéroté est généré\n- Impossible de transférer plus que la quantité disponible" }),
    pmp: await mk({ t: "Le calcul du PMP est faux après un retour fournisseur", type: "BUG", p: "CRITICAL", pts: 3, who: mt, epic: e1.id, due: -1 }),
    seuil: await mk({ t: "Alerte e-mail quand le stock passe sous le seuil", pts: 3, who: sh, epic: e1.id }),
    timeout: await mk({ t: "Timeout de l'API stocks au-delà de 5 000 articles", type: "BUG", p: "HIGH", pts: 5, who: mt, epic: e1.id, labels: [lbl.api.id] }),
    pdf: await mk({ t: "Export PDF du bon de transfert", type: "TASK", pts: 2, who: sh, epic: e1.id }),
    inventaire: await mk({ t: "Inventaire tournant par emplacement", pts: 8, epic: e1.id }),
    traduction: await mk({ t: "Traduction arabe des libellés de stock", type: "TASK", p: "LOW", pts: 1, who: yb, epic: e1.id, labels: [lbl.ux.id] }),
  };
  await assignToSprint(po, { sprintId: s2.id, issueIds: Object.values(s2Issues).map((i) => i.id) });
  await startSprint(po, s2.id);
  // Sous-tâches
  for (const t of ["Endpoint POST /transferts", "Validation de la quantité disponible", "Tests d'intégration du transfert"]) {
    const sub = await createIssue(yb, { projectId: erp.id, title: t, description: "", type: "SUBTASK", priority: "MEDIUM", parentId: s2Issues.transfert.id, sprintId: s2.id, assigneeId: yb.userId, labelIds: [] });
    if (t.startsWith("Endpoint")) await moveIssue(yb, { issueId: sub.id, statusId: st("DONE") });
  }
  await moveIssue(yb, { issueId: s2Issues.transfert.id, statusId: st("IN_PROGRESS") });
  await moveIssue(mt, { issueId: s2Issues.pmp.id, statusId: st("IN_REVIEW") });
  await moveIssue(sh, { issueId: s2Issues.seuil.id, statusId: st("IN_PROGRESS") });
  await moveIssue(mt, { issueId: s2Issues.timeout.id, statusId: st("IN_PROGRESS") });
  await updateIssue(mt, { issueId: s2Issues.timeout.id, patch: { blocked: true, blockedReason: "En attente d'un jeu de données de production anonymisé." } });
  await moveIssue(sh, { issueId: s2Issues.pdf.id, statusId: st("IN_TEST") });
  await moveIssue(yb, { issueId: s2Issues.traduction.id, statusId: st("DONE") });

  await addComment(po, { issueId: s2Issues.transfert.id, body: `Penser au cas des articles sérialisés. @[Mehdi Tazi](${mt.userId}) peux-tu valider le verrouillage côté base ?` });
  await addComment(mt, { issueId: s2Issues.transfert.id, body: "Oui : `SELECT … FOR UPDATE` sur les deux lignes de stock, dans l'ordre des identifiants pour éviter les interblocages." });
  await addComment(mt, { issueId: s2Issues.pmp.id, body: "Reproduit : le retour n'est pas pris en compte dans la quantité totale. Correctif en revue." });

  // Backlog
  await Promise.all([
    mk({ t: "Planifier la génération des factures récurrentes", pts: 8, epic: e2.id, p: "HIGH" }),
    mk({ t: "Modèles de facture paramétrables", pts: 5, epic: e2.id }),
    mk({ t: "Relances automatiques des factures impayées", pts: 5, epic: e2.id, labels: [lbl.client.id] }),
    mk({ t: "Graphique d'évolution du chiffre d'affaires", pts: 5, epic: e3.id }),
    mk({ t: "Tableau de bord trésorerie", pts: 8, epic: e3.id, labels: [lbl.ux.id] }),
    mk({ t: "Les montants négatifs s'affichent sans signe dans l'export", type: "BUG", p: "HIGH", pts: 2 }),
    mk({ t: "Nettoyer les migrations obsolètes", type: "TASK", p: "LOWEST", pts: 1, labels: [lbl.dette.id] }),
  ]);

  // Version
  const rel = await createRelease(po, { projectId: erp.id, name: "Stocks multi-dépôts", version: "3.2.0", plannedDate: day(20) });
  await db.issue.updateMany({ where: { projectId: erp.id, parentId: e1.id }, data: { releaseId: rel.id } });

  /* ─────────────────────────── Projet 2 : Portail Clients ─────────────────────────── */
  const pcl = await createProject(po, { name: "Portail Clients", key: "PCL", description: "Espace client B2B : commandes, factures et support.", leadId: po.userId, targetDate: day(90), memberIds: [sh.userId, yb.userId, dir.userId] });
  const pclEpic = await createIssue(po, { projectId: pcl.id, title: "Espace factures", description: "", type: "EPIC", priority: "MEDIUM", labelIds: [] });
  for (const [t, who] of [["Connexion SSO des clients", sh], ["Liste et téléchargement des factures", yb], ["Paiement en ligne des factures", null]] as const) {
    await createIssue(po, { projectId: pcl.id, title: t, description: "", type: "STORY", priority: "MEDIUM", storyPoints: 5, parentId: pclEpic.id, assigneeId: who?.userId ?? null, labelIds: [] });
  }

  /* ─────────────── Démonstration uniquement : horodatages passés simulés ─────────────── */
  const done = await db.issue.findMany({ where: { completedAt: { not: null } }, select: { id: true } });
  for (const [i, d] of done.entries()) await db.issue.update({ where: { id: d.id }, data: { completedAt: new Date(Date.now() - (3 + i * 9) * 86_400_000) } });
  // Relevés de burndown du sprint actif pour les jours écoulés (le relevé du jour est réel)
  const { captureSnapshot } = await import("../modules/sprints/service");
  const today = await captureSnapshot(s2.id);
  for (let d = -6; d < 0; d++) {
    const date = day(d);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const s2Total = today.totalPoints;
    const completed = Math.round(((d + 6) / 6) * today.completedPoints);
    await db.sprintSnapshot.upsert({ where: { sprintId_date: { sprintId: s2.id, date } }, update: {}, create: { sprintId: s2.id, date, totalPoints: s2Total, completedPoints: completed, totalIssues: 10, completedIssues: Math.floor(completed / 2) } });
  }

  /* ─────────────── Démonstration uniquement : activité GitHub simulée ─────────────── */
  const inst = await db.gitHubInstallation.create({ data: { orgId: org.id, installationId: 1_000_001n, accountLogin: "abnsoft-demo", accountType: "Organization", repositorySelection: "selected" } });
  const repo = await db.gitHubRepository.create({ data: { installationId: inst.id, githubId: 2_000_001n, owner: "abnsoft-demo", name: "synergie-api", fullName: "abnsoft-demo/synergie-api", private: true, htmlUrl: "https://github.com/abnsoft-demo/synergie-api" } });
  await db.projectRepository.create({ data: { projectId: erp.id, repositoryId: repo.id, linkedById: admin.userId } });
  const pr = await db.gitHubPullRequest.create({ data: { repositoryId: repo.id, githubId: 3_000_001n, number: 42, title: `${s2Issues.pmp.key}: recalcul du PMP après retour fournisseur`, authorLogin: "mtazi", headRef: `fix/${s2Issues.pmp.key}-pmp-retour`, baseRef: "develop", state: "OPEN", reviewState: "REVIEW_REQUESTED", url: "https://github.com/abnsoft-demo/synergie-api/pull/42", openedAt: new Date(Date.now() - 5 * 3600_000), githubUpdatedAt: new Date(Date.now() - 2 * 3600_000) } });
  await db.gitHubIssueLink.create({ data: { issueId: s2Issues.pmp.id, pullRequestId: pr.id } });
  await db.issueActivity.create({ data: { issueId: s2Issues.pmp.id, type: "PR_LINKED", data: { number: 42, title: pr.title, url: pr.url, repo: repo.fullName, author: "mtazi" } } });
  const c = await db.gitHubCommit.create({ data: { repositoryId: repo.id, sha: "a3f9c21b7e4d5f60718293a4b5c6d7e8f9012345", message: `${s2Issues.transfert.key} valider la quantité disponible avant transfert`, authorName: "Yasmine Benali", authorLogin: "ybenali", url: "https://github.com/abnsoft-demo/synergie-api/commit/a3f9c21", committedAt: new Date(Date.now() - 3600_000) } });
  await db.gitHubIssueLink.create({ data: { issueId: s2Issues.transfert.id, commitId: c.id } });
  await db.issueActivity.create({ data: { issueId: s2Issues.transfert.id, type: "COMMIT_LINKED", data: { sha: "a3f9c21", message: c.message, author: "ybenali", url: c.url } } });

  const counts = { utilisateurs: await db.user.count(), projets: await db.project.count(), tickets: await db.issue.count(), sprints: await db.sprint.count() };
  console.log("Démonstration chargée :", counts);
  console.log(`Comptes (connexion de développement) : ${people.map(([, l]) => `${l}@${domain}`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
