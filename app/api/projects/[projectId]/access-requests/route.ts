import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb, unwrap } from "@/db";
import { projectPrincipal } from "@/lib/projects";

function dbError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = /Project not found/i.test(message) ? 404 : /pending|already have|reviewed/i.test(message) ? 409 : /no longer available/i.test(message) ? 403 : 500;
  return Response.json({ error: message }, { status });
}

export async function POST(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const identity = await getChatGPTUser();
  if (!identity) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const result = unwrap(await getDb().rpc("submit_project_access_request", { p_project_id: projectId, p_user_id: identity.userId, p_email: identity.email.toLowerCase(), p_display_name: identity.displayName }));
    return Response.json(result, { status: 201 });
  } catch (error) { return dbError(error, "Unable to request access"); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const reviewer = await projectPrincipal(projectId);
  if (!reviewer || reviewer.role !== "admin") return Response.json({ error: "Project admin access is required" }, { status: 403 });
  const body = await request.json().catch(() => null) as { requestId?: number; action?: string } | null;
  if (!body || !Number.isSafeInteger(body.requestId) || !["approve", "reject"].includes(body.action ?? "")) return Response.json({ error: "Invalid access request" }, { status: 400 });
  try {
    const result = unwrap(await getDb().rpc("review_project_access_request", { p_project_id: projectId, p_request_id: body.requestId, p_action: body.action, p_reviewer_email: reviewer.identity.email }));
    return Response.json(result);
  } catch (error) { return dbError(error, "Unable to review access request"); }
}
