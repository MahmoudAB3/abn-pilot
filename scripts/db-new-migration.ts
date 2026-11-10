/**
 * Crée une migration à partir de la différence entre le dernier schéma migré
 * (prisma/migrations/schema.snapshot.prisma) et prisma/schema.prisma — sans base ni binaire.
 * Usage : npm run db:new -- nom_de_la_migration
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
if (!name) {
  console.error("Usage : npm run db:new -- nom_de_la_migration");
  process.exit(1);
}
const snapshot = "prisma/migrations/schema.snapshot.prisma";
const args = ["prisma", "migrate", "diff", "--to-schema-datamodel", "prisma/schema.prisma", "--script"];
args.splice(3, 0, ...(existsSync(snapshot) ? ["--from-schema-datamodel", snapshot] : ["--from-empty"]));
const sql = execFileSync("npx", args, { encoding: "utf8" });
if (!sql.trim() || /^-- This is an empty migration/.test(sql.trim())) {
  console.log("Aucune différence de schéma.");
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const dir = join("prisma/migrations", `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "migration.sql"), sql);
copyFileSync("prisma/schema.prisma", snapshot);
console.log(`Migration créée : ${dir}`);
