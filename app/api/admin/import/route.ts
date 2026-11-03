import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import source from "@/data/import-source.json";
import { getDb } from "@/db";
import { importRuns } from "@/db/schema";
import { requireRole } from "@/lib/authz";
export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  return Response.json(source.preview);
}
export async function POST() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  const db = getDb(),
    now = new Date().toISOString();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(importRuns);
  if (Number(count) > 0)
    return Response.json(
      { error: "The spreadsheet has already been imported" },
      { status: 409 },
    );
  if (!env.DB)
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  const statements: D1PreparedStatement[] = [];
  for (const t of source.tasks)
    statements.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO tasks (task_id,environment,team,service,title,uat_detail,production_detail,status,remark,revision,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)",
      ).bind(
        t.taskId,
        t.environment,
        t.team,
        t.service,
        t.title,
        t.uatDetail,
        t.productionDetail,
        t.status,
        t.remark,
        now,
        now,
        auth.principal.identity.email,
      ),
    );
  for (const d of source.deployments)
    statements.push(
      env.DB.prepare(
        "INSERT INTO deployments (task_id,sprint,environment,type,planned_date,actual_date,date_label,detail,result,created_at,updated_at) VALUES (?,?,?,?,NULL,NULL,?,?,'planned',?,?)",
      ).bind(
        d.taskId,
        d.sprint,
        d.environment,
        d.type,
        d.plannedDateLabel,
        d.detail,
        now,
        now,
      ),
    );
  const groups: [string, string[]][] = [
    ["environment", source.lookups.environments],
    ["team", source.lookups.teams],
    ["service", source.lookups.services],
    ["status", source.lookups.statuses],
  ];
  for (const [kind, values] of groups)
    for (let i = 0; i < values.length; i++)
      statements.push(
        env.DB.prepare(
          "INSERT OR IGNORE INTO lookup_values (kind,value,active,sort_order) VALUES (?,?,1,?)",
        ).bind(kind, values[i], i),
      );
  statements.push(
    env.DB.prepare(
      "INSERT INTO import_runs (source_id,imported_by,valid_tasks,deployments,warnings,duplicates,created_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(
      source.source.spreadsheetId,
      auth.principal.identity.email,
      source.preview.validTasks,
      source.preview.deployments,
      source.preview.warnings,
      source.preview.duplicates,
      now,
    ),
  );
  statements.push(
    env.DB.prepare(
      "INSERT INTO audit_logs (actor_id,actor_email,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,'import','spreadsheet',?,NULL,?,?)",
    ).bind(
      auth.principal.identity.userId,
      auth.principal.identity.email,
      source.source.spreadsheetId,
      JSON.stringify(source.preview),
      now,
    ),
  );
  await env.DB.batch(statements);
  return Response.json(
    {
      taskCount: source.preview.validTasks,
      deploymentCount: source.preview.deployments,
    },
    { status: 201 },
  );
}
