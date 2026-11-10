import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLogs, deployments, tasks } from "@/db/schema";
import { requireRole } from "@/lib/authz";

const input = z.object({
  revision: z.number().int().positive(),
  deploymentId: z.number().int().positive().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const auth = await requireRole(["admin", "editor"]);
  if ("error" in auth) return auth.error;
  const parsed = input.safeParse(await request.json());
  if (!parsed.success)
    return Response.json({ error: "Invalid completion request" }, { status: 400 });

  const { taskId } = await params;
  const db = getDb();
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.taskId, taskId))
    .limit(1);
  if (!task) return Response.json({ error: "Not found" }, { status: 404 });
  if (task.revision !== parsed.data.revision)
    return Response.json(
      { error: "Task changed by another user", code: "revision_conflict", current: task },
      { status: 409 },
    );

  const planned = await db
    .select()
    .from(deployments)
    .where(
      and(eq(deployments.taskId, taskId), eq(deployments.result, "planned")),
    );
  if (!planned.length)
    return Response.json(
      { error: "No planned deployment remains", code: "no_planned_deployment" },
      { status: 409 },
    );

  if (parsed.data.deploymentId === undefined && planned.length > 1)
    return Response.json(
      { code: "deployment_selection_required", deployments: planned },
      { status: 409 },
    );

  const selected = parsed.data.deploymentId
    ? planned.find((deployment) => deployment.id === parsed.data.deploymentId)
    : planned[0];
  if (!selected)
    return Response.json(
      { error: "Selected deployment is no longer planned", code: "deployment_conflict" },
      { status: 409 },
    );

  const now = new Date().toISOString();
  const [updatedDeployment] = await db
    .update(deployments)
    .set({ result: "success", updatedAt: now })
    .where(
      and(
        eq(deployments.id, selected.id),
        eq(deployments.taskId, taskId),
        eq(deployments.result, "planned"),
      ),
    )
    .returning();
  if (!updatedDeployment)
    return Response.json(
      { error: "Selected deployment changed by another user", code: "deployment_conflict" },
      { status: 409 },
    );

  const shouldCompleteTask = parsed.data.deploymentId === undefined;
  let updatedTask = task;
  if (shouldCompleteTask) {
    const [completed] = await db
      .update(tasks)
      .set({
        status: "Deploy Prod Done",
        revision: task.revision + 1,
        updatedAt: now,
        updatedBy: auth.principal.identity.email,
      })
      .where(and(eq(tasks.taskId, taskId), eq(tasks.revision, task.revision)))
      .returning();
    if (!completed)
      {
        await db
          .update(deployments)
          .set({ result: "planned", updatedAt: selected.updatedAt })
          .where(
            and(
              eq(deployments.id, selected.id),
              eq(deployments.result, "success"),
              eq(deployments.updatedAt, now),
            ),
          );
      return Response.json(
        { error: "Task changed by another user", code: "revision_conflict" },
        { status: 409 },
      );
      }
    updatedTask = completed;
    await db.insert(auditLogs).values({
      actorId: auth.principal.identity.userId,
      actorEmail: auth.principal.identity.email,
      action: "complete-production",
      entityType: "task",
      entityId: taskId,
      beforeJson: JSON.stringify(task),
      afterJson: JSON.stringify(completed),
      createdAt: now,
    });
  }

  await db.insert(auditLogs).values({
    actorId: auth.principal.identity.userId,
    actorEmail: auth.principal.identity.email,
    action: shouldCompleteTask ? "auto-success" : "selected-success",
    entityType: "deployment",
    entityId: String(selected.id),
    beforeJson: JSON.stringify(selected),
    afterJson: JSON.stringify(updatedDeployment),
    createdAt: now,
  });

  return Response.json({
    task: updatedTask,
    deployment: updatedDeployment,
    taskStatusChanged: shouldCompleteTask,
  });
}
