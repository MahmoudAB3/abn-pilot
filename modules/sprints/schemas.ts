import { z } from "zod";

const id = z.string().cuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").transform((v) => new Date(`${v}T00:00:00Z`));

export const createSprintSchema = z
  .object({ projectId: id, name: z.string().trim().max(60).optional(), goal: z.string().trim().max(500).default(""), startDate: day, endDate: day })
  .refine((s) => s.endDate >= s.startDate, { message: "La date de fin doit suivre la date de début.", path: ["endDate"] });

export const updateSprintSchema = z
  .object({ sprintId: id, name: z.string().trim().min(1).max(60), goal: z.string().trim().max(500), startDate: day, endDate: day })
  .refine((s) => s.endDate >= s.startDate, { message: "La date de fin doit suivre la date de début.", path: ["endDate"] });

export const sprintIdSchema = z.object({ sprintId: id });

export const completeSprintSchema = z.object({
  sprintId: id,
  /** Destination du travail non terminé : backlog ou un sprint planifié du même projet. */
  carryOverTo: z.union([z.literal("backlog"), id]),
});

export const addToSprintSchema = z.object({ sprintId: id.nullable(), issueIds: z.array(id).min(1).max(200) });
