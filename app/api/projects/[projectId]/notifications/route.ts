import { camelize, getDb, unwrap } from "@/db";
import { requireScopedProject, withProjectId } from "@/lib/project-route";

type AuditRow = { id: number; actor_email: string; action: string; entity_type: string; entity_id: string; created_at: string };
type ReadRow = { audit_id: number };

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const auth = await requireScopedProject(withProjectId(request, projectId), ["admin", "editor", "viewer"]);
  if ("error" in auth) return auth.error;
  const db = getDb();
  const audits = unwrap<AuditRow[]>(await db.from("audit_logs")
    .select("id, actor_email, action, entity_type, entity_id, created_at")
    .eq("project_id", projectId)
    .in("entity_type", ["task", "deployment"])
    .order("created_at", { ascending: false })
    .limit(100));
  const auditIds = audits.map((audit) => audit.id);
  const reads = auditIds.length
    ? unwrap<ReadRow[]>(await db.from("project_notification_reads").select("audit_id")
      .eq("project_id", projectId)
      .eq("user_id", auth.principal.identity.userId)
      .in("audit_id", auditIds))
    : [];
  return Response.json({ audits: camelize(audits), notificationReadIds: reads.map((row) => row.audit_id) }, {
    headers: { "cache-control": "private, no-store" },
  });
}
