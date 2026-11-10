import { z } from "zod";

const id = z.string().cuid();
export const issueTypeSchema = z.enum(["EPIC", "STORY", "TASK", "BUG", "SUBTASK"]);
export const prioritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "LOWEST"]);
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .transform((v) => new Date(`${v}T00:00:00Z`));

export const createIssueSchema = z.object({
  projectId: id,
  title: z.string().trim().min(3, "Le titre doit contenir au moins 3 caractères.").max(240, "240 caractères maximum."),
  description: z.string().max(50_000).default(""),
  type: issueTypeSchema.default("TASK"),
  priority: prioritySchema.default("MEDIUM"),
  statusId: id.nullish(),
  assigneeId: id.nullish(),
  parentId: id.nullish(),
  sprintId: id.nullish(),
  storyPoints: z.number().int().min(0).max(100).nullish(),
  dueDate: dateOnly.nullish(),
  labelIds: z.array(id).max(20).default([]),
});
export type CreateIssueInput = z.input<typeof createIssueSchema>;

export const issuePatchSchema = z
  .object({
    title: z.string().trim().min(3).max(240),
    description: z.string().max(50_000),
    type: issueTypeSchema,
    priority: prioritySchema,
    statusId: id,
    assigneeId: id.nullable(),
    parentId: id.nullable(),
    sprintId: id.nullable(),
    milestoneId: id.nullable(),
    releaseId: id.nullable(),
    storyPoints: z.number().int().min(0).max(100).nullable(),
    dueDate: dateOnly.nullable(),
    blocked: z.boolean(),
    blockedReason: z.string().trim().max(500).nullable(),
    labelIds: z.array(id).max(20),
  })
  .partial();

export const updateIssueSchema = z.object({ issueId: id, patch: issuePatchSchema });

export const moveIssueSchema = z.object({
  issueId: id,
  statusId: id,
  /** Voisins dans la colonne d'arrivée, pour calculer le rang. */
  beforeId: id.nullish(),
  afterId: id.nullish(),
});

export const reorderSchema = z.object({
  issueId: id,
  beforeId: id.nullish(),
  afterId: id.nullish(),
  /** null = backlog ; sinon sprint cible. */
  sprintId: id.nullable(),
});

export const bulkUpdateSchema = z.object({
  issueIds: z.array(id).min(1).max(200),
  patch: issuePatchSchema.pick({ statusId: true, assigneeId: true, priority: true, sprintId: true, storyPoints: true }).extend({
    addLabelIds: z.array(id).max(20).optional(),
    archive: z.boolean().optional(),
  }),
});

export const issueIdSchema = z.object({ issueId: id });

export const commentSchema = z.object({ issueId: id, body: z.string().trim().min(1, "Le commentaire est vide.").max(20_000) });
export const editCommentSchema = z.object({ commentId: id, body: z.string().trim().min(1).max(20_000) });
export const commentIdSchema = z.object({ commentId: id });

export const linkSchema = z.object({ sourceId: id, targetKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}-\d+$/, "Clé invalide (ex. ERP-14)."), type: z.enum(["BLOCKS", "RELATES_TO", "DUPLICATES"]) });
export const removeLinkSchema = z.object({ linkId: id });

export const workLogSchema = z.object({
  issueId: id,
  minutes: z.number().int().min(1).max(1440),
  date: dateOnly,
  note: z.string().trim().max(500).default(""),
});

export const issueFiltersSchema = z.object({
  projectId: id.optional(),
  q: z.string().trim().max(200).optional(),
  assigneeIds: z.array(z.union([id, z.literal("none")])).optional(),
  types: z.array(issueTypeSchema).optional(),
  priorities: z.array(prioritySchema).optional(),
  statusIds: z.array(id).optional(),
  sprintId: z.union([id, z.literal("none")]).optional(),
  labelIds: z.array(id).optional(),
  epicId: id.optional(),
  archived: z.boolean().optional(),
  blocked: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type IssueFilters = z.infer<typeof issueFiltersSchema>;

/** Filtre enregistré : la chaîne de requête de la page de recherche (validée à la relecture). */
export const savedFilterSchema = z.object({ name: z.string().trim().min(1).max(60), projectId: id.nullish(), filters: z.object({ url: z.string().max(2000).regex(/^[\w%=&,.\-+:]*$/, "Filtre invalide") }) });
