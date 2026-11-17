import { z } from "zod";
import { camelize, getDb, unwrap } from "@/db";
import { requireScopedProject } from "@/lib/project-route";
const input = z.object({ revision: z.number().int().positive(), deploymentId: z.number().int().positive().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await requireScopedProject(request, ["admin", "editor"]); if ("error" in auth) return auth.error;
  const parsed = input.safeParse(await request.json()); if (!parsed.success) return Response.json({ error: "Invalid completion request" }, { status: 400 });
  const { taskId } = await params, db = getDb();
  // The preflight only supplies the UI selection; the RPC repeats all checks while locked.
  if (parsed.data.deploymentId === undefined) {
    const planned = unwrap<any[]>(await db.from("deployments").select().eq("project_id", auth.projectId).eq("task_id", taskId).eq("result", "planned"));
    if (!planned.length) return Response.json({ error: "No planned deployment remains", code: "no_planned_deployment" }, { status: 409 });
    if (planned.length > 1) return Response.json({ code: "deployment_selection_required", deployments: camelize(planned) }, { status: 409 });
  }
  try {
    const result = unwrap(await db.rpc("complete_project_production", { p_project_id: auth.projectId, p_task_id: taskId, p_revision: parsed.data.revision, p_deployment_id: parsed.data.deploymentId ?? null, p_mark_task_done: true, p_actor_id: auth.principal.identity.userId, p_actor_email: auth.principal.identity.email }));
    return Response.json(camelize(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete production";
    return Response.json({ error: message, code: /Task changed/i.test(message) ? "revision_conflict" : "deployment_conflict" }, { status: /not found/i.test(message) ? 404 : 409 });
  }
}
