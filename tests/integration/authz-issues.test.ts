import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { projectAccess } from "@/server/authz";
import { createProject, upsertMember } from "@/modules/projects/service";
import { addComment, archiveIssue, createIssue, deleteIssue, moveIssue, restoreIssue, updateIssue, bulkUpdate } from "@/modules/issues/service";
import { makeTeam, makeUser, resetDb, statusByCategory } from "../helpers";

let t: Awaited<ReturnType<typeof makeTeam>>;
beforeEach(async () => {
  await resetDb();
  t = await makeTeam();
});

describe("autorisation des projets", () => {
  it("l'administrateur accède à tous les projets, même sans en être membre", async () => {
    const a = await projectAccess(t.admin, { id: t.project.id });
    expect(a.can("repo.link")).toBe(true);
  });
  it("un développeur membre peut créer et déplacer, pas planifier les sprints", async () => {
    const a = await projectAccess(t.dev, { key: "ERP" });
    expect(a.can("issue.create") && a.can("board.move")).toBe(true);
    expect(a.can("sprint.manage") || a.can("issue.delete") || a.can("repo.link")).toBe(false);
  });
  it("un observateur est en lecture seule", async () => {
    await expect(createIssue(t.viewer, { projectId: t.project.id, title: "Tentative", description: "", type: "TASK", priority: "MEDIUM", labelIds: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const issue = await createIssue(t.dev, { projectId: t.project.id, title: "Ticket", description: "", type: "TASK", priority: "MEDIUM", labelIds: [] });
    const done = await statusByCategory(t.project.id, "DONE");
    await expect(moveIssue(t.viewer, { issueId: issue.id, statusId: done.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("un non-membre ne voit pas le projet (introuvable, pas « interdit »)", async () => {
    await expect(projectAccess(t.outsider, { key: "ERP" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const issue = await createIssue(t.dev, { projectId: t.project.id, title: "Secret", description: "", type: "TASK", priority: "MEDIUM", labelIds: [] });
    await expect(updateIssue(t.outsider, { issueId: issue.id, patch: { title: "Piraté" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("une appartenance observateur rétrograde un Product Owner", async () => {
    const po2 = await makeUser("PRODUCT_OWNER");
    await upsertMember(t.po, { projectId: t.project.id, userId: po2.userId, role: "VIEWER" });
    const a = await projectAccess(po2, { id: t.project.id });
    expect(a.permissions).toEqual(["project.view"]);
  });
  it("un développeur ne peut pas créer de projet", async () => {
    await expect(createProject(t.dev, { name: "X", key: "XX", description: "", memberIds: [], targetDate: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("la clé de projet est unique", async () => {
    await expect(createProject(t.po, { name: "Doublon", key: "ERP", description: "", memberIds: [], targetDate: null })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("tickets", () => {
  const base = { description: "", type: "TASK" as const, priority: "MEDIUM" as const, labelIds: [] };

  it("génère des clés séquentielles et uniques, même en parallèle", async () => {
    const created = await Promise.all(Array.from({ length: 12 }, (_, i) => createIssue(t.dev, { ...base, projectId: t.project.id, title: `Ticket ${i}` })));
    const keys = created.map((c) => c.key).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
    expect(keys).toEqual(Array.from({ length: 12 }, (_, i) => `ERP-${i + 1}`));
  });

  it("garde des clés stables après renommage du projet", async () => {
    const i = await createIssue(t.dev, { ...base, projectId: t.project.id, title: "Avant renommage" });
    await db.project.update({ where: { id: t.project.id }, data: { name: "Nouveau nom" } });
    const j = await createIssue(t.dev, { ...base, projectId: t.project.id, title: "Après renommage" });
    expect([i.key, j.key]).toEqual(["ERP-1", "ERP-2"]);
  });

  it("assigne, notifie l'assigné et journalise l'activité", async () => {
    const issue = await createIssue(t.po, { ...base, projectId: t.project.id, title: "À assigner" });
    await updateIssue(t.po, { issueId: issue.id, patch: { assigneeId: t.dev.userId, priority: "HIGH" } });
    const notif = await db.notification.findMany({ where: { userId: t.dev.userId } });
    expect(notif).toHaveLength(1);
    expect(notif[0]!.type).toBe("ASSIGNED");
    const types = (await db.issueActivity.findMany({ where: { issueId: issue.id } })).map((a) => a.type).sort();
    expect(types).toEqual(["ASSIGNED", "CREATED", "UPDATED"]);
  });

  it("refuse d'assigner un non-membre ou un observateur", async () => {
    const issue = await createIssue(t.po, { ...base, projectId: t.project.id, title: "Assignation" });
    await expect(updateIssue(t.po, { issueId: issue.id, patch: { assigneeId: t.outsider.userId } })).rejects.toMatchObject({ code: "INVALID" });
    await expect(updateIssue(t.po, { issueId: issue.id, patch: { assigneeId: t.viewer.userId } })).rejects.toMatchObject({ code: "INVALID" });
  });

  it("enregistre les transitions de statut et la date de complétion", async () => {
    const issue = await createIssue(t.dev, { ...base, projectId: t.project.id, title: "Transition" });
    const doing = await statusByCategory(t.project.id, "IN_PROGRESS");
    const done = await statusByCategory(t.project.id, "DONE");
    await moveIssue(t.dev, { issueId: issue.id, statusId: doing.id });
    await moveIssue(t.dev, { issueId: issue.id, statusId: done.id });
    const history = await db.issueStatusHistory.findMany({ where: { issueId: issue.id }, orderBy: { changedAt: "asc" } });
    expect(history.map((h) => h.toStatusId)).toEqual([expect.any(String), doing.id, done.id]);
    expect((await db.issue.findUniqueOrThrow({ where: { id: issue.id } })).completedAt).not.toBeNull();
    await moveIssue(t.dev, { issueId: issue.id, statusId: doing.id });
    expect((await db.issue.findUniqueOrThrow({ where: { id: issue.id } })).completedAt).toBeNull();
  });

  it("refuse un statut d'un autre projet", async () => {
    const other = await createProject(t.po, { name: "Portail", key: "PCL", description: "", memberIds: [t.dev.userId], targetDate: null });
    const foreign = await statusByCategory(other.id, "DONE");
    const issue = await createIssue(t.dev, { ...base, projectId: t.project.id, title: "Statut étranger" });
    await expect(moveIssue(t.dev, { issueId: issue.id, statusId: foreign.id })).rejects.toMatchObject({ code: "INVALID" });
  });

  it("préserve l'intégrité parent / sous-tâche", async () => {
    const epic = await createIssue(t.po, { ...base, projectId: t.project.id, title: "Épopée", type: "EPIC" });
    const story = await createIssue(t.po, { ...base, projectId: t.project.id, title: "Story", type: "STORY", parentId: epic.id });
    await expect(createIssue(t.dev, { ...base, projectId: t.project.id, title: "Sous-tâche orpheline", type: "SUBTASK" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(createIssue(t.dev, { ...base, projectId: t.project.id, title: "Sous-tâche d'épopée", type: "SUBTASK", parentId: epic.id })).rejects.toMatchObject({ code: "INVALID" });
    const sub = await createIssue(t.dev, { ...base, projectId: t.project.id, title: "Sous-tâche", type: "SUBTASK", parentId: story.id });
    expect(sub.parentId).toBe(story.id);
    // La story ne peut pas devenir une épopée tant qu'elle a des sous-tâches
    await expect(updateIssue(t.po, { issueId: story.id, patch: { type: "EPIC", parentId: null } })).rejects.toMatchObject({ code: "CONFLICT" });
    // Pas de cycle
    await expect(updateIssue(t.po, { issueId: story.id, patch: { parentId: story.id } })).rejects.toMatchObject({ code: "INVALID" });
    // Archiver la story archive ses sous-tâches
    await archiveIssue(t.po, story.id);
    expect((await db.issue.findUniqueOrThrow({ where: { id: sub.id } })).archivedAt).not.toBeNull();
    await restoreIssue(t.po, story.id);
  });

  it("archive puis supprime ; un développeur ne peut pas archiver", async () => {
    const issue = await createIssue(t.dev, { ...base, projectId: t.project.id, title: "À supprimer" });
    await expect(archiveIssue(t.dev, issue.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteIssue(t.po, issue.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await archiveIssue(t.po, issue.id);
    await deleteIssue(t.po, issue.id);
    expect(await db.issue.count({ where: { id: issue.id } })).toBe(0);
  });

  it("notifie les mentions dans les commentaires", async () => {
    const issue = await createIssue(t.po, { ...base, projectId: t.project.id, title: "Mention" });
    await addComment(t.po, { issueId: issue.id, body: `Peux-tu regarder @[Dev](${t.dev2.userId}) ?` });
    const n = await db.notification.findMany({ where: { userId: t.dev2.userId } });
    expect(n.map((x) => x.type)).toEqual(["MENTIONED"]);
  });

  it("modifications groupées limitées à un projet", async () => {
    const a = await createIssue(t.po, { ...base, projectId: t.project.id, title: "A" });
    const b = await createIssue(t.po, { ...base, projectId: t.project.id, title: "B" });
    await bulkUpdate(t.po, { issueIds: [a.id, b.id], patch: { priority: "CRITICAL" } });
    expect((await db.issue.findMany({ where: { id: { in: [a.id, b.id] } } })).every((i) => i.priority === "CRITICAL")).toBe(true);
    const other = await createProject(t.po, { name: "Autre", key: "OTH", description: "", memberIds: [], targetDate: null });
    const c = await createIssue(t.po, { ...base, projectId: other.id, title: "C" });
    await expect(bulkUpdate(t.po, { issueIds: [a.id, c.id], patch: { priority: "LOW" } })).rejects.toMatchObject({ code: "INVALID" });
  });
});
