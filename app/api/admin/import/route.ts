import source from "@/data/import-source.json";
import { getDb, unwrap } from "@/db";
import { requireScopedProject } from "@/lib/project-route";

export async function GET(request: Request) {
  const auth = await requireScopedProject(request, ["admin"]);
  if ("error" in auth) return auth.error;
  return Response.json(source.preview);
}

/** Imports the legacy spreadsheet through the same atomic project CSV RPC. */
export async function POST(request: Request) {
  const auth = await requireScopedProject(request, ["admin"]);
  if ("error" in auth) return auth.error;
  const db = getDb(), now = new Date().toISOString();
  const imports = unwrap<any[]>(await db.from("import_runs").select("id").eq("project_id", auth.projectId).limit(1));
  if (imports.length) return Response.json({ error: "The spreadsheet has already been imported for this project" }, { status: 409 });
  const tasks = source.tasks.map((item) => ({ task_id: item.taskId, environment: item.environment, team: item.team, service: item.service, title: item.title, start_date: null, end_date: null, uat_detail: item.uatDetail, production_detail: item.productionDetail, status: item.status, remark: item.remark, revision: 1, created_at: now, updated_at: now, updated_by: auth.principal.identity.email }));
  const deployments = source.deployments.map((item) => ({ task_id: item.taskId, sprint: item.sprint, environment: item.environment, type: item.type, planned_date: null, actual_date: null, date_label: item.plannedDateLabel, detail: item.detail, result: "planned", created_at: now, updated_at: now }));
  const groups: [string, string[]][] = [["environment", source.lookups.environments], ["team", source.lookups.teams], ["service", source.lookups.services], ["status", source.lookups.statuses]];
  const lookups = groups.flatMap(([kind, values]) => values.map((value, sort_order) => ({ kind, value, active: true, sort_order })));
  try {
    const result = unwrap<any>(await db.rpc("import_project_seed", { p_project_id: auth.projectId, p_tasks: tasks, p_deployments: deployments, p_lookups: lookups, p_actor_id: auth.principal.identity.userId, p_actor_email: auth.principal.identity.email, p_source_id: source.source.spreadsheetId, p_valid_tasks: source.preview.validTasks, p_deployment_count: source.preview.deployments, p_warnings: source.preview.warnings, p_duplicates: source.preview.duplicates }));
    return Response.json(result, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : "Database operation failed"; return Response.json({ error: message }, { status: /already exist/i.test(message) ? 409 : 500 }); }
}
