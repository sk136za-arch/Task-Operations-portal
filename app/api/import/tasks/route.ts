import { env } from "cloudflare:workers";
import { requireRole } from "@/lib/authz";
import { parseTaskCsv } from "@/lib/task-csv";

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  const form = await request.formData();
  const file = form.get("file");
  const mode = form.get("mode");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv"))
    return Response.json({ error: "Choose a CSV file exported by Task Ops Portal" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return Response.json({ error: "CSV must be 5 MB or smaller" }, { status: 400 });
  if (mode !== "insert" && mode !== "replace")
    return Response.json({ error: "Import mode must be insert or replace" }, { status: 400 });
  const parsed = parseTaskCsv(await file.text());
  if (!parsed.snapshot)
    return Response.json({ error: "CSV validation failed", issues: parsed.errors.slice(0, 20) }, { status: 400 });
  if (!env.DB) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const { tasks, deployments, lookups } = parsed.snapshot;
  const statements: D1PreparedStatement[] = [];
  if (mode === "replace") {
    statements.push(env.DB.prepare("DELETE FROM deployments"));
    statements.push(env.DB.prepare("DELETE FROM tasks"));
    statements.push(env.DB.prepare("DELETE FROM lookup_values"));
  } else {
    const existing = await env.DB.prepare("SELECT task_id FROM tasks").all<{ task_id: string }>();
    const existingIds = new Set(existing.results.map((row) => row.task_id));
    const duplicates = tasks.filter((task) => existingIds.has(task.taskId)).map((task) => task.taskId);
    if (duplicates.length)
      return Response.json({ error: "CSV contains Task IDs that already exist", issues: duplicates.slice(0, 20) }, { status: 409 });
  }
  for (const task of tasks)
    statements.push(env.DB.prepare("INSERT INTO tasks (task_id,environment,team,service,title,start_date,end_date,uat_detail,production_detail,status,remark,revision,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(task.taskId, task.environment, task.team, task.service, task.title, task.startDate, task.endDate, task.uatDetail, task.productionDetail, task.status, task.remark, task.revision, task.createdAt, task.updatedAt, task.updatedBy));
  for (const deployment of deployments)
    statements.push(env.DB.prepare("INSERT INTO deployments (task_id,sprint,environment,type,planned_date,actual_date,date_label,detail,result,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(deployment.taskId, deployment.sprint, deployment.environment, deployment.type, deployment.plannedDate, deployment.actualDate, deployment.dateLabel, deployment.detail, deployment.result, new Date().toISOString(), new Date().toISOString()));
  for (const lookup of lookups)
    statements.push(env.DB.prepare(mode === "insert" ? "INSERT OR IGNORE INTO lookup_values (kind,value,active,sort_order) VALUES (?,?,?,?)" : "INSERT INTO lookup_values (kind,value,active,sort_order) VALUES (?,?,?,?)").bind(lookup.kind, lookup.value, lookup.active ? 1 : 0, lookup.sortOrder));
  statements.push(env.DB.prepare("INSERT INTO audit_logs (actor_id,actor_email,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(auth.principal.identity.userId, auth.principal.identity.email, `csv_${mode}`, "csv", file.name, null, JSON.stringify({ taskCount: tasks.length, deploymentCount: deployments.length, lookupCount: lookups.length }), new Date().toISOString()));
  await env.DB.batch(statements);
  return Response.json({ taskCount: tasks.length, deploymentCount: deployments.length, lookupCount: lookups.length, mode });
}
