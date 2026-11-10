"use server";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import * as svc from "./service";
import { completeSprintSchema, createSprintSchema, sprintIdSchema, updateSprintSchema } from "./schemas";

const refresh = () => revalidatePath("/", "layout");

export const createSprintAction = action(createSprintSchema, async (i, ctx) => {
  const s = await svc.createSprint(ctx, i);
  refresh();
  return s.id;
});
export const updateSprintAction = action(updateSprintSchema, async (i, ctx) => {
  await svc.updateSprint(ctx, i);
  refresh();
});
export const deleteSprintAction = action(sprintIdSchema, async (i, ctx) => {
  await svc.deleteSprint(ctx, i.sprintId);
  refresh();
});
export const startSprintAction = action(sprintIdSchema, async (i, ctx) => {
  await svc.startSprint(ctx, i.sprintId);
  refresh();
});
export const completeSprintAction = action(completeSprintSchema, async (i, ctx) => {
  const r = await svc.completeSprint(ctx, i);
  refresh();
  return { carriedOver: r.carriedOver };
});
