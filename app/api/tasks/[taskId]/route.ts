import { camelize, getDb, unwrap } from "@/db";
import { requireScopedProject } from "@/lib/project-route";
import { taskInput } from "@/lib/validation";

export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await requireScopedProject(request, ["admin", "editor", "viewer"]); if ("error" in auth) return auth.error;
  const { taskId } = await params, db = getDb();
  const task = unwrap<any>(await db.from("tasks").select().eq("project_id", auth.projectId).eq("task_id", taskId).maybeSingle());
  if (!task) return Response.json({ error: "Not found" }, { status: 404 });
  const deployments = unwrap(await db.from("deployments").select().eq("project_id", auth.projectId).eq("task_id", taskId));
  return Response.json(camelize({ task, deployments }));
}
export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await requireScopedProject(request, ["admin", "editor"]); if ("error" in auth) return auth.error;
  const { taskId } = await params, parsed = taskInput.safeParse(await request.json());
  if (!parsed.success || !parsed.data.revision) return Response.json({ error: "Invalid task or revision" }, { status: 400 });
  const db = getDb(), before = unwrap<any>(await db.from("tasks").select().eq("project_id", auth.projectId).eq("task_id", taskId).maybeSingle());
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });
  const nextStatus = parsed.data.status.trim().toLowerCase();
  const requiresDeploymentTransition =
    (before.status.trim().toLowerCase() !== "deploy prod done" && nextStatus === "deploy prod done") ||
    (/cancel/i.test(nextStatus) && !/cancel/i.test(before.status));
  if (requiresDeploymentTransition) {
    const planned = unwrap(await db.from("deployments").select("id").eq("project_id", auth.projectId).eq("task_id", taskId).eq("result", "planned").limit(1).maybeSingle());
    if (planned) return Response.json({ error: "Use the deployment transition workflow", code: "use_deployment_transition" }, { status: 409 });
  }
  const now = new Date().toISOString(), data = { environment: parsed.data.environment, team: parsed.data.team, service: parsed.data.service, title: parsed.data.title, start_date: parsed.data.startDate, end_date: parsed.data.endDate, uat_detail: parsed.data.uatDetail, production_detail: parsed.data.productionDetail, status: parsed.data.status, remark: parsed.data.remark, revision: before.revision + 1, updated_at: now, updated_by: auth.principal.identity.email };
  const updated = unwrap<any>(await db.from("tasks").update(data).eq("project_id", auth.projectId).eq("task_id", taskId).eq("revision", parsed.data.revision).select().maybeSingle());
  if (!updated) return Response.json({ error: "Task changed by another user", current: camelize(before) }, { status: 409 });
  unwrap(await db.from("audit_logs").insert({ project_id: auth.projectId, actor_id: auth.principal.identity.userId, actor_email: auth.principal.identity.email, action: "update", entity_type: "task", entity_id: taskId, before_json: JSON.stringify(before), after_json: JSON.stringify(updated), created_at: now }));
  return Response.json(camelize(updated));
}
