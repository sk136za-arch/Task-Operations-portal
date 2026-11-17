import { z } from "zod";
export const taskInput = z.object({
  taskId: z.string().trim().min(1).max(40).optional(),
  environment: z.string().trim().min(1).max(80),
  team: z.string().trim().min(1).max(120),
  service: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(1000),
  startDate: z.string().max(20).nullable().optional(),
  endDate: z.string().max(20).nullable().optional(),
  uatDetail: z.string().max(5000).default(""),
  productionDetail: z.string().max(5000).default(""),
  status: z.string().trim().min(1).max(80),
  remark: z.string().max(5000).default(""),
  revision: z.number().int().positive().optional(),
});
export const userInput = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(160),
  role: z.enum(["admin", "editor", "viewer"]),
  active: z.boolean().default(true),
});

export const deploymentInput = z.object({
  sprint: z.string().max(40).default(""),
  environment: z.string().min(1),
  type: z.enum(["uat", "prod"]),
  plannedDate: z.string().nullable().optional(),
  actualDate: z.string().nullable().optional(),
  dateLabel: z.string().max(100).default(""),
  detail: z.string().min(1).max(5000),
  result: z.string().max(80).default("planned"),
});

const cancelStatus = z.string().trim().min(1).max(80).refine(
  (value) => /cancel/i.test(value),
  "Status must be a cancellation status",
);

export const cancelDeploymentInput = z.discriminatedUnion("scope", [
  z.object({
    revision: z.number().int().positive(),
    status: cancelStatus,
    scope: z.literal("all"),
  }),
  z.object({
    revision: z.number().int().positive(),
    status: cancelStatus,
    scope: z.literal("one"),
    deploymentId: z.number().int().positive(),
  }),
]);
