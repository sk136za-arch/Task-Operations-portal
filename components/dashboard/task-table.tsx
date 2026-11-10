import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { PanelTitle } from "./overview";
import type { Deployment, Task } from "./types";
import { dateInputValue, taskDeployPlan, tone } from "./utils";

export function TaskTable({
  title,
  subtitle,
  rows,
  deployments,
  statuses,
  canEdit,
  onStatus,
  onDeployDate,
  onPick,
}: {
  title: string;
  subtitle: string;
  rows: Task[];
  deployments: Deployment[];
  statuses: string[];
  canEdit: boolean;
  onStatus: (t: Task, s: string) => void;
  onDeployDate: (d: Deployment, date: string) => void;
  onPick: (t: Task) => void;
}) {
  type SortKey =
    | "task"
    | "team"
    | "environment"
    | "deploy"
    | "status"
    | "updated";
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>(
    { key: "updated", direction: "desc" },
  );
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const planA =
          taskDeployPlan(a.taskId, deployments)?.date.getTime() ??
          Number.MAX_SAFE_INTEGER;
        const planB =
          taskDeployPlan(b.taskId, deployments)?.date.getTime() ??
          Number.MAX_SAFE_INTEGER;
        const values: Record<SortKey, [string | number, string | number]> = {
          task: [a.taskId, b.taskId],
          team: [`${a.team} ${a.service}`, `${b.team} ${b.service}`],
          environment: [a.environment, b.environment],
          deploy: [planA, planB],
          status: [a.status, b.status],
          updated: [
            new Date(a.updatedAt).getTime(),
            new Date(b.updatedAt).getTime(),
          ],
        };
        const [left, right] = values[sort.key];
        const result =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), undefined, {
                numeric: true,
                sensitivity: "base",
              });
        return sort.direction === "asc" ? result : -result;
      }),
    [rows, deployments, sort],
  );
  const changeSort = (key: SortKey) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  const heading = (label: string, key: SortKey) => (
    <button
      className={`sort-heading ${sort.key === key ? "active" : ""}`}
      onClick={() => changeSort(key)}
    >
      {label}
      <span>
        {sort.key === key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
  return (
    <section className="panel table-panel">
      <PanelTitle title={title} subtitle={subtitle} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{heading("Task", "task")}</th>
              <th>{heading("Team / Service", "team")}</th>
              <th>{heading("Environment", "environment")}</th>
              <th>{heading("Deploy plan date", "deploy")}</th>
              <th>{heading("Status", "status")}</th>
              <th>{heading("Updated", "updated")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const plan = taskDeployPlan(t.taskId, deployments);
              const sprint = plan?.d.sprint.trim();
              return (
                <tr key={t.taskId} onClick={() => onPick(t)}>
                  <td>
                    <b>
                      {t.taskId}
                      {sprint && <i className="task-sprint">{sprint}</i>}
                    </b>
                    <span>{t.title}</span>
                  </td>
                  <td>
                    <b>{t.team}</b>
                    <span>{t.service}</span>
                  </td>
                  <td>{t.environment}</td>
                  <td>
                    {canEdit && plan ? (
                      <input
                        className="plan-date-input"
                        type="date"
                        value={dateInputValue(plan.date)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          onDeployDate(plan.d, e.target.value);
                        }}
                      />
                    ) : plan ? (
                      plan.date.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "Asia/Bangkok",
                      })
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <select
                        className={`status-select ${tone(t.status)}`}
                        value={t.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          onStatus(t, e.target.value);
                        }}
                      >
                        {statuses.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <i className={`badge ${tone(t.status)}`}>{t.status}</i>
                    )}
                  </td>
                  <td>
                    {new Date(t.updatedAt).toLocaleDateString("en-GB", {
                      timeZone: "Asia/Bangkok",
                    })}
                  </td>
                  <td>
                    <ChevronRight />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="empty">No tasks match the current filters.</p>
        )}
      </div>
    </section>
  );
}
