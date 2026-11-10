import { expect, test } from "@playwright/test";
import { ADMIN, DEV, PO, VIEWER, columnOf, login } from "./helpers";

test("un visiteur non connecté est redirigé vers la connexion", async ({ page }) => {
  await page.goto("/projets/ERP/tableau");
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fprojets%2FERP%2Ftableau/);
  await expect(page.getByRole("button", { name: "Continuer avec Google" })).toBeVisible();
  await expect(page).toHaveTitle(/ABNSoft Pilotage/);
});

test("le Product Owner crée un projet puis un ticket au clavier (touche C)", async ({ page }) => {
  await login(page, PO);
  await page.goto("/projets");
  await page.getByRole("button", { name: "Nouveau projet" }).click();
  await page.getByLabel("Nom").fill("Back-office Mobile");
  await expect(page.getByLabel("Clé")).toHaveValue("BM");
  await page.getByLabel("Clé").fill("BO");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/projets\/BO$/);
  await expect(page.getByRole("heading", { level: 1, name: "Back-office Mobile" })).toBeVisible();

  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Créer un ticket" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Résumé").fill("Écran de connexion mobile");
  await dialog.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByText("Ticket BO-1 créé")).toBeVisible();
});

test("un développeur déplace une carte au clavier ; le statut persiste après rechargement", async ({ page }) => {
  await login(page, DEV);
  await page.goto("/projets/ERP/tableau");
  const key = "ERP-12";
  const before = await columnOf(page, key);
  await page.locator(`[data-issue-key="${key}"]`).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByText(new RegExp(`${key} → `))).toBeVisible();
  await page.reload();
  const after = await columnOf(page, key);
  expect(after).not.toBe(before);
  // Le panneau de détail montre le nouveau statut et l'historique
  await page.locator(`[data-issue-key="${key}"]`).click();
  await expect(page).toHaveURL(new RegExp(`ticket=${key}`));
  await page.getByRole("tab", { name: "Historique" }).click();
  await expect(page.getByText(/a changé le statut/).first()).toBeVisible();
});

test("un observateur est en lecture seule ; un non-membre ne voit pas le projet", async ({ browser }) => {
  const viewer = await browser.newPage();
  await login(viewer, VIEWER);
  await viewer.goto("/projets/ERP/tableau");
  await expect(viewer.locator("[data-issue-key]").first()).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Créer un ticket" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Créer", exact: true })).toHaveCount(0);
  const res = await viewer.goto("/parametres/utilisateurs");
  expect(res?.status()).toBe(404);

  const dev = await browser.newPage();
  await login(dev, DEV); // Mehdi n'est pas membre du Portail Clients
  const r = await dev.goto("/projets/PCL/tableau");
  expect(r?.status()).toBe(404);
  await expect(dev.getByText("Page introuvable")).toBeVisible();
});

test("le Product Owner termine le sprint actif et reporte le travail au backlog", async ({ page }) => {
  await login(page, PO);
  await page.goto("/projets/ERP/sprint");
  await expect(page.getByRole("heading", { level: 1, name: "Sprint 2" })).toBeVisible();
  await page.getByRole("button", { name: "Terminer le sprint" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Le backlog").check();
  await dialog.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByText(/Sprint 2 terminé · \d+ ticket\(s\) reporté\(s\)/)).toBeVisible();
  await page.goto("/projets/ERP/backlog");
  await expect(page.getByRole("heading", { name: "Backlog", exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-issue-key="ERP-9"]')).toBeVisible();
});

test("l'administrateur invite une personne et la recherche globale trouve un ticket par clé", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/parametres/utilisateurs");
  await page.getByRole("button", { name: "Inviter" }).click();
  await page.getByLabel("E-mail Google Workspace").fill("nouvelle.recrue@abnsoft.ma");
  await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
  await expect(page.getByText("nouvelle.recrue@abnsoft.ma invité(e)")).toBeVisible();

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Rechercher tickets/).fill("ERP-10");
  await expect(page.getByRole("option", { name: /ERP-10/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/ticket=ERP-10/);
  await expect(page.getByText("PMP").first()).toBeVisible();
});
