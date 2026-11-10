import { z } from "zod";

const id = z.string().cuid();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .nullish()
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, "La clé doit contenir 2 à 10 caractères (lettres majuscules et chiffres), commençant par une lettre.");

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères.").max(80),
  key: projectKeySchema,
  description: z.string().trim().max(2000).default(""),
  leadId: id.nullish(),
  targetDate: optionalDate,
  memberIds: z.array(id).max(200).default([]),
});

export const updateProjectSchema = z.object({
  projectId: id,
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  leadId: id.nullish(),
  status: z.enum(["ACTIVE", "ON_HOLD", "ARCHIVED"]).optional(),
  targetDate: optionalDate.optional(),
});

export const memberSchema = z.object({
  projectId: id,
  userId: id,
  role: z.enum(["LEAD", "MEMBER", "VIEWER"]).default("MEMBER"),
});

export const removeMemberSchema = z.object({ projectId: id, userId: id });

export const workflowSchema = z.object({
  projectId: id,
  statuses: z
    .array(
      z.object({
        id: id.optional(),
        name: z.string().trim().min(1).max(40),
        category: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "IN_TEST", "DONE"]),
        wipLimit: z.number().int().positive().max(99).nullish(),
      }),
    )
    .min(2)
    .max(15)
    .refine((s) => s.some((x) => x.category === "DONE"), "Le workflow doit contenir au moins un statut « Terminé ».")
    .refine((s) => new Set(s.map((x) => x.name.toLowerCase())).size === s.length, "Les noms de statuts doivent être uniques."),
});

export const automationsSchema = z.object({
  projectId: id,
  autoReviewOnPrOpen: z.boolean(),
  autoInProgressOnChangesAsked: z.boolean(),
  autoOnMergeCategory: z.enum(["IN_TEST", "DONE"]).nullable(),
});

export const labelSchema = z.object({
  projectId: id,
  name: z.string().trim().min(1).max(30),
  color: z.enum(["jaune", "orange", "cyan", "violet", "vert", "rose", "bleu", "gris"]).default("gris"),
});
