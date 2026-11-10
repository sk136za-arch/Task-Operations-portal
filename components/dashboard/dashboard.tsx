"use client";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { Chart, Kpi, PanelTitle } from "./overview";
import { TaskTable } from "./task-table";
import { ConfigPanel } from "./configuration";
import { TimelineBoard } from "./timeline-board";
import { Field, Modal, SelectField } from "./dialogs";

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

export default function Dashboard({
  tasks,
  deployments,
  lookups,
  users,
  audits,
  principal,
  signOutPath,
}: {
  tasks: Task[];
  deployments: Deployment[];
  lookups: Lookup[];
  users: User[];
  audits: Audit[];
  principal: { email: string; name: string; role: string };
  signOutPath: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [team, setTeam] = useState("all");
  const [environment, setEnvironment] = useState("all");
  const [year, setYear] = useState("all");
  const [active, setActive] = useState<Task | null>(null);
  const [tab, setTab] = useState<
    "overview" | "tasks" | "done" | "timeline" | "config" | "access"
  >("overview");
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
  const [busy, setBusy] = useState(false);
  const [timelineRange] = useState(timelineDefaultRange);
  const [startDate, setStartDate] = useState(timelineRange.startDate);
  const [endDate, setEndDate] = useState(timelineRange.endDate);
  const [timelineEnvironment, setTimelineEnvironment] = useState("all");
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
        x.date >= today &&
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
  async function request(url: string, init: RequestInit) {
    setBusy(true);
    try {
      const r = await fetch(url, init);
      const text = await r.text();
      const body = text ? JSON.parse(text) : {};
      if (!r.ok) throw new Error(body.error || "Request failed");
      setTaskForm(null);
      setDeploymentForm(null);
      setUserForm(false);
      setEditingUser(null);
      setActive(null);
      router.refresh();
      setBusy(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Request failed");
      setBusy(false);
    }
  }
  async function runImport() {
    await request("/api/admin/import", { method: "POST" });
  }
  async function saveTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const editing = Boolean(taskForm?.revision);
    if (editing) data.revision = taskForm.revision;
    await request(editing ? `/api/tasks/${taskForm.taskId}` : "/api/tasks", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  }
  async function saveUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const editing = Boolean(editingUser);
    await request("/api/admin/users", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...data,
        email: editingUser?.email || data.email,
        active: editing ? data.active === "true" : true,
      }),
    });
  }
  async function saveSetting(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await request("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  }
  async function saveDueThresholds(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await request("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redDays: Number(data.redDays),
        yellowDays: Number(data.yellowDays),
        grayDays: Number(data.grayDays),
      }),
    });
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
    await request(
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
    );
  }
  async function updateTaskStatus(task: Task, nextStatus: string) {
    if (nextStatus.trim().toLowerCase() === "deploy prod done") {
      await completeProduction(task);
      return;
    }
    await request(`/api/tasks/${task.taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...task, status: nextStatus }),
    });
  }
  async function completeProduction(task: Task, deploymentId?: number) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/tasks/${task.taskId}/complete-production`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ revision: task.revision, deploymentId }),
        },
      );
      const body = await response.json();
      if (
        response.status === 409 &&
        body.code === "deployment_selection_required"
      ) {
        setCompletionChoice({ task, deployments: body.deployments });
        setCompletionDeploymentId(null);
        return;
      }
      if (!response.ok) throw new Error(body.error || "Request failed");
      setCompletionChoice(null);
      setCompletionDeploymentId(null);
      setActive(null);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Request failed");
      router.refresh();
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
    await request(
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
    );
  }
  async function updateDeploymentResult(
    deployment: Deployment,
    result: string,
  ) {
    await request(
      `/api/tasks/${deployment.taskId}/deployments/${deployment.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...deployment, result }),
      },
    );
  }
  async function deleteDeployment(deployment: Deployment) {
    if (
      !confirm(
        `Delete deployment plan ${deployment.sprint || deployment.type.toUpperCase()}?`,
      )
    )
      return;
    await request(
      `/api/tasks/${deployment.taskId}/deployments/${deployment.id}`,
      { method: "DELETE" },
    );
  }
  async function deleteUser(user: User) {
    if (!confirm(`Remove access for ${user.email}?`)) return;
    await request(`/api/admin/users?email=${encodeURIComponent(user.email)}`, {
      method: "DELETE",
    });
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
                    : "Track work, spot delivery risk, and keep deployments moving."}
            </p>
          </div>
          <div className="header-actions">
            <a className="secondary" href="/api/export/tasks.csv">
              <Download />
              Export CSV
            </a>
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
        {tab !== "access" && tab !== "timeline" && (
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
                subtitle="Future deployments with a valid deploy plan date, ordered nearest first"
              />
              <div className="timeline upcoming-scroll">
                {upcoming.map(({ d, date }) => {
                  const task = tasks.find((t) => t.taskId === d.taskId);
                  const daysUntil = Math.ceil(
                    (date.getTime() - today.getTime()) / 86400000,
                  );
                  const due =
                    daysUntil <= dueThresholds.red
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
                    No upcoming deployments for{" "}
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
            <PanelTitle
              title="Workspace access"
              subtitle="App roles take effect after the user has hosting access"
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
                    {u.active ? u.role : "disabled"}
                  </i>
                  <span className="access-actions">
                    <button
                      aria-label={`Edit ${u.email}`}
                      onClick={() => setEditingUser(u)}
                    >
                      <Pencil /> Edit
                    </button>
                    {u.email !== "sk136za@gmail.com" && (
                      <button
                        className="danger"
                        aria-label={`Delete ${u.email}`}
                        onClick={() => deleteUser(u)}
                      >
                        <Trash2 /> Delete
                      </button>
                    )}
                  </span>
                </div>
              ))}
              <button className="add-user" onClick={() => setUserForm(true)}>
                <Plus /> Add user by email
              </button>
            </div>
            <div className="audit">
              <h3>Recent access activity</h3>
              {audits
                .filter((a) => a.entityType === "user")
                .slice(0, 8)
                .map((a) => (
                  <p key={a.id}>
                    <b>{a.actorEmail}</b> {a.action.replaceAll("_", " ")}{" "}
                    <span>{a.entityId}</span>
                  </p>
                ))}
            </div>
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
            success. The task status will remain unchanged.
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
          title={
            editingUser
              ? `Edit access · ${editingUser.email}`
              : "Grant portal access"
          }
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
            <p className="form-note">
              This controls the role inside the portal. Site hosting access must
              also allow the same email.
            </p>
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : editingUser ? "Save access" : "Grant access"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
