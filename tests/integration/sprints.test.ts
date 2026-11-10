import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { assignToSprint, completeSprint, createSprint, sprintReport, startSprint, velocity } from "@/modules/sprints/service";
import { createIssue, moveIssue } from "@/modules/issues/service";
import { makeTeam, resetDb, statusByCategory } from "../helpers";

let t: Awaited<ReturnType<typeof makeTeam>>;
beforeEach(async () => {
  await resetDb();
  t = await makeTeam();
});
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const mk = (title: string, points: number) => createIssue(t.po, { projectId: t.project.id, title, description: "", type: "STORY", priority: "MEDIUM", storyPoints: points, labelIds: [] });

describe("sprints", () => {
  it("création réservée au Product Owner", async () => {
    await expect(createSprint(t.dev, { projectId: t.project.id, goal: "", startDate: new Date(day(0)), endDate: new Date(day(13)) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const s = await createSprint(t.po, { projectId: t.project.id, goal: "Objectif", startDate: new Date(day(0)), endDate: new Date(day(13)) });
    expect(s.name).toBe("Sprint 1");
  });

  it("démarre un seul sprint actif par projet et fige l'engagement", async () => {
    const s1 = await createSprint(t.po, { projectId: t.project.id, goal: "", startDate: new Date(day(0)), endDate: new Date(day(13)) });
    const s2 = await createSprint(t.po, { projectId: t.project.id, goal: "", startDate: new Date(day(14)), endDate: new Date(day(27)) });
    await expect(startSprint(t.po, s1.id)).rejects.toMatchObject({ code: "INVALID" }); // vide
    const a = await mk("A", 5);
    const b = await mk("B", 3);
    await assignToSprint(t.po, { sprintId: s1.id, issueIds: [a.id, b.id] });
    const started = await startSprint(t.po, s1.id);
    expect(started.committedPoints).toBe(8);
    // Les tickets « Backlog » passent à « À faire »
    const todo = await statusByCategory(t.project.id, "TODO");
    expect((await db.issue.findUniqueOrThrow({ where: { id: a.id } })).statusId).toBe(todo.id);
    await assignToSprint(t.po, { sprintId: s2.id, issueIds: [(await mk("C", 1)).id] });
    await expect(startSprint(t.po, s2.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.sprintSnapshot.count({ where: { sprintId: s1.id } })).toBe(1);
  });

  it("termine le sprint et reporte le travail non terminé (backlog ou sprint suivant)", async () => {
    const s1 = await createSprint(t.po, { projectId: t.project.id, goal: "", startDate: new Date(day(-13)), endDate: new Date(day(0)) });
    const s2 = await createSprint(t.po, { projectId: t.project.id, goal: "", startDate: new Date(day(1)), endDate: new Date(day(14)) });
    const [a, b, c] = [await mk("A", 5), await mk("B", 3), await mk("C", 2)];
    await assignToSprint(t.po, { sprintId: s1.id, issueIds: [a.id, b.id, c.id] });
    await startSprint(t.po, s1.id);
    const done = await statusByCategory(t.project.id, "DONE");
    await moveIssue(t.dev, { issueId: a.id, statusId: done.id });

    const report = await sprintReport(t.dev, s1.id);
    expect(report.totals).toMatchObject({ totalPoints: 10, completedPoints: 5, completedIssues: 1 });
    expect(report.completion).toBe(50);

    await expect(completeSprint(t.po, { sprintId: s1.id, carryOverTo: s1.id })).rejects.toMatchObject({ code: "INVALID" });
    const res = await completeSprint(t.po, { sprintId: s1.id, carryOverTo: s2.id });
    expect(res.carriedOver).toBe(2);
    expect(res.sprint).toMatchObject({ status: "COMPLETED", completedPoints: 5, completedIssues: 1, committedPoints: 10 });
    expect((await db.issue.findUniqueOrThrow({ where: { id: b.id } })).sprintId).toBe(s2.id);
    expect((await db.issue.findUniqueOrThrow({ where: { id: a.id } })).sprintId).toBe(s1.id); // le terminé reste dans l'historique
    expect(await velocity(t.dev, t.project.id)).toEqual([{ name: "Sprint 1", committed: 10, completed: 5 }]);

    // Report vers le backlog
    await startSprint(t.po, s2.id);
    const r2 = await completeSprint(t.po, { sprintId: s2.id, carryOverTo: "backlog" });
    expect(r2.carriedOver).toBe(2);
    expect((await db.issue.findUniqueOrThrow({ where: { id: c.id } })).sprintId).toBeNull();
  });
});
