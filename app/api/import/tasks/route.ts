import { getDb, unwrap } from "@/db";
import { requireProjectRole } from "@/lib/projects";
import { parseTaskCsv } from "@/lib/task-csv";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file"), mode = form.get("mode"), projectId = form.get("projectId");
  if (typeof projectId !== "string" || !projectId) return Response.json({ error: "Project is required" }, { status: 400 });
  const auth = await requireProjectRole(projectId, ["admin"]);
  if ("error" in auth) return auth.error;
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) return Response.json({ error: "Choose a CSV file exported by Task Ops Portal" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "CSV must be 5 MB or smaller" }, { status: 400 });
  if (mode !== "insert" && mode !== "replace") return Response.json({ error: "Import mode must be insert or replace" }, { status: 400 });
  const parsed = parseTaskCsv(await file.text());
  if (!parsed.snapshot) return Response.json({ error: "CSV validation failed", issues: parsed.errors.slice(0, 20) }, { status: 400 });

  try {
    const db = getDb(), { tasks, deployments, lookups } = parsed.snapshot;
    if (mode === "replace") {
      await Promise.all([unwrap(await db.from("deployments").delete().eq("project_id", projectId)), unwrap(await db.from("tasks").delete().eq("project_id", projectId)), unwrap(await db.from("lookup_values").delete().eq("project_id", projectId))]);
    } else {
      const existing = unwrap<any[]>(await db.from("tasks").select("task_id").eq("project_id", projectId));
      const ids = new Set(existing.map((row) => row.task_id));
      const duplicates = tasks.filter((task) => ids.has(task.taskId)).map((task) => task.taskId);
      if (duplicates.length) return Response.json({ error: "CSV contains Task IDs that already exist", issues: duplicates.slice(0, 20) }, { status: 409 });
    }
    const taskRows = tasks.map((task) => ({ project_id: projectId, task_id: task.taskId, environment: task.environment, team: task.team, service: task.service, title: task.title, start_date: task.startDate, end_date: task.endDate, uat_detail: task.uatDetail, production_detail: task.productionDetail, status: task.status, remark: task.remark, revision: task.revision, created_at: task.createdAt, updated_at: task.updatedAt, updated_by: task.updatedBy }));
    const now = new Date().toISOString();
    const deploymentRows = deployments.map((item) => ({ project_id: projectId, task_id: item.taskId, sprint: item.sprint, environment: item.environment, type: item.type, planned_date: item.plannedDate, actual_date: item.actualDate, date_label: item.dateLabel, detail: item.detail, result: item.result, created_at: now, updated_at: now }));
    const lookupRows = lookups.map((item) => ({ project_id: projectId, kind: item.kind, value: item.value, active: item.active, sort_order: item.sortOrder }));
    if (taskRows.length) unwrap(await db.from("tasks").insert(taskRows));
    if (deploymentRows.length) unwrap(await db.from("deployments").insert(deploymentRows));
    if (lookupRows.length) unwrap(await db.from("lookup_values").upsert(lookupRows, { onConflict: "project_id,kind,value", ignoreDuplicates: mode === "insert" }));
    unwrap(await db.from("audit_logs").insert({ project_id: projectId, actor_id: auth.principal.identity.userId, actor_email: auth.principal.identity.email, action: `csv_${mode}`, entity_type: "csv", entity_id: file.name, after_json: JSON.stringify({ taskCount: tasks.length, deploymentCount: deployments.length, lookupCount: lookups.length }), created_at: now }));
    return Response.json({ taskCount: tasks.length, deploymentCount: deployments.length, lookupCount: lookups.length, mode });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Database operation failed" }, { status: 500 });
  }
}
