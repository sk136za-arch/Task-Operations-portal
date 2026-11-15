import source from "@/data/import-source.json";
import { getDb, unwrap } from "@/db";
import { requireRole } from "@/lib/authz";

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  return Response.json(source.preview);
}

export async function POST() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  try {
    const db = getDb(), now = new Date().toISOString();
    const imports = unwrap<any[]>(await db.from("import_runs").select("id").limit(1));
    if (imports.length) return Response.json({ error: "The spreadsheet has already been imported" }, { status: 409 });
    const tasks = source.tasks.map((item) => ({ task_id: item.taskId, environment: item.environment, team: item.team, service: item.service, title: item.title, uat_detail: item.uatDetail, production_detail: item.productionDetail, status: item.status, remark: item.remark, revision: 1, created_at: now, updated_at: now, updated_by: auth.principal.identity.email }));
    const deployments = source.deployments.map((item) => ({ task_id: item.taskId, sprint: item.sprint, environment: item.environment, type: item.type, date_label: item.plannedDateLabel, detail: item.detail, result: "planned", created_at: now, updated_at: now }));
    const groups: [string, string[]][] = [["environment", source.lookups.environments], ["team", source.lookups.teams], ["service", source.lookups.services], ["status", source.lookups.statuses]];
    const lookups = groups.flatMap(([kind, values]) => values.map((value, sort_order) => ({ kind, value, active: true, sort_order })));
    if (tasks.length) unwrap(await db.from("tasks").upsert(tasks, { onConflict: "task_id", ignoreDuplicates: true }));
    if (deployments.length) unwrap(await db.from("deployments").insert(deployments));
    if (lookups.length) unwrap(await db.from("lookup_values").upsert(lookups, { onConflict: "kind,value", ignoreDuplicates: true }));
    unwrap(await db.from("import_runs").insert({ source_id: source.source.spreadsheetId, imported_by: auth.principal.identity.email, valid_tasks: source.preview.validTasks, deployments: source.preview.deployments, warnings: source.preview.warnings, duplicates: source.preview.duplicates, created_at: now }));
    unwrap(await db.from("audit_logs").insert({ actor_id: auth.principal.identity.userId, actor_email: auth.principal.identity.email, action: "import", entity_type: "spreadsheet", entity_id: source.source.spreadsheetId, after_json: JSON.stringify(source.preview), created_at: now }));
    return Response.json({ taskCount: source.preview.validTasks, deploymentCount: source.preview.deployments }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Database operation failed" }, { status: 500 }); }
}
