import { camelize, getDb, unwrap } from "@/db";
import { requireProjectRole } from "@/lib/projects";
import { parseTaskCsv, snapshotToCsv } from "@/lib/task-csv";

type Snapshot = NonNullable<ReturnType<typeof parseTaskCsv>["snapshot"]>;

function taskRows(snapshot: Snapshot) {
  return snapshot.tasks.map((task) => ({ task_id: task.taskId, environment: task.environment, team: task.team, service: task.service, title: task.title, start_date: task.startDate, end_date: task.endDate, uat_detail: task.uatDetail, production_detail: task.productionDetail, status: task.status, remark: task.remark, revision: task.revision, created_at: task.createdAt, updated_at: task.updatedAt, updated_by: task.updatedBy }));
}

function deploymentRows(snapshot: Snapshot) {
  const now = new Date().toISOString();
  return snapshot.deployments.map((item) => ({ task_id: item.taskId, sprint: item.sprint, environment: item.environment, type: item.type, planned_date: item.plannedDate, actual_date: item.actualDate, date_label: item.dateLabel, detail: item.detail, result: item.result, created_at: now, updated_at: now }));
}

function lookupRows(snapshot: Snapshot) {
  return snapshot.lookups.map((item) => ({ kind: item.kind, value: item.value, active: item.active, sort_order: item.sortOrder }));
}

export async function importProjectCsv(projectId: string, form: FormData) {
  const file = form.get("file"), mode = form.get("mode");
  const auth = await requireProjectRole(projectId, ["admin"]);
  if ("error" in auth) return auth.error;
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) return Response.json({ error: "Choose a CSV file exported by Task Ops Portal" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "CSV must be 5 MB or smaller" }, { status: 400 });
  if (mode !== "insert" && mode !== "replace") return Response.json({ error: "Import mode must be insert or replace" }, { status: 400 });
  const parsed = parseTaskCsv(await file.text());
  if (!parsed.snapshot) return Response.json({ error: "CSV validation failed", issues: parsed.errors.slice(0, 20) }, { status: 400 });
  try {
    const result = unwrap(await getDb().rpc("import_project_csv", { p_project_id: projectId, p_mode: mode, p_tasks: taskRows(parsed.snapshot), p_deployments: deploymentRows(parsed.snapshot), p_lookups: lookupRows(parsed.snapshot), p_actor_id: auth.principal.identity.userId, p_actor_email: auth.principal.identity.email, p_file_name: file.name }));
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database operation failed";
    return Response.json({ error: message }, { status: /already exist/i.test(message) ? 409 : 500 });
  }
}

export async function exportProjectCsv(projectId: string) {
  const auth = await requireProjectRole(projectId, ["admin", "editor", "viewer"]);
  if ("error" in auth) return auth.error;
  const db = getDb();
  const [tasks, deployments, lookups] = await Promise.all([unwrap(await db.from("tasks").select().eq("project_id", projectId)), unwrap(await db.from("deployments").select().eq("project_id", projectId)), unwrap(await db.from("lookup_values").select().eq("project_id", projectId))]);
  return new Response(snapshotToCsv(camelize({ tasks, deployments, lookups }) as never), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=task-ops-export.csv", "cache-control": "private, no-store" } });
}

export function projectIdFromSameOriginReferer(request: Request) {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const source = new URL(referer);
    if (source.origin !== new URL(request.url).origin) return null;
    return source.pathname.match(/^\/projects\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i)?.[1] ?? null;
  } catch { return null; }
}
