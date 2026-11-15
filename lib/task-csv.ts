export const TASK_CSV_VERSION = "1";

export const taskCsvHeaders = [
  "schema_version",
  "record_type",
  "task_id",
  "environment",
  "team",
  "service",
  "title",
  "start_date",
  "end_date",
  "uat_detail",
  "production_detail",
  "status",
  "remark",
  "revision",
  "created_at",
  "updated_at",
  "updated_by",
  "sprint",
  "deployment_environment",
  "deployment_type",
  "planned_date",
  "actual_date",
  "date_label",
  "deployment_detail",
  "deployment_result",
  "lookup_kind",
  "lookup_value",
  "lookup_active",
  "lookup_sort_order",
] as const;

export type CsvTask = {
  taskId: string;
  environment: string;
  team: string;
  service: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  uatDetail: string;
  productionDetail: string;
  status: string;
  remark: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type CsvDeployment = {
  taskId: string;
  sprint: string;
  environment: string;
  type: "uat" | "prod";
  plannedDate: string | null;
  actualDate: string | null;
  dateLabel: string;
  detail: string;
  result: string;
};

export type CsvLookup = {
  kind: "environment" | "team" | "service" | "status" | "due_threshold";
  value: string;
  active: boolean;
  sortOrder: number;
};

export type CsvSnapshot = {
  tasks: CsvTask[];
  deployments: CsvDeployment[];
  lookups: CsvLookup[];
};

const required = new Set([
  "task_id",
  "environment",
  "team",
  "service",
  "title",
  "status",
  "created_at",
  "updated_at",
  "updated_by",
]);
const date = /^\d{4}-\d{2}-\d{2}$/;
const iso = /^\d{4}-\d{2}-\d{2}T/;
const lookupKinds = new Set<CsvLookup["kind"]>([
  "environment",
  "team",
  "service",
  "status",
  "due_threshold",
]);

const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const cell = (row: Record<string, string>, name: string) => row[name]?.trim() ?? "";
const nullableDate = (value: string, line: number, label: string, errors: string[]) => {
  if (!value) return null;
  if (!date.test(value)) errors.push(`Row ${line}: ${label} must use YYYY-MM-DD`);
  return value;
};

export function snapshotToCsv(snapshot: CsvSnapshot) {
  const row = (values: Record<string, unknown>) =>
    taskCsvHeaders.map((header) => quote(values[header] ?? "")).join(",");
  return "\uFEFF" + [
    taskCsvHeaders.map(quote).join(","),
    ...snapshot.tasks.map((task) => row({
      schema_version: TASK_CSV_VERSION, record_type: "task", task_id: task.taskId,
      environment: task.environment, team: task.team, service: task.service, title: task.title,
      start_date: task.startDate, end_date: task.endDate, uat_detail: task.uatDetail,
      production_detail: task.productionDetail, status: task.status, remark: task.remark,
      revision: task.revision, created_at: task.createdAt, updated_at: task.updatedAt, updated_by: task.updatedBy,
    })),
    ...snapshot.deployments.map((deployment) => row({
      schema_version: TASK_CSV_VERSION, record_type: "deployment", task_id: deployment.taskId,
      sprint: deployment.sprint, deployment_environment: deployment.environment,
      deployment_type: deployment.type, planned_date: deployment.plannedDate,
      actual_date: deployment.actualDate, date_label: deployment.dateLabel,
      deployment_detail: deployment.detail, deployment_result: deployment.result,
    })),
    ...snapshot.lookups.map((lookup) => row({
      schema_version: TASK_CSV_VERSION, record_type: "lookup", lookup_kind: lookup.kind,
      lookup_value: lookup.value, lookup_active: lookup.active ? "true" : "false",
      lookup_sort_order: lookup.sortOrder,
    })),
  ].join("\r\n");
}

export function parseTaskCsv(input: string): { snapshot?: CsvSnapshot; errors: string[] } {
  const records: string[][] = [];
  let record: string[] = [], value = "", quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { record.push(value); value = ""; }
    else if (char === "\n") { record.push(value.replace(/\r$/, "")); records.push(record); record = []; value = ""; }
    else value += char;
  }
  if (quoted) return { errors: ["CSV contains an unclosed quoted value"] };
  if (value || record.length) { record.push(value); records.push(record); }
  const [header, ...rows] = records;
  const errors: string[] = [];
  if (!header) return { errors: ["CSV is empty"] };
  header[0] = header[0].replace(/^\uFEFF/, "");
  if (header.length !== taskCsvHeaders.length || header.some((value, index) => value !== taskCsvHeaders[index]))
    return { errors: ["CSV header is not a Task Ops Portal export"] };
  const snapshot: CsvSnapshot = { tasks: [], deployments: [], lookups: [] };
  const taskIds = new Set<string>(), lookupKeys = new Set<string>();
  const deploymentKeys = new Set<string>();
  rows.forEach((values, index) => {
    const line = index + 2;
    if (values.length === 1 && !values[0]) return;
    if (values.length !== header.length) { errors.push(`Row ${line}: expected ${header.length} columns`); return; }
    const row = Object.fromEntries(header.map((key, column) => [key, values[column]]));
    if (cell(row, "schema_version") !== TASK_CSV_VERSION) { errors.push(`Row ${line}: unsupported schema version`); return; }
    const type = cell(row, "record_type");
    if (type === "task") {
      for (const key of required) if (!cell(row, key)) errors.push(`Row ${line}: ${key} is required`);
      const taskId = cell(row, "task_id");
      if (taskIds.has(taskId)) errors.push(`Row ${line}: duplicate task_id ${taskId}`);
      taskIds.add(taskId);
      const revision = Number(cell(row, "revision"));
      if (!Number.isInteger(revision) || revision < 1) errors.push(`Row ${line}: revision must be a positive integer`);
      if (!iso.test(cell(row, "created_at")) || !iso.test(cell(row, "updated_at"))) errors.push(`Row ${line}: created_at and updated_at must be ISO timestamps`);
      const startDate = nullableDate(cell(row, "start_date"), line, "start_date", errors);
      const endDate = nullableDate(cell(row, "end_date"), line, "end_date", errors);
      if (startDate && endDate && startDate > endDate) errors.push(`Row ${line}: end_date must not be before start_date`);
      snapshot.tasks.push({ taskId, environment: cell(row, "environment"), team: cell(row, "team"), service: cell(row, "service"), title: cell(row, "title"), startDate, endDate, uatDetail: row.uat_detail ?? "", productionDetail: row.production_detail ?? "", status: cell(row, "status"), remark: row.remark ?? "", revision, createdAt: cell(row, "created_at"), updatedAt: cell(row, "updated_at"), updatedBy: cell(row, "updated_by") });
    } else if (type === "deployment") {
      const taskId = cell(row, "task_id"), kind = cell(row, "deployment_type");
      if (!taskId || !cell(row, "deployment_environment") || !cell(row, "deployment_detail")) errors.push(`Row ${line}: task_id, deployment_environment, and deployment_detail are required`);
      if (kind !== "uat" && kind !== "prod") errors.push(`Row ${line}: deployment_type must be uat or prod`);
      const plannedDate = nullableDate(cell(row, "planned_date"), line, "planned_date", errors);
      const actualDate = nullableDate(cell(row, "actual_date"), line, "actual_date", errors);
      const key = [taskId, cell(row, "sprint"), kind, plannedDate ?? "", cell(row, "deployment_detail")].join("|");
      if (deploymentKeys.has(key)) errors.push(`Row ${line}: duplicate deployment record`);
      deploymentKeys.add(key);
      snapshot.deployments.push({ taskId, sprint: row.sprint ?? "", environment: cell(row, "deployment_environment"), type: kind as "uat" | "prod", plannedDate, actualDate, dateLabel: row.date_label ?? "", detail: row.deployment_detail ?? "", result: row.deployment_result ?? "planned" });
    } else if (type === "lookup") {
      const kind = cell(row, "lookup_kind") as CsvLookup["kind"], value = cell(row, "lookup_value"), active = cell(row, "lookup_active"), sortOrder = Number(cell(row, "lookup_sort_order"));
      if (!lookupKinds.has(kind) || !value) errors.push(`Row ${line}: lookup_kind and lookup_value are invalid`);
      if (active !== "true" && active !== "false") errors.push(`Row ${line}: lookup_active must be true or false`);
      if (!Number.isInteger(sortOrder) || sortOrder < 0) errors.push(`Row ${line}: lookup_sort_order must be a non-negative integer`);
      const key = `${kind}|${value}`;
      if (lookupKeys.has(key)) errors.push(`Row ${line}: duplicate lookup value ${key}`);
      lookupKeys.add(key);
      snapshot.lookups.push({ kind, value, active: active === "true", sortOrder });
    } else errors.push(`Row ${line}: record_type must be task, deployment, or lookup`);
  });
  const knownTasks = new Set(snapshot.tasks.map((task) => task.taskId));
  snapshot.deployments.forEach((deployment, index) => { if (!knownTasks.has(deployment.taskId)) errors.push(`Deployment ${index + 1}: task_id ${deployment.taskId} is not included in the file`); });
  return errors.length ? { errors } : { snapshot, errors: [] };
}
