import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { issueAccess, type UserCtx } from "@/server/authz";
import { forbidden, invalid, notFound } from "@/server/errors";

/**
 * Pièces jointes privées : stockées hors du dossier public, nom aléatoire,
 * type vérifié sur le contenu réel (signature binaire) et non sur l'extension déclarée.
 * Le téléchargement passe par une route authentifiée qui revérifie l'accès au projet.
 */
const BINARY_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
const TEXT_EXT = new Map([["txt", "text/plain"], ["log", "text/plain"], ["md", "text/markdown"], ["csv", "text/csv"], ["json", "application/json"]]);

/** Images affichables en ligne ; tout le reste est servi en téléchargement. */
export const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function storageRoot() {
  return resolve(env().UPLOAD_DIR);
}

export async function detectType(buf: Buffer, filename: string): Promise<string | null> {
  const ft = await fileTypeFromBuffer(buf);
  if (ft) return BINARY_TYPES.has(ft.mime) ? ft.mime : null;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const textType = TEXT_EXT.get(ext);
  if (!textType) return null;
  // Texte : refuser les contenus binaires et les octets NUL
  if (buf.includes(0)) return null;
  return textType;
}

export function safeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "fichier";
  return base.replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/^\.+/, "").slice(0, 150) || "fichier";
}

export async function saveAttachment(ctx: UserCtx, issueId: string, file: { name: string; bytes: Buffer }) {
  await issueAccess(ctx, { id: issueId }, "issue.edit");
  const max = env().UPLOAD_MAX_BYTES;
  if (file.bytes.length === 0) throw invalid("Le fichier est vide.");
  if (file.bytes.length > max) throw invalid(`Le fichier dépasse la taille maximale (${Math.round(max / 1024 / 1024)} Mo).`);
  const filename = safeFilename(file.name);
  const mimeType = await detectType(file.bytes, filename);
  if (!mimeType) throw invalid("Type de fichier non autorisé. Formats acceptés : images, PDF, documents Office, ZIP, texte, CSV, JSON.");
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${randomBytes(18).toString("hex")}`;
  const path = join(storageRoot(), storageKey);
  await mkdir(join(storageRoot(), storageKey.split("/")[0]!), { recursive: true });
  await writeFile(path, file.bytes, { flag: "wx", mode: 0o600 });
  try {
    return await db.$transaction(async (tx) => {
      const a = await tx.attachment.create({ data: { issueId, uploaderId: ctx.userId, filename, mimeType, size: file.bytes.length, storageKey } });
      await tx.issueActivity.create({ data: { issueId, actorId: ctx.userId, type: "ATTACHMENT_ADDED", data: { filename } } });
      return a;
    });
  } catch (e) {
    await unlink(path).catch(() => {});
    throw e;
  }
}

export async function readAttachment(ctx: UserCtx, attachmentId: string) {
  const a = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!a) throw notFound("Pièce jointe introuvable.");
  await issueAccess(ctx, { id: a.issueId });
  const root = storageRoot();
  const path = resolve(root, a.storageKey);
  if (!path.startsWith(root)) throw notFound();
  return { attachment: a, bytes: await readFile(path) };
}

export async function deleteAttachment(ctx: UserCtx, attachmentId: string) {
  const a = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!a) throw notFound("Pièce jointe introuvable.");
  const { access } = await issueAccess(ctx, { id: a.issueId }, "issue.edit");
  if (a.uploaderId !== ctx.userId && !access.can("issue.delete")) throw forbidden();
  await db.attachment.delete({ where: { id: attachmentId } });
  await unlink(resolve(storageRoot(), a.storageKey)).catch(() => {});
}
