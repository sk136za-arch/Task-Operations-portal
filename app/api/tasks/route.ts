import { camelize, getDb, unwrap } from "@/db";
import { requireScopedProject } from "@/lib/project-route";
import { taskInput } from "@/lib/validation";

export async function GET(request: Request) {
  const auth = await requireScopedProject(request, ["admin", "editor", "viewer"]);
  if ("error" in auth) return auth.error;
  const q = new URL(request.url).searchParams.get("q")?.trim();
  let query = getDb().from("tasks").select().eq("project_id", auth.projectId).order("updated_at", { ascending: false }).limit(500);
  if (q) query = query.or(`task_id.ilike.%${q}%,title.ilike.%${q}%,service.ilike.%${q}%`);
  return Response.json(camelize(unwrap(await query)));
}

export async function POST(request: Request) {
  const auth = await requireScopedProject(request, ["admin", "editor"]);
  if ("error" in auth) return auth.error;
  const parsed = taskInput.omit({ taskId: true, revision: true }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid task", issues: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.startDate && parsed.data.endDate && parsed.data.endDate < parsed.data.startDate)
    return Response.json({ error: "End date must be on or after start date" }, { status: 400 });
  const created = unwrap<any>(await getDb().rpc("create_project_task", {
    p_project_id: auth.projectId,
    p_task: parsed.data,
    p_actor_id: auth.principal.identity.userId,
    p_actor_email: auth.principal.identity.email,
  }));
  return Response.json(camelize(created), { status: 201 });
}
