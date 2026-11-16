import { camelize, getDb, unwrap } from "@/db";
import { requireScopedProject } from "@/lib/project-route";
import { deploymentInput } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await requireScopedProject(request, ["admin", "editor"]); if ("error" in auth) return auth.error;
  const { taskId } = await params, parsed = deploymentInput.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid deployment", issues: parsed.error.flatten() }, { status: 400 });
  const db = getDb(), task = unwrap<any>(await db.from("tasks").select("id").eq("project_id", auth.projectId).eq("task_id", taskId).maybeSingle());
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  const now = new Date().toISOString();
  const created = unwrap<any>(await db.from("deployments").insert({ project_id: auth.projectId, task_id: taskId, sprint: parsed.data.sprint, environment: parsed.data.environment, type: parsed.data.type, planned_date: parsed.data.plannedDate, actual_date: parsed.data.actualDate, date_label: parsed.data.dateLabel, detail: parsed.data.detail, result: parsed.data.result, created_at: now, updated_at: now }).select().single());
  unwrap(await db.from("tasks").update({ updated_at: now, updated_by: auth.principal.identity.email }).eq("project_id", auth.projectId).eq("task_id", taskId));
  unwrap(await db.from("audit_logs").insert({ project_id: auth.projectId, actor_id: auth.principal.identity.userId, actor_email: auth.principal.identity.email, action: "create", entity_type: "deployment", entity_id: String(created.id), after_json: JSON.stringify(created), created_at: now }));
  return Response.json(camelize(created), { status: 201 });
}
