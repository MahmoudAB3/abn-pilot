import { describe, expect, it } from "vitest";
import { extractIssueKeys, suggestBranchName } from "@/lib/issue-keys";
import { rankBetween } from "@/lib/rank";
import { hierarchyError } from "@/modules/issues/service";
import { extractMentions } from "@/modules/notifications/service";
import { projectHealth } from "@/modules/projects/service";
import { effectiveProjectPermissions } from "@/server/authz";

describe("clés de tickets", () => {
  it("reconnaît les clés dans un message de commit", () => {
    expect(extractIssueKeys(["MYS-23 Fix invoice validation", "ERP-14 Add authentication middleware"]).sort()).toEqual(["ERP-14", "MYS-23"]);
  });
  it("reconnaît une clé dans un titre de PR « MYS-23: … »", () => {
    expect(extractIssueKeys(["MYS-23: Fix invoice validation"])).toEqual(["MYS-23"]);
  });
  it("lit les branches en minuscules", () => {
    expect(extractIssueKeys([], ["feature/erp-14-auth-middleware"])).toEqual(["ERP-14"]);
  });
  it("ignore les faux positifs en minuscules dans le texte", () => {
    expect(extractIssueKeys(["fix utf-8 encoding and sha-256"])).toEqual([]);
  });
  it("ne prend pas une clé collée à d'autres caractères", () => {
    expect(extractIssueKeys(["XERP-14", "ERP-140x", "ERP-0"])).toEqual(["XERP-14"]);
  });
  it("propose un nom de branche normalisé", () => {
    expect(suggestBranchName("MYS-23", "Validation des factures échues", "STORY")).toBe("feature/MYS-23-validation-des-factures-echues");
    expect(suggestBranchName("MYS-24", "Crash à l'export", "BUG")).toBe("fix/MYS-24-crash-a-l-export");
  });
});

describe("rangs", () => {
  it("insère entre deux voisins", () => {
    expect(rankBetween(1024, 2048)).toBe(1536);
    expect(rankBetween(null, 1024)).toBe(0);
    expect(rankBetween(1024, null)).toBe(2048);
  });
});

describe("hiérarchie", () => {
  const p = "p1";
  it("refuse une sous-tâche sans parent ou sous une épopée", () => {
    expect(hierarchyError("SUBTASK", null, p)).toBeTruthy();
    expect(hierarchyError("SUBTASK", { type: "EPIC", projectId: p }, p)).toBeTruthy();
    expect(hierarchyError("SUBTASK", { type: "STORY", projectId: p }, p)).toBeNull();
  });
  it("une story ne peut avoir qu'une épopée pour parent", () => {
    expect(hierarchyError("STORY", { type: "STORY", projectId: p }, p)).toBeTruthy();
    expect(hierarchyError("STORY", { type: "EPIC", projectId: p }, p)).toBeNull();
  });
  it("refuse un parent d'un autre projet", () => {
    expect(hierarchyError("TASK", { type: "EPIC", projectId: "p2" }, p)).toBeTruthy();
  });
});

describe("divers", () => {
  it("extrait les mentions", () => {
    expect(extractMentions("Merci @[Yasmine Benali](cmabcdefghijklmnopqrstu) !")).toEqual(["cmabcdefghijklmnopqrstu"]);
  });
  it("santé de projet à partir de signaux réels", () => {
    expect(projectHealth({ overdue: 0, blocked: 0, open: 5, targetDate: null, progress: 0.5 })).toBe("en-bonne-voie");
    expect(projectHealth({ overdue: 0, blocked: 1, open: 5, targetDate: null, progress: 0.5 })).toBe("a-risque");
    expect(projectHealth({ overdue: 3, blocked: 0, open: 5, targetDate: null, progress: 0.5 })).toBe("en-retard");
  });
  it("matrice de permissions", () => {
    expect(effectiveProjectPermissions("DEVELOPER", null)).toEqual([]);
    expect(effectiveProjectPermissions("ADMIN", null)).toContain("repo.link");
    expect(effectiveProjectPermissions("PRODUCT_OWNER", "VIEWER")).toEqual(["project.view"]);
    expect(effectiveProjectPermissions("DEVELOPER", "LEAD")).toContain("sprint.manage");
    expect(effectiveProjectPermissions("DEVELOPER", "MEMBER")).not.toContain("sprint.manage");
  });
});
