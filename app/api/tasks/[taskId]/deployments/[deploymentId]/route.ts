import { camelize, getDb, unwrap } from "@/db";
import { requireScopedProject } from "@/lib/project-route";
import { deploymentInput } from "@/lib/validation";

async function context(params: Promise<{ taskId: string; deploymentId: string }>) { const p = await params; return { ...p, id: Number(p.deploymentId) }; }
export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string; deploymentId: string }> }) {
  const auth = await requireScopedProject(request, ["admin", "editor"]); if ("error" in auth) return auth.error;
  const p = await context(params), parsed = deploymentInput.safeParse(await request.json());
  if (!Number.isSafeInteger(p.id) || !parsed.success) return Response.json({ error: "Invalid deployment", issues: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  const db = getDb(), before = unwrap<any>(await db.from("deployments").select().eq("project_id", auth.projectId).eq("id", p.id).eq("task_id", p.taskId).maybeSingle());
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });
  const now = new Date().toISOString(), updated = unwrap<any>(await db.from("deployments").update({ sprint: parsed.data.sprint, environment: parsed.data.environment, type: parsed.data.type, planned_date: parsed.data.plannedDate, actual_date: parsed.data.actualDate, date_label: parsed.data.dateLabel, detail: parsed.data.detail, result: parsed.data.result, updated_at: now }).eq("project_id", auth.projectId).eq("id", p.id).select().single());
  unwrap(await db.from("tasks").update({ updated_at: now, updated_by: auth.principal.identity.email }).eq("project_id", auth.projectId).eq("task_id", p.taskId));
  unwrap(await db.from("audit_logs").insert({ project_id: auth.projectId, actor_id: auth.principal.identity.userId, actor_email: auth.principal.identity.email, action: "update", entity_type: "deployment", entity_id: p.deploymentId, before_json: JSON.stringify(before), after_json: JSON.stringify(updated), created_at: now }));
  return Response.json(camelize(updated));
}
export async function DELETE(request: Request, { params }: { params: Promise<{ taskId: string; deploymentId: string }> }) {
  const auth = await requireScopedProject(request, ["admin", "editor"]); if ("error" in auth) return auth.error;
  const p = await context(params); if (!Number.isSafeInteger(p.id)) return Response.json({ error: "Invalid deployment" }, { status: 400 });
  const db = getDb(), before = unwrap<any>(await db.from("deployments").select().eq("project_id", auth.projectId).eq("id", p.id).eq("task_id", p.taskId).maybeSingle());
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });
  unwrap(await db.from("deployments").delete().eq("project_id", auth.projectId).eq("id", p.id));
  const now = new Date().toISOString();
  unwrap(await db.from("tasks").update({ updated_at: now, updated_by: auth.principal.identity.email }).eq("project_id", auth.projectId).eq("task_id", p.taskId));
  unwrap(await db.from("audit_logs").insert({ project_id: auth.projectId, actor_id: auth.principal.identity.userId, actor_email: auth.principal.identity.email, action: "delete", entity_type: "deployment", entity_id: p.deploymentId, before_json: JSON.stringify(before), created_at: now }));
  return new Response(null, { status: 204 });
}
