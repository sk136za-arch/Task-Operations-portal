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
  const history = unwrap<any[]>(await db.from("project_access_requests").select("id,status").eq("project_id", projectId).eq("email", email));
  const pending = history.find((item) => item.status === "pending");
  if (pending) return Response.json({ error: "An access request is already pending" }, { status: 409 });
  if (history.some((item) => item.status === "approved")) return Response.json({ error: "You already have project access" }, { status: 409 });
  if (history.filter((item) => item.status === "rejected").length >= 3) return Response.json({ error: "Access requests are no longer available after three rejections for this project." }, { status: 403 });
  unwrap(await db.from("project_access_requests").insert({ project_id: projectId, user_id: identity.userId, email, display_name: identity.displayName, requested_role: "viewer", status: "pending" }));
  return Response.redirect(new URL("/", request.url), 303);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const reviewer = await projectPrincipal(projectId);
  if (!reviewer || reviewer.role !== "admin") return Response.json({ error: "Project admin access is required" }, { status: 403 });
  const body = await request.json().catch(() => null) as { requestId?: number; action?: string } | null;
  if (!body || !Number.isSafeInteger(body.requestId) || !["approve", "reject"].includes(body.action ?? "")) return Response.json({ error: "Invalid access request" }, { status: 400 });
  const db = getDb();
  const pending = unwrap<any>(await db.from("project_access_requests").select().eq("id", body.requestId).eq("project_id", projectId).eq("status", "pending").maybeSingle());
  if (!pending) return Response.json({ error: "Request has already been reviewed" }, { status: 409 });
  const now = new Date().toISOString();
  if (body.action === "approve") {
    unwrap(await db.from("project_members").upsert({ project_id: projectId, user_id: pending.user_id, email: pending.email, display_name: pending.display_name, role: "viewer", active: true, granted_by: reviewer.identity.email, granted_at: now, updated_at: now }, { onConflict: "project_id,email" }));
  }
  const saved = unwrap(await db.from("project_access_requests").update({ status: body.action === "approve" ? "approved" : "rejected", reviewed_by: reviewer.identity.email, reviewed_at: now, updated_at: now }).eq("id", pending.id).select().single());
  return Response.json(saved);
}
