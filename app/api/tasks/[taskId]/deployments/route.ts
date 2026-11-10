import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, deployments, tasks } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { deploymentInput } from "@/lib/validation";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const auth = await requireRole(["admin", "editor"]);
  if ("error" in auth) return auth.error;
  const { taskId } = await params,
    parsed = deploymentInput.safeParse(await request.json());
  if (!parsed.success)
    return Response.json(
      { error: "Invalid deployment", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const db = getDb(),
    [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.taskId, taskId))
      .limit(1);
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  const now = new Date().toISOString(),
    [created] = await db
      .insert(deployments)
      .values({ ...parsed.data, taskId, createdAt: now, updatedAt: now })
      .returning();
  await db
    .update(tasks)
    .set({ updatedAt: now, updatedBy: auth.principal.identity.email })
    .where(eq(tasks.taskId, taskId));
  await db.insert(auditLogs).values({
    actorId: auth.principal.identity.userId,
    actorEmail: auth.principal.identity.email,
    action: "create",
    entityType: "deployment",
    entityId: String(created.id),
    afterJson: JSON.stringify(created),
    createdAt: now,
  });
  return Response.json(created, { status: 201 });
}
