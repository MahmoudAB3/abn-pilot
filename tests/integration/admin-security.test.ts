import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { changeRole, deactivateUser, inviteUser, approveRequest } from "@/modules/admin/service";
import { detectType, safeFilename, saveAttachment } from "@/modules/issues/attachments";
import { renderMarkdown } from "@/lib/markdown";
import { globalSearch } from "@/modules/search/service";
import { addComment, createIssue, moveIssue } from "@/modules/issues/service";
import { createRelease, draftReleaseNotes, setReleaseIssues } from "@/modules/releases/service";
import { overview, managementView, productOwnerView } from "@/modules/reporting/service";
import { makeTeam, makeUser, resetDb, statusByCategory } from "../helpers";

let t: Awaited<ReturnType<typeof makeTeam>>;
beforeEach(async () => {
  await resetDb();
  t = await makeTeam();
});

describe("administration des accès", () => {
  it("seul un administrateur peut inviter, et uniquement sur un domaine autorisé", async () => {
    await expect(inviteUser(t.po, { email: "x@abnsoft.ma", role: "DEVELOPER", projectIds: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(inviteUser(t.admin, { email: "x@gmail.com", role: "DEVELOPER", projectIds: [] })).rejects.toMatchObject({ code: "INVALID" });
    const m = await inviteUser(t.admin, { email: "nouveau@abnsoft.ma", role: "DEVELOPER", projectIds: [t.project.id] });
    expect(m.status).toBe("INVITED");
    expect(await db.projectMembership.count({ where: { userId: m.userId, projectId: t.project.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "user.invite" } })).toBe(1);
  });

  it("approuve une demande d'accès", async () => {
    const req = await db.accessRequest.create({ data: { email: "demande@abnsoft.ma", hostedDomain: "abnsoft.ma" } });
    await approveRequest(t.admin, { requestId: req.id, role: "VIEWER" });
    expect((await db.accessRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
    const user = await db.user.findUniqueOrThrow({ where: { email: "demande@abnsoft.ma" }, include: { memberships: true } });
    expect(user.memberships[0]).toMatchObject({ role: "VIEWER", status: "INVITED" });
  });

  it("la désactivation révoque immédiatement toutes les sessions", async () => {
    await db.session.createMany({ data: [1, 2].map((i) => ({ sessionToken: `tok-${i}`, userId: t.dev.userId, expires: new Date(Date.now() + 86_400_000) })) });
    await deactivateUser(t.admin, t.dev.userId);
    expect(await db.session.count({ where: { userId: t.dev.userId } })).toBe(0);
    expect((await db.organizationMembership.findFirstOrThrow({ where: { userId: t.dev.userId } })).status).toBe("DEACTIVATED");
  });

  it("protège le dernier administrateur et interdit l'auto-désactivation", async () => {
    await expect(changeRole(t.admin, { userId: t.admin.userId, role: "DEVELOPER" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(deactivateUser(t.admin, t.admin.userId)).rejects.toMatchObject({ code: "CONFLICT" });
    const admin2 = await makeUser("ADMIN");
    await changeRole(admin2, { userId: t.admin.userId, role: "DEVELOPER" });
  });

  it("un rôle ne peut pas être modifié par un non-administrateur", async () => {
    await expect(changeRole(t.po, { userId: t.dev.userId, role: "ADMIN" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("pièces jointes", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  it("détecte le type réel et refuse les contenus dangereux", async () => {
    expect(await detectType(png, "capture.png")).toBe("image/png");
    expect(await detectType(Buffer.from("<html><script>alert(1)</script></html>"), "page.html")).toBeNull();
    expect(await detectType(Buffer.from("<svg onload=alert(1)>"), "image.svg")).toBeNull();
    expect(await detectType(Buffer.from("MZ\x90\x00\x03"), "outil.exe")).toBeNull();
    expect(await detectType(Buffer.from("MZ\x90\x00\x03"), "faux.txt")).toBeNull(); // octet NUL → binaire
    expect(await detectType(Buffer.from("col1;col2\n1;2"), "export.csv")).toBe("text/csv");
    // Une image déguisée en PDF garde son vrai type
    expect(await detectType(png, "document.pdf")).toBe("image/png");
  });
  it("assainit les noms de fichiers", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("rapport <final>.pdf")).toBe("rapport _final_.pdf");
    expect(safeFilename(".htaccess")).toBe("htaccess");
  });
  it("refuse le téléversement à un observateur", async () => {
    const issue = await createIssue(t.dev, { projectId: t.project.id, title: "Avec pièce jointe", description: "", type: "TASK", priority: "MEDIUM", labelIds: [] });
    await expect(saveAttachment(t.viewer, issue.id, { name: "a.png", bytes: png })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const a = await saveAttachment(t.dev, issue.id, { name: "a.png", bytes: png });
    expect(a.storageKey).not.toContain("a.png");
  });
});

describe("Markdown (XSS)", () => {
  it("retire scripts, gestionnaires d'évènements et URL javascript:", () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)> [clic](javascript:alert(1)) <a href="https://ok.ma">ok</a>');
    expect(html).not.toMatch(/<script|onerror|href="javascript:|<img/i);
    expect(html).toContain('href="https://ok.ma"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
  it("rend les mentions sans injecter de HTML", () => {
    expect(renderMarkdown("Bonjour @[Yas<b>mine](cmabcdefghijklmnopqrstu)")).not.toContain("<b>");
  });
});

describe("recherche et rapports", () => {
  it("recherche plein texte en français (racines), par clé, limitée aux projets visibles", async () => {
    const i = await createIssue(t.dev, { projectId: t.project.id, title: "Transférer les stocks entre dépôts", description: "Génération des bons de transfert", type: "STORY", priority: "MEDIUM", labelIds: [] });
    await addComment(t.dev, { issueId: i.id, body: "Attention aux interblocages pendant le transfert" });
    const r = await globalSearch(t.dev, "transfert");
    expect(r.issues.map((x) => x.key)).toContain(i.key);
    expect(r.comments.length).toBe(1);
    expect((await globalSearch(t.dev, i.key)).issues[0]!.key).toBe(i.key);
    expect((await globalSearch(t.outsider, "transfert")).issues).toHaveLength(0);
  });
  it("génère un brouillon de notes de version à partir des tickets terminés", async () => {
    const done = await statusByCategory(t.project.id, "DONE");
    const a = await createIssue(t.po, { projectId: t.project.id, title: "Export PDF", description: "", type: "STORY", priority: "MEDIUM", labelIds: [] });
    const b = await createIssue(t.po, { projectId: t.project.id, title: "Montant négatif", description: "", type: "BUG", priority: "HIGH", labelIds: [] });
    const c = await createIssue(t.po, { projectId: t.project.id, title: "Pas encore fini", description: "", type: "TASK", priority: "LOW", labelIds: [] });
    await moveIssue(t.dev, { issueId: a.id, statusId: done.id });
    await moveIssue(t.dev, { issueId: b.id, statusId: done.id });
    const rel = await createRelease(t.po, { projectId: t.project.id, name: "Livraison", version: "1.0.0", plannedDate: null });
    await setReleaseIssues(t.po, { releaseId: rel.id, issueIds: [a.id, b.id, c.id], attach: true });
    const notes = await draftReleaseNotes(t.po, rel.id);
    expect(notes).toContain("## Nouveautés");
    expect(notes).toContain(`Export PDF (${a.key})`);
    expect(notes).toContain("## Corrections");
    expect(notes).not.toContain("Pas encore fini");
  });
  it("les tableaux de bord s'exécutent pour chaque rôle sans fuite entre projets", async () => {
    for (const u of [t.admin, t.po, t.dev, t.viewer, t.outsider]) {
      const o = await overview(u);
      await productOwnerView(u);
      await managementView(u);
      if (u === t.outsider) expect(o.projects).toHaveLength(0);
    }
  });
});
