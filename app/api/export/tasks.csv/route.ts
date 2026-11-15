import { getDb } from "@/db";
import { deployments, lookupValues, tasks } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { snapshotToCsv } from "@/lib/task-csv";
export async function GET() {
  const auth = await requireRole(["admin", "editor", "viewer"]);
  if ("error" in auth) return auth.error;
  const db = getDb();
  const body = snapshotToCsv({
    tasks: await db.select().from(tasks),
    deployments: await db.select().from(deployments),
    lookups: await db.select().from(lookupValues),
  });
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=task-ops-export.csv",
      "cache-control": "private, no-store",
    },
  });
}
