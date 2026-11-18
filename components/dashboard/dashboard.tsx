"use client";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Archive,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Download,
  LayoutDashboard,
  ListTodo,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  TestTube2,
  Trash2,
  Upload,
} from "lucide-react";
import { Chart, Kpi, PanelTitle } from "./overview";
import { TaskTable } from "./task-table";
import { ConfigPanel } from "./configuration";
import { TimelineBoard } from "./timeline-board";
import { Field, Modal, SelectField } from "./dialogs";
import { useLoading } from "@/components/loading/loading-provider";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { isNotificationRead, isOwnNotification } from "@/lib/notification-state";

import type { Audit, Deployment, Lookup, Principal, Task, User } from "./types";
import {
  blankTask,
  dateInputValue,
  deployPlanDate,
  dueThresholdsFrom,
  isDone,
  taskDeployPlan,
  timelineDefaultRange,
  tone,
} from "./utils";

type AuditSnapshot = Record<string, unknown>;
type AuditRecordType = "task" | "deployment";
type AuditRecord = { type: AuditRecordType; key: string; title: string; values: AuditSnapshot };
type AuditChange = { label: string; before?: unknown; after?: unknown; kind: "added" | "removed" | "changed" };
type AuditChangeGroup = { key: string; title: string; changes: AuditChange[] };

const AUDIT_FIELDS: Record<AuditRecordType, Array<[string, string]>> = {
  task: [
    ["task_id", "Task ID"], ["environment", "Environment"], ["team", "Team"],
    ["service", "Service"], ["title", "Title"], ["start_date", "Start date"],
    ["end_date", "End date"], ["uat_detail", "UAT detail"],
    ["production_detail", "Production detail"], ["status", "Status"], ["remark", "Remark"],
  ],
  deployment: [
    ["sprint", "Sprint"], ["environment", "Environment"], ["type", "Type"],
    ["planned_date", "Planned date"], ["actual_date", "Actual date"],
    ["date_label", "Date label"], ["detail", "Detail"], ["result", "Result"],
  ],
};

function asAuditRecord(value: unknown): AuditSnapshot | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AuditSnapshot)
    : null;
}

function auditRecordKey(type: AuditRecordType, values: AuditSnapshot) {
  if (values.id !== undefined && values.id !== null) return `${type}:${String(values.id)}`;
  return type === "task"
    ? `task:${String(values.task_id ?? "unknown")}`
    : `deployment:${String(values.task_id ?? "unknown")}:${String(values.sprint ?? "")}:${String(values.type ?? "")}:${String(values.environment ?? "")}`;
}

function auditRecordTitle(type: AuditRecordType, values: AuditSnapshot) {
  if (type === "task") return `Task · ${String(values.task_id ?? "Unknown")}`;
  const name = values.sprint || values.type || "Deployment plan";
  return `Deployment · ${String(name)}${values.environment ? ` · ${String(values.environment)}` : ""}`;
}

function snapshotRecords(snapshot: AuditSnapshot | null, entityType: string): AuditRecord[] {
  if (!snapshot) return [];
  const records: AuditRecord[] = [];
  const add = (type: AuditRecordType, value: unknown) => {
    const values = asAuditRecord(value);
    if (values) records.push({ type, key: auditRecordKey(type, values), title: auditRecordTitle(type, values), values });
  };
  if (snapshot.task || snapshot.deployment || Array.isArray(snapshot.deployments)) {
    add("task", snapshot.task);
    add("deployment", snapshot.deployment);
    if (Array.isArray(snapshot.deployments)) snapshot.deployments.forEach((item) => add("deployment", item));
  } else {
    add(entityType === "deployment" ? "deployment" : "task", snapshot);
  }
  return records;
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function displayAuditValue(value: unknown) {
  if (!hasValue(value)) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
}

function buildAuditChanges(before: AuditSnapshot | null, after: AuditSnapshot | null, entityType: string): AuditChangeGroup[] {
  const beforeRecords = new Map(snapshotRecords(before, entityType).map((record) => [record.key, record]));
  const afterRecords = new Map(snapshotRecords(after, entityType).map((record) => [record.key, record]));
  const recordKeys = [...new Set([...beforeRecords.keys(), ...afterRecords.keys()])];
  return recordKeys.flatMap((key) => {
    const previous = beforeRecords.get(key);
    const next = afterRecords.get(key);
    const type = previous?.type ?? next?.type;
    if (!type) return [];
    const changes = AUDIT_FIELDS[type].flatMap(([field, label]) => {
      const oldValue = previous?.values[field];
      const newValue = next?.values[field];
      if (!previous) return hasValue(newValue) ? [{ label, after: newValue, kind: "added" as const }] : [];
      if (!next) return hasValue(oldValue) ? [{ label, before: oldValue, kind: "removed" as const }] : [];
      return valuesEqual(oldValue, newValue) ? [] : [{ label, before: oldValue, after: newValue, kind: "changed" as const }];
    });
    return changes.length ? [{ key, title: previous?.title ?? next?.title ?? "Change", changes }] : [];
  });
}

function parseAuditSnapshot(value?: string | null): AuditSnapshot | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as AuditSnapshot)
      : null;
  } catch {
    return null;
  }
}

function snapshotTaskId(snapshot: AuditSnapshot | null) {
  const direct = snapshot?.taskId ?? snapshot?.task_id;
  if (typeof direct === "string") return direct;
  const task = snapshot?.task;
  if (task && typeof task === "object") {
    const nested = task as AuditSnapshot;
    const taskId = nested.taskId ?? nested.task_id;
    if (typeof taskId === "string") return taskId;
  }
  return null;
}

function auditTimestamp(value: string) {
  return value.replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

export default function Dashboard({
  tasks: initialTasks,
  deployments: initialDeployments,
  lookups: initialLookups,
  users: initialUsers,
  audits: initialAudits,
  accessRequests: initialAccessRequests,
  principal,
  projectId,
  signOutPath,
  projectSettings,
  notificationsStartedAt,
}: {
  tasks: Task[];
  deployments: Deployment[];
  lookups: Lookup[];
  users: User[];
  audits: Audit[];
  accessRequests: Array<{ id: number; email: string; displayName: string; createdAt: string }>;
  principal: { email: string; name: string; role: string };
  projectId: string;
  signOutPath: string;
  projectSettings?: React.ReactNode;
  notificationsStartedAt?: string | null;
}) {
  const router = useRouter();
  const { runWithLoading } = useLoading();
  const locallyChangedTaskIds = useRef(new Set<string>());
  const locallyChangedDeploymentIds = useRef(new Set<number>());
  const locallyDeletedDeploymentIds = useRef(new Set<number>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tasks, setTasks] = useState(initialTasks);
  const [deployments, setDeployments] = useState(initialDeployments);
  const [lookups, setLookups] = useState(initialLookups);
  const [users, setUsers] = useState(initialUsers);
  const [audits, setAudits] = useState(initialAudits);
  const [accessRequests, setAccessRequests] = useState(initialAccessRequests);
  const [accessAudits, setAccessAudits] = useState<Audit[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const notificationsLoaded = useRef(initialAudits.length > 0);
  const accessLoaded = useRef(initialUsers.length > 0 || initialAccessRequests.length > 0);
  const notificationsLoadingRef = useRef(false);
  const accessLoadingRef = useRef(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [team, setTeam] = useState("all");
  const [environment, setEnvironment] = useState("all");
  const [year, setYear] = useState("all");
  const [active, setActive] = useState<Task | null>(null);
  const [tab, setTab] = useState<
    "overview" | "tasks" | "done" | "timeline" | "notifications" | "config" | "access"
  >("overview");
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null);
  const [notificationSource, setNotificationSource] = useState<"others" | "mine">("others");
  const [readAuditIds, setReadAuditIds] = useState<Set<number>>(() => new Set());
  const [taskForm, setTaskForm] = useState<any>(null);
  const [deploymentForm, setDeploymentForm] = useState<{
    task: Task;
    deployment?: Deployment;
  } | null>(null);
  const [userForm, setUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [completionChoice, setCompletionChoice] = useState<{
    task: Task;
    deployments: Deployment[];
  } | null>(null);
  const [completionDeploymentId, setCompletionDeploymentId] = useState<
    number | null
  >(null);
  const [cancellationChoice, setCancellationChoice] = useState<{
    task: Task;
    status: string;
    deployments: Deployment[];
  } | null>(null);
  const [cancellationScope, setCancellationScope] = useState<"all" | "one">(
    "all",
  );
  const [cancellationDeploymentId, setCancellationDeploymentId] = useState<
    number | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvNotice, setCsvNotice] = useState("");
  const [timelineRange] = useState(timelineDefaultRange);
  const [startDate, setStartDate] = useState(timelineRange.startDate);
  const [endDate, setEndDate] = useState(timelineRange.endDate);
  const [timelineEnvironment, setTimelineEnvironment] = useState("all");
  useEffect(() => { startTransition(() => setTasks((current) => {
    const currentById = new Map(current.map((task) => [task.taskId, task]));
    const next = initialTasks.map((incoming) => {
      const local = currentById.get(incoming.taskId);
      if (!local || !locallyChangedTaskIds.current.has(incoming.taskId)) return incoming;
      if (local.updatedAt > incoming.updatedAt) return local;
      locallyChangedTaskIds.current.delete(incoming.taskId);
      return incoming;
    });
    for (const local of current) if (!next.some((task) => task.taskId === local.taskId) && locallyChangedTaskIds.current.has(local.taskId)) next.push(local);
    return next;
  })); }, [initialTasks]);
  useEffect(() => { startTransition(() => setDeployments((current) => {
    const currentById = new Map(current.map((deployment) => [deployment.id, deployment]));
    const incomingIds = new Set(initialDeployments.map((deployment) => deployment.id));
    const next = initialDeployments.flatMap((incoming) => {
      if (locallyDeletedDeploymentIds.current.has(incoming.id)) return [];
      const local = currentById.get(incoming.id);
      if (!local || !locallyChangedDeploymentIds.current.has(incoming.id)) return [incoming];
      if (local.updatedAt > incoming.updatedAt) return [local];
      locallyChangedDeploymentIds.current.delete(incoming.id);
      return [incoming];
    });
    for (const id of [...locallyDeletedDeploymentIds.current]) if (!incomingIds.has(id)) locallyDeletedDeploymentIds.current.delete(id);
    for (const local of current) if (!next.some((deployment) => deployment.id === local.id) && locallyChangedDeploymentIds.current.has(local.id)) next.push(local);
    return next;
  })); }, [initialDeployments]);
  useEffect(() => { startTransition(() => setLookups(initialLookups)); }, [initialLookups]);
  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);

  const loadNotifications = useCallback(async () => {
    if (notificationsLoadingRef.current) return;
    notificationsLoadingRef.current = true;
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const response = await fetchWithTimeout(`/api/projects/${projectId}/notifications`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { audits?: Audit[]; notificationReadIds?: number[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to load notifications");
      setAudits(body.audits ?? []);
      setReadAuditIds(new Set(body.notificationReadIds ?? []));
      notificationsLoaded.current = true;
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : "Unable to load notifications");
    } finally {
      notificationsLoadingRef.current = false;
      setNotificationsLoading(false);
    }
  }, [projectId]);

  const loadAccess = useCallback(async () => {
    if (accessLoadingRef.current || principal.role !== "admin") return;
    accessLoadingRef.current = true;
    setAccessLoading(true);
    setAccessError("");
    try {
      const [membersResponse, requestsResponse] = await Promise.all([
        fetchWithTimeout(`/api/projects/${projectId}/members`, { cache: "no-store" }),
        fetchWithTimeout(`/api/projects/${projectId}/access-requests`, { cache: "no-store" }),
      ]);
      const [membersBody, requestsBody] = await Promise.all([
        membersResponse.json().catch(() => ({})) as Promise<User[] & { error?: string }>,
        requestsResponse.json().catch(() => ({})) as Promise<{ requests?: Array<{ id: number; email: string; displayName: string; createdAt: string }>; audits?: Audit[]; error?: string }>,
      ]);
      if (!membersResponse.ok) throw new Error(membersBody.error || "Unable to load project members");
      if (!requestsResponse.ok) throw new Error(requestsBody.error || "Unable to load access requests");
      setUsers(membersBody);
      setAccessRequests(requestsBody.requests ?? []);
      setAccessAudits(requestsBody.audits ?? []);
      accessLoaded.current = true;
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Unable to load access data");
    } finally {
      accessLoadingRef.current = false;
      setAccessLoading(false);
    }
  }, [principal.role, projectId]);

  useEffect(() => {
    if (tab === "notifications" && !notificationsLoaded.current) void loadNotifications();
    if (tab === "access" && !accessLoaded.current) void loadAccess();
  }, [tab, loadAccess, loadNotifications]);
  useEffect(() => {
    const timer = window.setTimeout(() => { if (!notificationsLoaded.current) void loadNotifications(); }, 500);
    return () => window.clearTimeout(timer);
  }, [loadNotifications]);
  const refreshInBackground = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      startTransition(() => router.refresh());
    }, 1200);
  };
  const replaceTask = (next: Task) => {
    locallyChangedTaskIds.current.add(next.taskId);
    setTasks((current) => {
      const exists = current.some((task) => task.taskId === next.taskId);
      return exists ? current.map((task) => task.taskId === next.taskId ? next : task) : [next, ...current];
    });
  };
  const replaceDeployment = (next: Deployment) => {
    locallyChangedDeploymentIds.current.add(next.id);
    setDeployments((current) => {
      const exists = current.some((deployment) => deployment.id === next.id);
      return exists ? current.map((deployment) => deployment.id === next.id ? next : deployment) : [...current, next];
    });
  };
  const touchTask = (taskId: string, updatedAt: string) => setTasks((current) => current.map((task) => {
    if (task.taskId !== taskId) return task;
    locallyChangedTaskIds.current.add(taskId);
    return { ...task, updatedAt };
  }));
  const years = useMemo(
    () =>
      [
        ...new Set(
          tasks
            .map((task) => new Date(task.updatedAt).getFullYear())
            .filter((v): v is number => Boolean(v)),
        ),
      ].sort((a, b) => b - a),
    [tasks],
  );
  const dueThresholds = useMemo(() => dueThresholdsFrom(lookups), [lookups]);
  const isOwnActivity = (audit: Audit) => isOwnNotification(audit, principal.email);
  const isAuditRead = (audit: Audit) =>
    isNotificationRead(audit, principal.email, notificationsStartedAt, readAuditIds);
  const notificationAudits = audits.filter(
    (audit) =>
      (audit.entityType === "task" || audit.entityType === "deployment") &&
      (notificationSource === "mine" ? isOwnActivity(audit) : !isOwnActivity(audit)),
  );
  const unreadNotificationCount = audits.filter(
    (audit) =>
      (audit.entityType === "task" || audit.entityType === "deployment") &&
      !isOwnActivity(audit) &&
      !isAuditRead(audit),
  ).length;
  const auditTask = (audit: Audit) => {
    if (audit.entityType === "task") return tasks.find((task) => task.taskId === audit.entityId) ?? null;
    const deployment = deployments.find((item) => String(item.id) === audit.entityId);
    const taskId = deployment?.taskId || snapshotTaskId(parseAuditSnapshot(audit.afterJson)) || snapshotTaskId(parseAuditSnapshot(audit.beforeJson));
    return taskId ? tasks.find((task) => task.taskId === taskId) ?? null : null;
  };
  async function openNotification(audit: Audit) {
    try {
      await runWithLoading("Loading activity details…", async () => {
        const response = await fetchWithTimeout(`/api/projects/${projectId}/notifications/${audit.id}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load notification");
        const detailedAudit = body as Audit;
        setAudits((current) => current.map((item) => item.id === audit.id ? detailedAudit : item));
        setSelectedAudit(detailedAudit);
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to load notification");
      return;
    }
    if (isAuditRead(audit)) return;
    setReadAuditIds((current) => new Set(current).add(audit.id));
    try {
      const response = await fetchWithTimeout(`/api/projects/${projectId}/notifications/${audit.id}/read`, { method: "POST" });
      if (!response.ok) throw new Error("Unable to mark notification as read");
    } catch {
      setReadAuditIds((current) => {
        const next = new Set(current);
        next.delete(audit.id);
        return next;
      });
    }
  }
  const taskMatchesYear = (task?: Task) =>
    year === "all" ||
    (task !== undefined &&
      String(new Date(task.updatedAt).getFullYear()) === year);
  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          taskMatchesYear(t) &&
          (status === "all" || t.status === status) &&
          (team === "all" || t.team === team) &&
          (environment === "all" || t.environment === environment) &&
          (!q ||
            `${t.taskId} ${t.title} ${t.service}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [tasks, status, team, environment, q, year],
  );
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.taskId, task])),
    [tasks],
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = deployments
    .filter((d) => d.result.trim().toLowerCase() === "planned")
    .map((d) => ({
      d: {
        ...d,
        detail: (d.detail?.trim() || "—").replace(/\s*\n+\s*/g, " · "),
      },
      date: deployPlanDate(d),
    }))
    .filter(
      (x): x is { d: Deployment; date: Date } =>
        x.date !== null &&
        taskMatchesYear(tasksById.get(x.d.taskId)),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const activeTasks = filtered.filter((t) => !isDone(t));
  const doneTasks = filtered.filter(isDone);
  const stats = {
    total: filtered.length,
    done: filtered.filter((t) => /done/i.test(t.status)).length,
    testing: filtered.filter((t) => /test/i.test(t.status)).length,
    waiting: filtered.filter((t) => /wait/i.test(t.status)).length,
    risk: filtered.filter((t) => /fail|block/i.test(t.status)).length,
  };
  const grouped = (key: "status" | "team") =>
    Object.entries(
      filtered.reduce<Record<string, number>>(
        (a, t) => ((a[t[key]] = (a[t[key]] || 0) + 1), a),
        {},
      ),
    ).sort((a, b) => b[1] - a[1]);
  async function request<T>(url: string, init: RequestInit, label = "Saving changes…") {
    setBusy(true);
    try {
      return await runWithLoading(label, async () => {
        const target = new URL(url, window.location.origin);
        if (target.pathname.startsWith("/api/tasks")) target.pathname = `/api/projects/${projectId}${target.pathname.slice(4)}`;
        else if (target.pathname === "/api/admin/users") target.pathname = `/api/projects/${projectId}/members`;
        else if (target.pathname === "/api/admin/settings") target.pathname = `/api/projects/${projectId}/settings`;
        else if (target.pathname === "/api/admin/import") target.pathname = `/api/projects/${projectId}/seed-import`;
        const r = await fetchWithTimeout(`${target.pathname}${target.search}`, init);
        const text = await r.text();
        const body = (text ? JSON.parse(text) : {}) as T & { error?: string };
        if (!r.ok) throw new Error(body.error || "Request failed");
        setTaskForm(null); setDeploymentForm(null); setUserForm(false); setEditingUser(null); setActive(null);
        return body;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Request failed");
    } finally { setBusy(false); }
  }
  async function runImport() {
    const result = await request<object>("/api/admin/import", { method: "POST" }, "Importing project data…");
    if (result) refreshInBackground();
  }
  async function reviewAccessRequest(requestId: number, action: "approve" | "reject") {
    const result = await request<object>(`/api/projects/${projectId}/access-requests`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, action }) }, action === "approve" ? "Approving access…" : "Rejecting access…");
    if (result) { setAccessRequests((current) => current.filter((item) => item.id !== requestId)); refreshInBackground(); }
  }
  async function importCsv(mode: "insert" | "replace") {
    if (!csvFile) return;
    setBusy(true);
    try {
      await runWithLoading(mode === "replace" ? "Replacing project data…" : "Importing CSV…", async () => {
        const data = new FormData();
        data.set("file", csvFile); data.set("mode", mode); data.set("projectId", projectId);
        const response = await fetchWithTimeout("/api/import/tasks", { method: "POST", body: data });
        const body = await response.json();
        if (!response.ok) { const details = Array.isArray(body.issues) ? `\n${body.issues.join("\n")}` : ""; throw new Error(`${body.error || "Import failed"}${details}`); }
        setCsvNotice(`${mode === "replace" ? "Replaced" : "Added"} ${body.taskCount} tasks and ${body.deploymentCount} deployment plans.`);
        setCsvImportOpen(false); setCsvFile(null);
        window.location.reload();
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }
  async function saveTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const editing = Boolean(taskForm?.revision);
    if (editing) data.revision = taskForm.revision;
    const saved = await request<Task>(editing ? `/api/tasks/${taskForm.taskId}` : "/api/tasks", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }, editing ? "Saving task…" : "Creating task…");
    if (saved) { replaceTask(saved); refreshInBackground(); }
  }
  async function saveUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const editing = Boolean(editingUser);
    const saved = await request<object>("/api/admin/users", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...data,
        email: editingUser?.email || data.email,
        active: editing ? data.active === "true" : true,
      }),
    }, editing ? "Saving project member…" : "Adding project member…");
    if (saved) {
      const member = saved as User;
      setUsers((current) => current.some((user) => user.email === member.email) ? current.map((user) => user.email === member.email ? member : user) : [...current, member]);
      refreshInBackground();
    }
  }
  async function saveSetting(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const saved = await request<object>("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }, "Adding dropdown value…");
    if (saved) { setLookups((current) => [...current, saved as Lookup]); refreshInBackground(); }
  }
  async function saveDueThresholds(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const saved = await request<object>("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redDays: Number(data.redDays),
        yellowDays: Number(data.yellowDays),
        grayDays: Number(data.grayDays),
      }),
    }, "Saving urgency settings…");
    if (saved) {
      const due = saved as { redDays: number; yellowDays: number; grayDays: number };
      setLookups((current) => [
        ...current.filter((item) => item.kind !== "due_threshold"),
        { id: -1, kind: "due_threshold", value: `red:${due.redDays}`, active: true },
        { id: -2, kind: "due_threshold", value: `yellow:${due.yellowDays}`, active: true },
        { id: -3, kind: "due_threshold", value: `gray:${due.grayDays}`, active: true },
      ]);
      refreshInBackground();
    }
  }
  async function saveDeployment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!deploymentForm) return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const planned = String(data.plannedDate || "");
    const dateLabel = planned
      ? new Date(`${planned}T00:00:00`).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";
    const current = deploymentForm.deployment;
    const saved = await request<Deployment>(
      current
        ? `/api/tasks/${deploymentForm.task.taskId}/deployments/${current.id}`
        : `/api/tasks/${deploymentForm.task.taskId}/deployments`,
      {
        method: current ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...data,
          dateLabel,
          actualDate: current?.actualDate ?? null,
        }),
      },
      current ? "Saving deployment plan…" : "Adding deployment plan…",
    );
    if (saved) { replaceDeployment(saved); touchTask(saved.taskId, saved.updatedAt); refreshInBackground(); }
  }
  async function updateTaskStatus(task: Task, nextStatus: string) {
    const plannedDeployments = deployments.filter(
      (deployment) =>
        deployment.taskId === task.taskId &&
        deployment.result.trim().toLowerCase() === "planned",
    );
    const normalizedStatus = nextStatus.trim().toLowerCase();
    if (normalizedStatus === "deploy prod done" && plannedDeployments.length) {
      if (plannedDeployments.length === 1) {
        await completeProduction(task, plannedDeployments[0].id);
      } else {
        setCompletionChoice({ task, deployments: plannedDeployments });
        setCompletionDeploymentId(null);
      }
      return;
    }
    if (/cancel/i.test(normalizedStatus) && plannedDeployments.length) {
      if (plannedDeployments.length === 1) {
        await cancelDeploymentPlans(task, nextStatus, "all");
      } else {
        setCancellationChoice({ task, status: nextStatus, deployments: plannedDeployments });
        setCancellationScope("all");
        setCancellationDeploymentId(null);
      }
      return;
    }
    const saved = await request<Task>(`/api/tasks/${task.taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...task, status: nextStatus }),
    }, "Updating task status…");
    if (saved) { replaceTask(saved); refreshInBackground(); }
  }
  async function completeProduction(task: Task, deploymentId?: number) {
    setBusy(true);
    try {
      await runWithLoading("Completing production deployment…", async () => {
        const response = await fetchWithTimeout(
          `/api/projects/${projectId}/tasks/${task.taskId}/complete-production`,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: task.revision, deploymentId }) },
        );
        const body = await response.json();
        if (response.status === 409 && body.code === "deployment_selection_required") {
          setCompletionChoice({ task, deployments: body.deployments }); setCompletionDeploymentId(null); return;
        }
        if (!response.ok) throw new Error(body.error || "Request failed");
        replaceTask(body.task as Task);
        replaceDeployment(body.deployment as Deployment);
        setCompletionChoice(null); setCompletionDeploymentId(null); setActive(null); refreshInBackground();
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Request failed");
      refreshInBackground();
    } finally {
      setBusy(false);
    }
  }
  async function cancelDeploymentPlans(
    task: Task,
    status: string,
    scope: "all" | "one",
    deploymentId?: number,
  ) {
    setBusy(true);
    try {
      await runWithLoading("Cancelling deployment plan…", async () => {
        const response = await fetchWithTimeout(
          `/api/projects/${projectId}/tasks/${task.taskId}/cancel-deployments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ revision: task.revision, status, scope, ...(scope === "one" ? { deploymentId } : {}) }),
          },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Request failed");
        replaceTask(body.task as Task);
        if (Array.isArray(body.deployments)) body.deployments.forEach((deployment) => replaceDeployment(deployment as Deployment));
        setCancellationChoice(null);
        setCancellationScope("all");
        setCancellationDeploymentId(null);
        setActive(null);
        refreshInBackground();
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Request failed");
      refreshInBackground();
    } finally {
      setBusy(false);
    }
  }
  async function updateDeployPlanDate(
    deployment: Deployment,
    nextDate: string,
  ) {
    const dateLabel = new Date(`${nextDate}T00:00:00`).toLocaleDateString(
      "en-GB",
      { day: "numeric", month: "short", year: "numeric" },
    );
    const saved = await request<Deployment>(
      `/api/tasks/${deployment.taskId}/deployments/${deployment.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...deployment,
          plannedDate: nextDate,
          dateLabel,
        }),
      },
      "Updating deployment date…",
    );
    if (saved) { replaceDeployment(saved); touchTask(saved.taskId, saved.updatedAt); refreshInBackground(); }
  }
  async function updateDeploymentResult(
    deployment: Deployment,
    result: string,
  ) {
    const saved = await request<Deployment>(
      `/api/tasks/${deployment.taskId}/deployments/${deployment.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...deployment, result }),
      },
      "Updating deployment result…",
    );
    if (saved) { replaceDeployment(saved); touchTask(saved.taskId, saved.updatedAt); refreshInBackground(); }
  }
  async function deleteDeployment(deployment: Deployment) {
    if (
      !confirm(
        `Delete deployment plan ${deployment.sprint || deployment.type.toUpperCase()}?`,
      )
    )
      return;
    const deleted = await request<Task>(
      `/api/tasks/${deployment.taskId}/deployments/${deployment.id}`,
      { method: "DELETE" },
      "Deleting deployment plan…",
    );
    if (deleted) {
      locallyDeletedDeploymentIds.current.add(deployment.id);
      setDeployments((current) => current.filter((item) => item.id !== deployment.id));
      replaceTask(deleted);
      refreshInBackground();
    }
  }
  async function deleteUser(user: User) {
    if (!confirm(`Remove access for ${user.email}?`)) return;
    const deleted = await request<object>(`/api/admin/users?email=${encodeURIComponent(user.email)}`, {
      method: "DELETE",
    }, "Removing project member…");
    if (deleted) { setUsers((current) => current.filter((item) => item.email !== user.email)); refreshInBackground(); }
  }
  return (
    <div className="app-shell">
      <aside className="side">
        <div className="brand">
          <span>TO</span>
          <div>
            <b>Task Ops</b>
            <small>Operations portal</small>
          </div>
        </div>
        <nav>
          <a className="back-to-projects" href="/">← Back to projects</a>
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            <LayoutDashboard />
            Overview
          </button>
          <button
            className={tab === "tasks" ? "active" : ""}
            onClick={() => setTab("tasks")}
          >
            <ListTodo />
            Tasks <em>{tasks.filter((t) => !isDone(t)).length}</em>
          </button>
          <button
            className={tab === "done" ? "active" : ""}
            onClick={() => setTab("done")}
          >
            <Archive />
            Task Done <em>{tasks.filter(isDone).length}</em>
          </button>
          <button
            className={tab === "timeline" ? "active" : ""}
            onClick={() => setTab("timeline")}
          >
            <CalendarRange />
            Timeline
          </button>
          <button
            className={tab === "notifications" ? "active" : ""}
            onClick={() => setTab("notifications")}
          >
            <Activity />
            Notifications
            {unreadNotificationCount > 0 && <em>{unreadNotificationCount}</em>}
          </button>
          {principal.role === "admin" && (
            <>
              <button
                className={tab === "config" ? "active" : ""}
                onClick={() => setTab("config")}
              >
                <Settings2 />
                Config
              </button>
              <button
                className={tab === "access" ? "active" : ""}
                onClick={() => setTab("access")}
              >
                <ShieldCheck />
                Access
              </button>
            </>
          )}
        </nav>
        <div className="side-foot">
          <div className="avatar">
            {principal.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <b>{principal.name}</b>
            <small>{principal.role}</small>
          </div>
          <a href={signOutPath} target="_top">
            •••
          </a>
        </div>
      </aside>
      <main className="main">
        <header>
          <div>
            <p className="eyebrow">WORKSPACE / DELIVERY OPERATIONS</p>
            <h1>
              {tab === "overview"
                ? "Team delivery overview"
                : tab === "tasks"
                  ? "Active tasks"
                  : tab === "done"
                    ? "Task done"
                    : tab === "timeline"
                      ? "Deployment timeline"
                      : tab === "notifications"
                        ? "Project activity"
                      : tab === "config"
                        ? "Dropdown configuration"
                        : "Access control"}
            </h1>
            <p>
              {tab === "access"
                ? "Manage who can view and edit this portal."
                : tab === "config"
                  ? "Add reusable values for task forms."
                  : tab === "timeline"
                    ? "Choose a date range and inspect deployment work across the calendar."
                    : tab === "notifications"
                      ? "Review recent task and deployment changes in this project."
                    : "Track work, spot delivery risk, and keep deployments moving."}
            </p>
          </div>
          <div className="header-actions">
            {projectSettings}
            <a className="secondary" href={`/api/projects/${projectId}/export/tasks.csv`}>
              <Download />
              Export CSV
            </a>
            {principal.role === "admin" && (
              <button className="secondary" onClick={() => setCsvImportOpen(true)}>
                <Upload />
                Import CSV
              </button>
            )}
            {principal.role !== "viewer" && (
              <button
                className="primary"
                onClick={() => setTaskForm(blankTask)}
              >
                <Plus />
                New task
              </button>
            )}
          </div>
        </header>
        {csvNotice && <p className="csv-notice" role="status">{csvNotice}</p>}
        {tab !== "access" && tab !== "timeline" && tab !== "config" && tab !== "notifications" && (
          <div className="filters">
            <label>
              <Search />
              <input
                aria-label="Search tasks"
                placeholder="Search task, service, or ID"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="all">All years</option>
              {years.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              {[...new Set(tasks.map((t) => t.status))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Filter team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="all">All teams</option>
              {[...new Set(tasks.map((t) => t.team))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Filter environment"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
            >
              <option value="all">All environments</option>
              {[...new Set(tasks.map((t) => t.environment).filter(Boolean))]
                .sort()
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
          </div>
        )}
        {tab === "overview" && (
          <>
            <section className="kpis">
              <Kpi
                label="Total tasks"
                value={stats.total}
                icon={<Activity />}
                tone="ink"
              />
              <Kpi
                label="Deploy done"
                value={stats.done}
                icon={<CheckCircle2 />}
                tone="green"
              />
              <Kpi
                label="In testing"
                value={stats.testing}
                icon={<TestTube2 />}
                tone="blue"
              />
              <Kpi
                label="Waiting deploy"
                value={stats.waiting}
                icon={<CalendarDays />}
                tone="amber"
              />
              <Kpi
                label="At risk"
                value={stats.risk}
                icon={<CircleAlert />}
                tone="red"
              />
            </section>
            {tasks.length === 0 && principal.role === "admin" && (
              <section className="import-card">
                <div>
                  <p className="eyebrow">ONE-TIME MIGRATION READY</p>
                  <h2>Import 41 tasks and 23 deployment entries</h2>
                  <p>
                    1 duplicate Task ID will be skipped. The original
                    spreadsheet remains unchanged.
                  </p>
                </div>
                <button className="primary" disabled={busy} onClick={runImport}>
                  {busy ? "Importing…" : "Review & import"}
                </button>
              </section>
            )}
            <section className="grid-2">
              <Chart
                title="Work status"
                rows={grouped("status")}
                onPick={setStatus}
              />
              <Chart
                title="Tasks by team"
                rows={grouped("team")}
                onPick={setTeam}
              />
            </section>
            <section className="panel">
              <PanelTitle
                title="Upcoming deployment timeline"
                subtitle="Planned deployments with a valid deploy plan date. Overdue plans stay red until their deployment result is updated."
              />
              <div className="timeline upcoming-scroll">
                {upcoming.map(({ d, date }) => {
                  const task = tasks.find((t) => t.taskId === d.taskId);
                  const daysUntil = Math.ceil(
                    (date.getTime() - today.getTime()) / 86400000,
                  );
                  const due =
                    daysUntil < 0
                      ? {
                          className: "due-overdue",
                          label: `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? "" : "s"}`,
                        }
                      : daysUntil <= dueThresholds.red
                      ? {
                          className: "due-3",
                          label: `Due within ${dueThresholds.red} days`,
                        }
                      : daysUntil <= dueThresholds.yellow
                        ? {
                            className: "due-7",
                            label: `Due within ${dueThresholds.yellow} days`,
                          }
                        : daysUntil <= dueThresholds.gray
                          ? {
                              className: "due-11",
                              label: `Due within ${dueThresholds.gray} days`,
                            }
                          : null;
                  return (
                    <div
                      className={`upcoming-entry ${due?.className || ""}`}
                      key={d.id}
                    >
                      <button
                        className="upcoming-open"
                        onClick={() => setActive(task || null)}
                      >
                        <span className="date">
                          <b>
                            {d.sprint || d.type.toUpperCase()}&nbsp;&nbsp;
                            {d.environment}
                          </b>
                          <strong>
                            {date.toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              timeZone: "Asia/Bangkok",
                            })}
                          </strong>
                          {due && <i>{due.label}</i>}
                        </span>
                        <span className="dot" />
                        <span>
                          <b>{d.taskId}</b>
                          <strong>
                            {task?.title || "Task detail unavailable"}
                          </strong>
                          <small>{d.detail.split("\n")[0]}</small>
                        </span>
                        <ChevronRight />
                      </button>
                      {task &&
                        (principal.role !== "viewer" ? (
                          <select
                            aria-label={`Update status for ${task.taskId}`}
                            className={`status-select upcoming-status ${tone(task.status)}`}
                            value={task.status}
                            onChange={(e) =>
                              updateTaskStatus(task, e.target.value)
                            }
                          >
                            {lookups
                              .filter((x) => x.kind === "status" && x.active)
                              .map((x) => (
                                <option key={x.id}>{x.value}</option>
                              ))}
                          </select>
                        ) : (
                          <i className={`badge ${tone(task.status)}`}>
                            {task.status}
                          </i>
                        ))}
                    </div>
                  );
                })}
                {!upcoming.length && (
                  <p className="empty">
                    No planned deployments for{" "}
                    {year === "all" ? "the selected filters" : year}.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
        {tab === "tasks" && (
          <TaskTable
            title="Active tasks"
            subtitle={`${activeTasks.length} active tasks match the current filters`}
            rows={activeTasks}
            deployments={deployments}
            statuses={lookups
              .filter((x) => x.kind === "status" && x.active)
              .map((x) => x.value)}
            canEdit={principal.role !== "viewer"}
            onStatus={updateTaskStatus}
            onDeployDate={updateDeployPlanDate}
            onPick={setActive}
          />
        )}{" "}
        {tab === "done" && (
          <TaskTable
            title="Task done"
            subtitle={`${doneTasks.length} completed or cancelled tasks`}
            rows={doneTasks}
            deployments={deployments}
            statuses={lookups
              .filter((x) => x.kind === "status" && x.active)
              .map((x) => x.value)}
            canEdit={principal.role !== "viewer"}
            onStatus={updateTaskStatus}
            onDeployDate={updateDeployPlanDate}
            onPick={setActive}
          />
        )}{" "}
        {tab === "timeline" && (
          <TimelineBoard
            deployments={deployments}
            tasks={tasks}
            startDate={startDate}
            endDate={endDate}
            environment={timelineEnvironment}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            setEnvironment={setTimelineEnvironment}
            onPick={setActive}
          />
        )}
        {tab === "notifications" && (
          <section className="panel notification-panel">
            <PanelTitle
              title={`Notifications${notificationAudits.length ? ` · ${notificationAudits.length}` : ""}`}
              subtitle="Task and deployment activity from this project."
            />
            <div className="notification-source" role="group" aria-label="Notification source">
              <button className={notificationSource === "others" ? "active" : ""} onClick={() => setNotificationSource("others")}>Others</button>
              <button className={notificationSource === "mine" ? "active" : ""} onClick={() => setNotificationSource("mine")}>My activity</button>
            </div>
            {notificationsLoading ? (
              <p className="empty">Loading notifications…</p>
            ) : notificationsError ? (
              <p className="empty">{notificationsError} <button className="secondary" onClick={() => void loadNotifications()}>Retry</button></p>
            ) : notificationAudits.length ? (
              <div className="notification-list">
                {notificationAudits.map((audit) => {
                  const task = auditTask(audit);
                  const reference = task?.taskId || (audit.entityType === "task" ? audit.entityId : "Deployment plan");
                  const unread = !isAuditRead(audit);
                  return (
                    <button className={`notification-item ${unread ? "unread" : "read"}`} key={audit.id} onClick={() => openNotification(audit)}>
                      <span className="notification-icon"><Activity /></span>
                      <span>
                        <b>{audit.actorEmail}</b>
                        <strong>{audit.action.replaceAll("-", " ").replaceAll("_", " ")}</strong>
                        <small>{audit.entityType === "deployment" ? "Deployment plan" : "Task"} · {reference}</small>
                      </span>
                      <span className="notification-state">{unread ? "Unread" : "Read"}</span>
                      <time dateTime={audit.createdAt}>{auditTimestamp(audit.createdAt)}</time>
                      <ChevronRight />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="empty">No task or deployment activity yet.</p>
            )}
          </section>
        )}
        {tab === "config" && (
          <ConfigPanel
            lookups={lookups}
            dueThresholds={dueThresholds}
            busy={busy}
            onSave={saveSetting}
            onSaveDue={saveDueThresholds}
          />
        )}
        {tab === "access" && (
          <section className="panel">
            {accessLoading ? <p className="empty">Loading project access…</p> : accessError ? <p className="empty">{accessError} <button className="secondary" onClick={() => void loadAccess()}>Retry</button></p> : <><div className="access-requests"><PanelTitle title={`Access requests${accessRequests.length ? ` · ${accessRequests.length}` : ""}`} subtitle="Review people who asked to join this project." />{accessRequests.length ? accessRequests.map((item) => <div className="access-request" key={item.id}><div><b>{item.displayName || item.email}</b><small>{item.email} · Viewer access</small></div><div><button className="primary" disabled={busy} onClick={() => reviewAccessRequest(item.id, "approve")}>Approve</button><button className="secondary" disabled={busy} onClick={() => reviewAccessRequest(item.id, "reject")}>Reject</button></div></div>) : <p className="form-note">No pending access requests.</p>}</div>
            <PanelTitle
              title="Project members"
              subtitle="Manage roles and access for this project only."
            />
            <div className="user-list">
              {users.map((u) => (
                <div key={u.email}>
                  <span className="avatar">
                    {u.displayName.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <b>{u.displayName}</b>
                    <small>{u.email}</small>
                  </span>
                  <i className={`badge ${u.active ? "green" : "red"}`}>
                    {u.isSuperAdmin ? "super admin" : u.active ? u.role : "disabled"}
                  </i>
                  {!u.isSuperAdmin && <span className="access-actions">
                    <button
                      aria-label={`Edit ${u.email}`}
                      onClick={() => setEditingUser(u)}
                    >
                      <Pencil /> Edit
                    </button>
                    <button className="danger" aria-label={`Delete ${u.email}`} onClick={() => deleteUser(u)}><Trash2 /> Delete</button>
                  </span>
                  }
                </div>
              ))}
              <button className="add-user" onClick={() => setUserForm(true)}>
                <Plus /> Add project member by email
              </button>
            </div>
            <div className="audit">
              <h3>Recent access activity</h3>
              {accessAudits
                .slice(0, 8)
                .map((a) => (
                  <p key={a.id}>
                    <b>{a.actorEmail}</b> {a.action.replaceAll("_", " ")}{" "}
                    <span>{a.entityId}</span>
                  </p>
                ))}
            </div>
            </>}
          </section>
        )}
      </main>
      {completionChoice && (
        <Modal
          title={`Choose successful deployment · ${completionChoice.task.taskId}`}
          close={() => {
            setCompletionChoice(null);
            setCompletionDeploymentId(null);
          }}
        >
          <p className="completion-help">
            This task has multiple planned deployments. Choose one to mark as
            success and set the task status to Deploy Prod Done.
          </p>
          <div className="completion-options">
            {completionChoice.deployments.map((deployment) => (
              <label
                className={`completion-option ${
                  completionDeploymentId === deployment.id ? "selected" : ""
                }`}
                key={deployment.id}
              >
                <input
                  type="radio"
                  name="successfulDeployment"
                  checked={completionDeploymentId === deployment.id}
                  onChange={() => setCompletionDeploymentId(deployment.id)}
                />
                <span>
                  <b>
                    {deployment.sprint || deployment.type.toUpperCase()} ·{" "}
                    {deployment.environment}
                  </b>
                  <strong>
                    {deployment.plannedDate || deployment.dateLabel || "No date"}
                  </strong>
                  <small>{deployment.detail}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="completion-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setCompletionChoice(null);
                setCompletionDeploymentId(null);
              }}
            >
              Cancel
            </button>
            <button
              className="primary"
              type="button"
              disabled={completionDeploymentId === null || busy}
              onClick={() => {
                if (completionDeploymentId !== null)
                  completeProduction(
                    completionChoice.task,
                    completionDeploymentId,
                  );
              }}
            >
              {busy ? "Saving…" : "Mark as success"}
            </button>
          </div>
        </Modal>
      )}
      {cancellationChoice && (
        <Modal
          title={`Cancel deployment plans · ${cancellationChoice.task.taskId}`}
          close={() => {
            setCancellationChoice(null);
            setCancellationScope("all");
            setCancellationDeploymentId(null);
          }}
        >
          <p className="completion-help">
            Choose whether to cancel every planned deployment or one selected
            deployment. The task status will also be updated to {cancellationChoice.status}.
          </p>
          <div className="completion-options">
            <label className={`completion-option ${cancellationScope === "all" ? "selected" : ""}`}>
              <input
                type="radio"
                name="cancellationScope"
                checked={cancellationScope === "all"}
                onChange={() => {
                  setCancellationScope("all");
                  setCancellationDeploymentId(null);
                }}
              />
              <span>
                <b>Cancel all planned deployments</b>
                <small>{cancellationChoice.deployments.length} planned deployment{cancellationChoice.deployments.length === 1 ? "" : "s"} will be cancelled.</small>
              </span>
            </label>
            <label className={`completion-option ${cancellationScope === "one" ? "selected" : ""}`}>
              <input
                type="radio"
                name="cancellationScope"
                checked={cancellationScope === "one"}
                onChange={() => setCancellationScope("one")}
              />
              <span>
                <b>Cancel one deployment</b>
                <small>Choose a single planned deployment below.</small>
              </span>
            </label>
            {cancellationScope === "one" && cancellationChoice.deployments.map((deployment) => (
              <label
                className={`completion-option ${cancellationDeploymentId === deployment.id ? "selected" : ""}`}
                key={deployment.id}
              >
                <input
                  type="radio"
                  name="cancelledDeployment"
                  checked={cancellationDeploymentId === deployment.id}
                  onChange={() => setCancellationDeploymentId(deployment.id)}
                />
                <span>
                  <b>{deployment.sprint || deployment.type.toUpperCase()} · {deployment.environment}</b>
                  <strong>{deployment.plannedDate || deployment.dateLabel || "No date"}</strong>
                  <small>{deployment.detail}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="completion-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setCancellationChoice(null);
                setCancellationScope("all");
                setCancellationDeploymentId(null);
              }}
            >
              Keep planned
            </button>
            <button
              className="primary"
              type="button"
              disabled={busy || (cancellationScope === "one" && cancellationDeploymentId === null)}
              onClick={() => {
                if (cancellationScope === "all") {
                  cancelDeploymentPlans(cancellationChoice.task, cancellationChoice.status, "all");
                } else if (cancellationDeploymentId !== null) {
                  cancelDeploymentPlans(cancellationChoice.task, cancellationChoice.status, "one", cancellationDeploymentId);
                }
              }}
            >
              {busy ? "Saving…" : "Cancel deployment plan"}
            </button>
          </div>
        </Modal>
      )}
      {selectedAudit && (() => {
        const before = parseAuditSnapshot(selectedAudit.beforeJson);
        const after = parseAuditSnapshot(selectedAudit.afterJson);
        const changeGroups = buildAuditChanges(before, after, selectedAudit.entityType);
        const changeCount = changeGroups.reduce((total, group) => total + group.changes.length, 0);
        const task = auditTask(selectedAudit);
        return (
          <Modal title="Activity details" close={() => setSelectedAudit(null)}>
            <div className="audit-detail">
              <div className="audit-detail-heading">
                <div>
                  <p><b>{selectedAudit.actorEmail}</b> {selectedAudit.action.replaceAll("-", " ").replaceAll("_", " ")}</p>
                  <small>{auditTimestamp(selectedAudit.createdAt)} · {selectedAudit.entityType}</small>
                </div>
                {changeCount > 0 && <span className="audit-change-count">{changeCount} {changeCount === 1 ? "change" : "changes"}</span>}
              </div>
              {changeGroups.length > 0 ? (
                <div className="audit-change-groups">
                  {changeGroups.map((group) => (
                    <section className="audit-change-group" key={group.key}>
                      <header>
                        <h3>{group.title}</h3>
                        <span>{group.changes.length} {group.changes.length === 1 ? "field" : "fields"}</span>
                      </header>
                      <div className="audit-change-list">
                        {group.changes.map((change) => (
                          <div className={`audit-change audit-change-${change.kind}`} key={change.label}>
                            <span className="audit-change-label">{change.label}</span>
                            <div className="audit-change-values">
                              <div className="audit-change-value before">
                                <small>{change.kind === "added" ? "Not set" : "Before"}</small>
                                <strong>{displayAuditValue(change.before)}</strong>
                              </div>
                              <span className="audit-change-arrow" aria-hidden="true">→</span>
                              <div className="audit-change-value after">
                                <small>{change.kind === "removed" ? "Removed" : "After"}</small>
                                <strong>{displayAuditValue(change.after)}</strong>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="form-note">{before || after ? "No user-visible field changes were recorded for this activity." : "This older activity item has no readable change snapshot."}</p>
              )}
              {task ? <button className="primary" onClick={() => { setSelectedAudit(null); setActive(task); }}>Open task {task.taskId}</button> : <p className="form-note">The live task is no longer available. Its recorded change remains above.</p>}
            </div>
          </Modal>
        );
      })()}
      {active && (
        <div className="drawer-backdrop" onClick={() => setActive(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setActive(null)}>
              ×
            </button>
            <p className="eyebrow">
              {active.environment} · {active.service}
            </p>
            <h2>{active.taskId}</h2>
            <p className="drawer-title">{active.title}</p>
            <i className={`badge ${tone(active.status)}`}>{active.status}</i>
            <dl>
              <dt>Team</dt>
              <dd>{active.team}</dd>
              <dt>Task period</dt>
              <dd>
                {active.startDate && active.endDate
                  ? `${active.startDate} → ${active.endDate}`
                  : "—"}
              </dd>
              <dt>Detail</dt>
              <dd>{active.remark || "—"}</dd>
              <dt>UAT detail</dt>
              <dd>{active.uatDetail || "—"}</dd>
              <dt>Production detail</dt>
              <dd>{active.productionDetail || "—"}</dd>
            </dl>
            <div className="deployment-heading">
              <h3>Deployment plans</h3>
              {principal.role !== "viewer" && (
                <button
                  onClick={() => {
                    setDeploymentForm({ task: active });
                    setActive(null);
                  }}
                >
                  <Plus /> Add plan
                </button>
              )}
            </div>
            {deployments
              .filter((d) => d.taskId === active.taskId)
              .map((d) => (
                <div className="deployment" key={d.id}>
                  <CalendarDays />
                  <span>
                    <b>
                      {d.sprint || d.type.toUpperCase()} · {d.dateLabel}
                    </b>
                    <small>{d.detail}</small>
                  </span>
                  {principal.role !== "viewer" ? (
                    <select
                      aria-label={`Update result for ${d.sprint || d.type}`}
                      className={`deployment-result ${d.result}`}
                      value={d.result}
                      onChange={(event) =>
                        updateDeploymentResult(d, event.target.value)
                      }
                    >
                      <option value="planned">Planned</option>
                      <option value="success">Success</option>
                      <option value="failed">Failed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  ) : (
                    <i className={`deployment-result ${d.result}`}>
                      {d.result}
                    </i>
                  )}
                  {principal.role !== "viewer" && (
                    <span className="plan-actions">
                      <button
                        className="edit-plan"
                        onClick={() => {
                          setDeploymentForm({ task: active, deployment: d });
                          setActive(null);
                        }}
                      >
                        <Pencil /> Edit
                      </button>
                      <button
                        className="delete-plan"
                        onClick={() => deleteDeployment(d)}
                      >
                        <Trash2 /> Delete
                      </button>
                    </span>
                  )}
                </div>
              ))}
            {!deployments.some((d) => d.taskId === active.taskId) && (
              <p className="empty small-empty">No deployment plan yet.</p>
            )}
            {principal.role !== "viewer" && (
              <button
                className="primary wide"
                onClick={() => {
                  setTaskForm(active);
                  setActive(null);
                }}
              >
                Edit task
              </button>
            )}
          </aside>
        </div>
      )}
      {taskForm && (
        <Modal
          title={taskForm.revision ? `Edit ${taskForm.taskId}` : "Create task"}
          close={() => setTaskForm(null)}
          back={
            taskForm.revision
              ? () => {
                  setActive(taskForm);
                  setTaskForm(null);
                }
              : undefined
          }
        >
          <form className="form" onSubmit={saveTask}>
            {taskForm.revision ? (
              <Field
                name="taskId"
                label="Task ID"
                value={taskForm.taskId}
                disabled
              />
            ) : (
              <p className="auto-id-note">
                <b>Task ID</b>
                <span>
                  Generated automatically when saved (next BLS running number).
                </span>
              </p>
            )}
            <Field name="title" label="Task / Epic" value={taskForm.title} />
            <label>
              Start date
              <input
                type="date"
                name="startDate"
                defaultValue={taskForm.startDate || ""}
              />
            </label>
            <label>
              End date
              <input
                type="date"
                name="endDate"
                defaultValue={taskForm.endDate || ""}
              />
            </label>
            <SelectField
              name="environment"
              label="Environment"
              value={taskForm.environment}
              values={lookups
                .filter((x) => x.kind === "environment" && x.active)
                .map((x) => x.value)}
            />
            <SelectField
              name="team"
              label="Team"
              value={taskForm.team}
              values={lookups
                .filter((x) => x.kind === "team" && x.active)
                .map((x) => x.value)}
            />
            <SelectField
              name="service"
              label="Service"
              value={taskForm.service}
              values={lookups
                .filter((x) => x.kind === "service" && x.active)
                .map((x) => x.value)}
            />
            <SelectField
              name="status"
              label="Status"
              value={taskForm.status}
              values={lookups
                .filter((x) => x.kind === "status" && x.active)
                .map((x) => x.value)}
            />
            <label>
              Detail
              <textarea name="remark" defaultValue={taskForm.remark} />
            </label>
            <label>
              UAT detail
              <textarea name="uatDetail" defaultValue={taskForm.uatDetail} />
            </label>
            <label>
              Production detail
              <textarea
                name="productionDetail"
                defaultValue={taskForm.productionDetail}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save task"}
            </button>
          </form>
        </Modal>
      )}
      {csvImportOpen && (
        <Modal title="Import Task Ops CSV" close={() => { setCsvImportOpen(false); setCsvFile(null); }}>
          <div className="csv-import">
            <p className="form-note">
              Choose a CSV exported by Task Ops Portal. The file is validated completely before any data is changed.
            </p>
            <label className="file-picker">
              <span className="file-picker-label">CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
              />
              <span className="file-picker-button" aria-hidden="true">
                <span className="file-picker-icon">↑</span>
                Choose CSV file
              </span>
              <span className={csvFile ? "file-picker-name selected" : "file-picker-name"}>
                {csvFile ? csvFile.name : "No file selected"}
              </span>
            </label>
            <div className="completion-actions">
              <button className="secondary" disabled={!csvFile || busy} onClick={() => importCsv("insert")}>
                {busy ? "Importing…" : "Insert records"}
              </button>
              <button className="primary" disabled={!csvFile || busy} onClick={() => importCsv("replace")}>
                {busy ? "Importing…" : "Replace all data"}
              </button>
            </div>
            <p className="form-note">
              Insert keeps existing tasks and adds the CSV records. Replace restores the CSV snapshot and removes existing tasks, deployment plans, and lookup settings.
            </p>
          </div>
        </Modal>
      )}
      {deploymentForm && (
        <Modal
          title={`${deploymentForm.deployment ? "Edit" : "Add"} deployment plan · ${deploymentForm.task.taskId}`}
          close={() => setDeploymentForm(null)}
          back={() => {
            setActive(deploymentForm.task);
            setDeploymentForm(null);
          }}
        >
          <form className="form" onSubmit={saveDeployment}>
            <Field
              name="sprint"
              label="Sprint / SP"
              value={deploymentForm.deployment?.sprint || ""}
            />
            <SelectField
              name="environment"
              label="Environment"
              value={
                deploymentForm.deployment?.environment ||
                deploymentForm.task.environment
              }
              values={lookups
                .filter((x) => x.kind === "environment" && x.active)
                .map((x) => x.value)}
            />
            <SelectField
              name="type"
              label="Deployment type"
              value={deploymentForm.deployment?.type || "prod"}
              values={["uat", "prod"]}
            />
            <label>
              Planned date
              <input
                type="date"
                name="plannedDate"
                defaultValue={dateInputValue(
                  deploymentForm.deployment
                    ? deployPlanDate(deploymentForm.deployment)
                    : null,
                )}
                required
              />
            </label>
            <SelectField
              name="result"
              label="Result"
              value={deploymentForm.deployment?.result || "planned"}
              values={["planned", "success", "failed", "cancelled"]}
            />
            <label>
              Deployment detail
              <textarea
                name="detail"
                placeholder="What will be deployed?"
                defaultValue={deploymentForm.deployment?.detail || ""}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy
                ? "Saving…"
                : deploymentForm.deployment
                  ? "Save deployment plan"
                  : "Add deployment plan"}
            </button>
          </form>
        </Modal>
      )}
      {(userForm || editingUser) && (
        <Modal
          title={editingUser ? `Edit project access · ${editingUser.email}` : "Add project member"}
          close={() => {
            setUserForm(false);
            setEditingUser(null);
          }}
        >
          <form className="form" onSubmit={saveUser}>
            <Field
              name="email"
              label="Email"
              value={editingUser?.email || ""}
              disabled={Boolean(editingUser)}
            />
            <Field
              name="displayName"
              label="Display name"
              value={editingUser?.displayName || ""}
            />
            <SelectField
              name="role"
              label="Role"
              value={editingUser?.role || "viewer"}
              values={["viewer", "editor", "admin"]}
            />
            {editingUser && (
              <SelectField
                name="active"
                label="Access status"
                value={String(editingUser.active)}
                values={["true", "false"]}
              />
            )}
            <p className="form-note">This role applies only to the current project.</p>
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : editingUser ? "Save access" : "Grant access"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
