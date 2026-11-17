import { camelize, getDb, unwrap } from "@/db";
import { requireProjectRole } from "@/lib/projects";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ projectId: string; auditId: string }> },
) {
  const { projectId, auditId } = await params;
  if (!/^\d+$/.test(auditId)) return Response.json({ error: "Invalid notification" }, { status: 400 });
  const id = Number(auditId);
  if (!Number.isSafeInteger(id)) return Response.json({ error: "Invalid notification" }, { status: 400 });
  const auth = await requireProjectRole(projectId, ["admin", "editor", "viewer"]);
  if ("error" in auth) return auth.error;
  const audit = unwrap(await getDb().from("audit_logs")
    .select("id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at")
    .eq("id", id).eq("project_id", projectId).in("entity_type", ["task", "deployment"]).maybeSingle());
  if (!audit) return Response.json({ error: "Notification not found" }, { status: 404 });
  return Response.json(camelize(audit), { headers: { "cache-control": "private, no-store" } });
}
