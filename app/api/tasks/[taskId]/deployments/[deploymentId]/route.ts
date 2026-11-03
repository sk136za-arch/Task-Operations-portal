import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, deployments } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { deploymentInput } from "@/lib/validation";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string; deploymentId: string }> },
) {
  const auth = await requireRole(["admin", "editor"]);
  if ("error" in auth) return auth.error;
  const { taskId, deploymentId } = await params,
    parsed = deploymentInput.safeParse(await request.json());
  if (!parsed.success)
    return Response.json(
      { error: "Invalid deployment", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const db = getDb(),
    id = Number(deploymentId),
    [before] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, id))
      .limit(1);
  if (!before || before.taskId !== taskId)
    return Response.json({ error: "Not found" }, { status: 404 });
  const now = new Date().toISOString(),
    [updated] = await db
      .update(deployments)
      .set({ ...parsed.data, updatedAt: now })
      .where(eq(deployments.id, id))
      .returning();
  await db.insert(auditLogs).values({
    actorId: auth.principal.identity.userId,
    actorEmail: auth.principal.identity.email,
    action: "update",
    entityType: "deployment",
    entityId: deploymentId,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(updated),
    createdAt: now,
  });
  return Response.json(updated);
}
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ taskId: string; deploymentId: string }> },
) {
  const auth = await requireRole(["admin", "editor"]);
  if ("error" in auth) return auth.error;
  const { taskId, deploymentId } = await params,
    db = getDb(),
    id = Number(deploymentId);
  const [before] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
    .limit(1);
  if (!before || before.taskId !== taskId)
    return Response.json({ error: "Not found" }, { status: 404 });
  await db.delete(deployments).where(eq(deployments.id, id));
  await db.insert(auditLogs).values({
    actorId: auth.principal.identity.userId,
    actorEmail: auth.principal.identity.email,
    action: "delete",
    entityType: "deployment",
    entityId: deploymentId,
    beforeJson: JSON.stringify(before),
    createdAt: new Date().toISOString(),
  });
  return new Response(null, { status: 204 });
}
