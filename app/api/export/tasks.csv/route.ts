import { camelize, getDb, unwrap } from "@/db";
import { requireRole } from "@/lib/authz";
import { snapshotToCsv } from "@/lib/task-csv";
export async function GET() {
  const auth = await requireRole(["admin", "editor", "viewer"]); if ("error" in auth) return auth.error;
  const db = getDb(); const [tasks, deployments, lookups] = await Promise.all([unwrap(await db.from("tasks").select()), unwrap(await db.from("deployments").select()), unwrap(await db.from("lookup_values").select())]);
  return new Response(snapshotToCsv(camelize({ tasks, deployments, lookups }) as any), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=task-ops-export.csv", "cache-control": "private, no-store" } });
}
