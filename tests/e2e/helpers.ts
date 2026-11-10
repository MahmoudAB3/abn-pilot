import { expect, type Page } from "@playwright/test";

export async function login(page: Page, email: string) {
  await page.goto("/connexion");
  await page.locator("#dev-email").selectOption(email);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/tableau-de-bord**");
}

export const PO = "k.elidrissi@abnsoft.ma";
export const DEV = "m.tazi@abnsoft.ma";
export const VIEWER = "n.ouazzani@abnsoft.ma";
export const ADMIN = "o.berrada@abnsoft.ma";

export async function columnOf(page: Page, key: string) {
  const card = page.locator(`[data-issue-key="${key}"]`);
  await expect(card).toBeVisible();
  return card.locator("xpath=ancestor::section[1]//h2").innerText();
}
