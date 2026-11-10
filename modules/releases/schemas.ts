import { z } from "zod";

const id = z.string().cuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((v) => new Date(`${v}T00:00:00Z`));

export const milestoneSchema = z.object({
  projectId: id,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).default(""),
  targetDate: day.nullish(),
});
export const updateMilestoneSchema = z.object({
  milestoneId: id,
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  targetDate: day.nullish(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "DONE"]).optional(),
});
export const releaseSchema = z.object({
  projectId: id,
  name: z.string().trim().min(2).max(80),
  version: z.string().trim().regex(/^[0-9A-Za-z][0-9A-Za-z.\-+]{0,31}$/, "Version invalide (ex. 3.2.0)."),
  plannedDate: day.nullish(),
});
export const updateReleaseSchema = z.object({
  releaseId: id,
  name: z.string().trim().min(2).max(80).optional(),
  plannedDate: day.nullish(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "RELEASED", "CANCELLED"]).optional(),
  notes: z.string().max(50_000).optional(),
});
export const releaseIdSchema = z.object({ releaseId: id });
export const releaseIssuesSchema = z.object({ releaseId: id, issueIds: z.array(id).max(500), attach: z.boolean() });
