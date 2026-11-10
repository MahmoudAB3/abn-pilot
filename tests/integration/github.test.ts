import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ingestWebhook, verifySignature } from "@/modules/github/webhook";
import { processWebhookBatch } from "@/server/jobs";
import { getOrganization } from "@/server/org";
import { createIssue } from "@/modules/issues/service";
import { saveAutomations } from "@/modules/projects/service";
import { makeTeam, resetDb, statusByCategory } from "../helpers";

const SECRET = "webhook-secret-for-tests";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
let delivery = 0;
const repoPayload = { id: 501, name: "synergie-api", full_name: "abnsoft/synergie-api", private: true, owner: { login: "abnsoft" }, html_url: "https://github.com/abnsoft/synergie-api", default_branch: "main" };

async function send(event: string, payload: object) {
  const body = JSON.stringify({ installation: { id: 9001 }, ...payload });
  const res = await ingestWebhook({ deliveryId: `00000000-0000-0000-0000-${String(++delivery).padStart(12, "0")}`, event, rawBody: body });
  await processWebhookBatch(50);
  return res;
}

function pr(over: object = {}) {
  return {
    id: 777, number: 42, title: "ERP-1: Corriger la validation des factures", body: "Corrige ERP-1", state: "open", draft: false, merged: false,
    merged_at: null, closed_at: null, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z",
    html_url: "https://github.com/abnsoft/synergie-api/pull/42", user: { login: "ybenali" }, head: { ref: "feature/ERP-1-validation" }, base: { ref: "main" }, requested_reviewers: [],
    ...over,
  };
}

let t: Awaited<ReturnType<typeof makeTeam>>;
let issueId: string;
beforeEach(async () => {
  await resetDb();
  t = await makeTeam();
  const org = await getOrganization();
  const inst = await db.gitHubInstallation.create({ data: { orgId: org.id, installationId: 9001n, accountLogin: "abnsoft", accountType: "Organization", repositorySelection: "selected" } });
  const repo = await db.gitHubRepository.create({ data: { installationId: inst.id, githubId: 501n, owner: "abnsoft", name: "synergie-api", fullName: "abnsoft/synergie-api", private: true, htmlUrl: repoPayload.html_url } });
  await db.projectRepository.create({ data: { projectId: t.project.id, repositoryId: repo.id } });
  const issue = await createIssue(t.dev, { projectId: t.project.id, title: "Validation des factures", description: "", type: "STORY", priority: "HIGH", labelIds: [], assigneeId: t.dev.userId });
  issueId = issue.id;
  const doing = await statusByCategory(t.project.id, "IN_PROGRESS");
  await db.issue.update({ where: { id: issueId }, data: { statusId: doing.id } });
});

const category = async () => (await db.issue.findUniqueOrThrow({ where: { id: issueId }, include: { status: true } })).status.category;

describe("signature des webhooks", () => {
  it("accepte une signature valide et refuse une signature invalide ou absente", async () => {
    const body = JSON.stringify({ zen: "ok" });
    expect(await verifySignature(SECRET, body, sign(body))).toBe(true);
    expect(await verifySignature(SECRET, body, sign(body + " "))).toBe(false);
    expect(await verifySignature("autre-secret", body, sign(body))).toBe(false);
    expect(await verifySignature(SECRET, body, null)).toBe(false);
    expect(await verifySignature(SECRET, body, "sha1=abc")).toBe(false);
  });
});

describe("traitement des évènements", () => {
  it("ignore les livraisons en double (idempotence)", async () => {
    const body = JSON.stringify({ installation: { id: 9001 }, action: "opened", repository: repoPayload, pull_request: pr() });
    const a = await ingestWebhook({ deliveryId: "11111111-2222-3333-4444-555555555555", event: "pull_request", rawBody: body });
    const b = await ingestWebhook({ deliveryId: "11111111-2222-3333-4444-555555555555", event: "pull_request", rawBody: body });
    expect([a.status, b.status]).toEqual([202, 200]);
    expect(await db.gitHubWebhookEvent.count()).toBe(1);
    await processWebhookBatch();
    expect(await db.gitHubIssueLink.count()).toBe(1);
  });

  it("lie les commits par clé et ignore les clés inconnues ou les doublons", async () => {
    const commit = (id: string, message: string) => ({ id: id.padEnd(40, "0"), message, timestamp: "2026-11-02T09:00:00Z", url: `https://github.com/abnsoft/synergie-api/commit/${id}`, distinct: true, author: { name: "Yasmine", username: "ybenali" } });
    await send("push", { ref: "refs/heads/main", repository: repoPayload, commits: [commit("a1", "ERP-1 Valider le montant"), commit("b2", "ERP-999 Clé inconnue"), commit("c3", "Sans clé")] });
    await send("push", { ref: "refs/heads/main", repository: repoPayload, commits: [commit("a1", "ERP-1 Valider le montant")] });
    expect(await db.gitHubCommit.count()).toBe(1);
    const acts = await db.issueActivity.findMany({ where: { issueId, type: "COMMIT_LINKED" } });
    expect(acts).toHaveLength(1);
    expect(acts[0]!.data).toMatchObject({ sha: "a100000", author: "ybenali" });
  });

  it("enregistre une PR ouverte sans changer le statut quand aucune règle n'est active", async () => {
    await send("pull_request", { action: "opened", repository: repoPayload, pull_request: pr() });
    const link = await db.gitHubIssueLink.findFirstOrThrow({ where: { issueId }, include: { pullRequest: true } });
    expect(link.pullRequest).toMatchObject({ number: 42, state: "OPEN", headRef: "feature/ERP-1-validation", authorLogin: "ybenali" });
    expect(await category()).toBe("IN_PROGRESS");
    // Notification PR à l'assigné (observateur du ticket)
    expect(await db.notification.count({ where: { userId: t.dev.userId, type: "PR_ACTIVITY" } })).toBe(1);
  });

  it("applique les règles configurées : ouverture → En revue, modifications → En cours, fusion → Terminé", async () => {
    await saveAutomations(t.admin, { projectId: t.project.id, autoReviewOnPrOpen: true, autoInProgressOnChangesAsked: true, autoOnMergeCategory: "DONE" });
    await send("pull_request", { action: "opened", repository: repoPayload, pull_request: pr() });
    expect(await category()).toBe("IN_REVIEW");
    await send("pull_request_review", { action: "submitted", repository: repoPayload, pull_request: pr({ updated_at: "2026-11-01T11:00:00Z" }), review: { state: "changes_requested", user: { login: "mtazi" } } });
    expect(await category()).toBe("IN_PROGRESS");
    expect((await db.gitHubPullRequest.findFirstOrThrow()).reviewState).toBe("CHANGES_REQUESTED");
    await send("pull_request", { action: "closed", repository: repoPayload, pull_request: pr({ state: "closed", merged: true, merged_at: "2026-11-01T12:00:00Z", closed_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" }) });
    expect(await category()).toBe("DONE");
    expect((await db.gitHubPullRequest.findFirstOrThrow()).state).toBe("MERGED");
    const history = await db.issueStatusHistory.findMany({ where: { issueId, source: "AUTOMATION" } });
    expect(history).toHaveLength(3);
  });

  it("fusion sans règle : la PR est marquée fusionnée, le ticket ne bouge pas", async () => {
    await send("pull_request", { action: "opened", repository: repoPayload, pull_request: pr() });
    await send("pull_request", { action: "closed", repository: repoPayload, pull_request: pr({ state: "closed", merged: true, merged_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" }) });
    expect((await db.gitHubPullRequest.findFirstOrThrow()).state).toBe("MERGED");
    expect(await category()).toBe("IN_PROGRESS");
  });

  it("ne lie pas une PR d'un dépôt non rattaché au projet", async () => {
    const other = { ...repoPayload, id: 999, name: "autre", full_name: "abnsoft/autre", html_url: "https://github.com/abnsoft/autre" };
    await send("pull_request", { action: "opened", repository: other, pull_request: pr({ id: 888 }) });
    expect(await db.gitHubPullRequest.count()).toBe(0);
  });

  it("rejette un évènement dont l'installation ne correspond pas au dépôt", async () => {
    const body = JSON.stringify({ installation: { id: 1234 }, action: "opened", repository: repoPayload, pull_request: pr() });
    await ingestWebhook({ deliveryId: "99999999-0000-0000-0000-000000000001", event: "pull_request", rawBody: body });
    await processWebhookBatch();
    expect((await db.gitHubWebhookEvent.findFirstOrThrow()).status).toBe("IGNORED");
    expect(await db.gitHubPullRequest.count()).toBe(0);
  });

  it("gère la révocation de l'installation : dépôts retirés, liaisons coupées, historique conservé", async () => {
    await send("pull_request", { action: "opened", repository: repoPayload, pull_request: pr() });
    await send("installation", { action: "deleted", installation: { id: 9001, account: { login: "abnsoft", type: "Organization" }, repository_selection: "selected" } });
    expect((await db.gitHubInstallation.findFirstOrThrow()).revokedAt).not.toBeNull();
    expect(await db.projectRepository.count()).toBe(0);
    expect(await db.gitHubIssueLink.count()).toBe(1);
    // Les évènements ultérieurs sont sans effet
    await send("pull_request", { action: "closed", repository: repoPayload, pull_request: pr({ state: "closed", merged: true, merged_at: "2026-11-02T12:00:00Z", updated_at: "2026-11-02T12:00:00Z" }) });
    expect((await db.gitHubPullRequest.findFirstOrThrow()).state).toBe("OPEN");
  });

  it("ignore les évènements d'une installation suspendue jusqu'à sa réactivation", async () => {
    const inst = { id: 9001, account: { login: "abnsoft", type: "Organization" }, repository_selection: "selected" };
    await send("pull_request", { action: "opened", repository: repoPayload, pull_request: pr() });
    await send("installation", { action: "suspend", installation: inst });
    const merged = pr({ state: "closed", merged: true, merged_at: "2026-11-02T12:00:00Z", updated_at: "2026-11-02T12:00:00Z" });
    await send("pull_request", { action: "closed", repository: repoPayload, pull_request: merged });
    expect((await db.gitHubPullRequest.findFirstOrThrow()).state).toBe("OPEN");
    await send("installation", { action: "unsuspend", installation: inst });
    await send("pull_request", { action: "closed", repository: repoPayload, pull_request: merged });
    expect((await db.gitHubPullRequest.findFirstOrThrow()).state).toBe("MERGED");
  });

  it("retente un évènement en échec puis le marque ignoré s'il est invalide", async () => {
    const body = JSON.stringify({ installation: { id: 9001 }, action: "opened", repository: repoPayload, pull_request: { invalide: true } });
    await ingestWebhook({ deliveryId: "99999999-0000-0000-0000-000000000002", event: "pull_request", rawBody: body });
    await processWebhookBatch();
    expect((await db.gitHubWebhookEvent.findFirstOrThrow()).status).toBe("IGNORED");
  });

  it("refuse un évènement non signé côté route (en-têtes manquants)", async () => {
    expect((await ingestWebhook({ deliveryId: null, event: "push", rawBody: "{}" })).status).toBe(400);
  });
});
