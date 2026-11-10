import { z } from "zod";

const id = z.string().cuid();
const role = z.enum(["ADMIN", "PRODUCT_OWNER", "DEVELOPER", "VIEWER"]);

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
  name: z.string().trim().max(80).optional(),
  role: role.default("DEVELOPER"),
  projectIds: z.array(id).max(50).default([]),
});
export const approveSchema = z.object({ requestId: id, role: role.default("DEVELOPER") });
export const requestIdSchema = z.object({ requestId: id });
export const roleSchema = z.object({ userId: id, role });
export const userIdSchema = z.object({ userId: id });
