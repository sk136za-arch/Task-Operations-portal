import { camelize, getDb, unwrap } from "@/db";
import { requireScopedProject } from "@/lib/project-route";
import { deploymentInput } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await requireScopedProject(request, ["admin", "editor"]); if ("error" in auth) return auth.error;
  const { taskId } = await params, parsed = deploymentInput.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid deployment", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const created = unwrap<any>(await getDb().rpc("create_project_deployment", {
      p_project_id: auth.projectId,
      p_task_id: taskId,
      p_deployment: parsed.data,
      p_actor_id: auth.principal.identity.userId,
      p_actor_email: auth.principal.identity.email,
    }));
    return Response.json(camelize(created), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create deployment";
    return Response.json({ error: message }, { status: /not found/i.test(message) ? 404 : 409 });
  }
}
