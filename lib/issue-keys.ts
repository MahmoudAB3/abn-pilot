/**
 * Reconnaissance des clés de tickets (ERP-14, MYS-23…) dans les messages de commit,
 * titres/descriptions de PR (sensible à la casse) et noms de branches (insensible à la casse :
 * feature/erp-14-auth). Les correspondances sont ensuite filtrées sur les projets réellement
 * liés au dépôt, ce qui écarte les faux positifs (UTF-8, SHA-256…).
 */
const KEY_RE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,9})-([1-9]\d{0,6})(?![A-Za-z0-9])/g;

function scan(text: string, out: Set<string>) {
  for (const m of text.matchAll(KEY_RE)) out.add(`${m[1]}-${m[2]}`);
}

export function extractIssueKeys(texts: (string | null | undefined)[], branches: (string | null | undefined)[] = []): string[] {
  const found = new Set<string>();
  for (const t of texts) if (t) scan(t, found);
  for (const b of branches) if (b) scan(b.toUpperCase(), found);
  return [...found];
}

/** Nom de branche suggéré : feature/MYS-23-validation-factures */
export function suggestBranchName(key: string, title: string, type: string) {
  const prefix = type === "BUG" ? "fix" : "feature";
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
  return `${prefix}/${key}${slug ? `-${slug}` : ""}`;
}
