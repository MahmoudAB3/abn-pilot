import { describe, expect, it } from "vitest";
import { evaluateSignIn } from "@/server/auth/policy";

const domains = ["abnsoft.ma"];
const claims = (over: object = {}) => ({ email: "y.benali@abnsoft.ma", email_verified: true, hd: "abnsoft.ma", ...over });

describe("politique de connexion Google", () => {
  it("accepte un utilisateur approuvé du domaine Workspace", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims(), allowedDomains: domains, membership: { status: "ACTIVE" } })).toEqual({ allow: true, activate: false });
  });
  it("active une invitation à la première connexion", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims(), allowedDomains: domains, membership: { status: "INVITED" } })).toEqual({ allow: true, activate: true });
  });
  it("rejette un compte Google grand public (sans claim hd)", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims({ hd: undefined, email: "x@gmail.com" }), allowedDomains: domains, membership: { status: "ACTIVE" } })).toMatchObject({ allow: false, reason: "domaine" });
  });
  it("se fie au claim hd et non au suffixe de l'e-mail", () => {
    // Adresse au bon suffixe mais domaine Workspace différent → refus
    expect(evaluateSignIn({ provider: "google", claims: claims({ hd: "autre.com" }), allowedDomains: domains, membership: { status: "ACTIVE" } })).toMatchObject({ allow: false, reason: "domaine" });
  });
  it("rejette un utilisateur du domaine non approuvé", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims(), allowedDomains: domains, membership: null })).toMatchObject({ allow: false, reason: "en-attente" });
  });
  it("rejette un compte désactivé", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims(), allowedDomains: domains, membership: { status: "DEACTIVATED" } })).toMatchObject({ allow: false, reason: "desactive" });
  });
  it("rejette une adresse non vérifiée", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims({ email_verified: false }), allowedDomains: domains, membership: { status: "ACTIVE" } })).toMatchObject({ allow: false, reason: "email-non-verifie" });
  });
  it("rejette tout autre fournisseur", () => {
    expect(evaluateSignIn({ provider: "credentials", claims: claims(), allowedDomains: domains, membership: { status: "ACTIVE" } })).toMatchObject({ allow: false, reason: "provider" });
  });
  it("admet un super-admin sans invitation et demande sa promotion ADMIN", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims(), allowedDomains: domains, membership: null, superAdmin: true })).toEqual({ allow: true, activate: true, ensureAdmin: true });
  });
  it("réactive un super-admin désactivé", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims(), allowedDomains: domains, membership: { status: "DEACTIVATED" }, superAdmin: true })).toMatchObject({ allow: true, ensureAdmin: true });
  });
  it("n'exempte pas le super-admin des contrôles d'identité", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims({ hd: "autre.com" }), allowedDomains: domains, membership: null, superAdmin: true })).toMatchObject({ allow: false, reason: "domaine" });
    expect(evaluateSignIn({ provider: "google", claims: claims({ email_verified: false }), allowedDomains: domains, membership: null, superAdmin: true })).toMatchObject({ allow: false, reason: "email-non-verifie" });
  });
  it("refuse tout si aucun domaine n'est configuré", () => {
    expect(evaluateSignIn({ provider: "google", claims: claims(), allowedDomains: [], membership: { status: "ACTIVE" } })).toMatchObject({ allow: false, reason: "domaine" });
  });
});
