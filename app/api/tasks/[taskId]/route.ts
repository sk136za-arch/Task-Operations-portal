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
  try {
    const updated = unwrap(await getDb().rpc("update_project_task", { p_project_id: auth.projectId, p_task_id: taskId, p_revision: parsed.data.revision, p_task: parsed.data, p_actor_id: auth.principal.identity.userId, p_actor_email: auth.principal.identity.email }));
    return Response.json(camelize(updated));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update task";
    if (/Use the deployment transition workflow/i.test(message)) return Response.json({ error: message, code: "use_deployment_transition" }, { status: 409 });
    return Response.json({ error: message }, { status: /not found/i.test(message) ? 404 : 409 });
  }
}
