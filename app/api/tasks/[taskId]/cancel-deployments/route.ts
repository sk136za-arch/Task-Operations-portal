import { camelize, getDb, unwrap } from "@/db";
import { requireScopedProject } from "@/lib/project-route";
import { cancelDeploymentInput } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await requireScopedProject(request, ["admin", "editor"]);
  if ("error" in auth) return auth.error;
  const parsed = cancelDeploymentInput.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid cancellation request", issues: parsed.error.flatten() }, { status: 400 });
  const { taskId } = await params;
  try {
    const result = unwrap(await getDb().rpc("cancel_project_task_deployments", {
      p_project_id: auth.projectId,
      p_task_id: taskId,
      p_revision: parsed.data.revision,
      p_scope: parsed.data.scope,
      p_deployment_id: parsed.data.scope === "one" ? parsed.data.deploymentId : null,
      p_task_status: parsed.data.status,
      p_actor_id: auth.principal.identity.userId,
      p_actor_email: auth.principal.identity.email,
    }));
    return Response.json(camelize(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel deployment plans";
    const status = /not found/i.test(message) ? 404 : /invalid|must be|required/i.test(message) ? 400 : 409;
    return Response.json({ error: message, code: status === 409 ? "deployment_conflict" : undefined }, { status });
  }
}
