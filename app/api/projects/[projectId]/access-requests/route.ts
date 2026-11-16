import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb, unwrap } from "@/db";
import { projectPrincipal } from "@/lib/projects";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const identity = await getChatGPTUser();
  if (!identity) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = getDb(), email = identity.email.toLowerCase();
  const project = unwrap<any>(await db.from("projects").select("id").eq("id", projectId).eq("active", true).maybeSingle());
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  const member = await projectPrincipal(projectId);
  if (member) return Response.json({ error: "You already have project access" }, { status: 409 });
  const pending = unwrap<any>(await db.from("project_access_requests").select("id").eq("project_id", projectId).eq("email", email).eq("status", "pending").maybeSingle());
  if (pending) return Response.json({ error: "An access request is already pending" }, { status: 409 });
  unwrap(await db.from("project_access_requests").insert({ project_id: projectId, user_id: identity.userId, email, display_name: identity.displayName, requested_role: "viewer", status: "pending" }));
  return Response.redirect(new URL("/", request.url), 303);
}
