import { getDb, unwrap } from "@/db";
import { requireProjectRole } from "@/lib/projects";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ projectId: string; auditId: string }> },
) {
  const { projectId, auditId } = await params;
  if (!/^\d+$/.test(auditId)) return Response.json({ error: "Invalid notification" }, { status: 400 });
  const auth = await requireProjectRole(projectId, ["admin", "editor", "viewer"]);
  if ("error" in auth) return auth.error;
  const id = Number(auditId);
  if (!Number.isSafeInteger(id)) return Response.json({ error: "Invalid notification" }, { status: 400 });
  const db = getDb();
  const audit = unwrap(await db.from("audit_logs").select("id").eq("id", id).eq("project_id", projectId).in("entity_type", ["task", "deployment"]).maybeSingle());
  if (!audit) return Response.json({ error: "Notification not found" }, { status: 404 });
  unwrap(await db.from("project_notification_reads").upsert({ project_id: projectId, audit_id: id, user_id: auth.principal.identity.userId, read_at: new Date().toISOString() }, { onConflict: "project_id,audit_id,user_id" }));
  return Response.json({ auditId: id, read: true });
}
