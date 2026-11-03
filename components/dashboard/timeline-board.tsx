import { useState } from "react";
import { createPortal } from "react-dom";
import type { Deployment, Task } from "./types";
import { latestTaskDeployment, taskDeployPlan } from "./utils";

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
function inferredTaskStart(task: Task | undefined, end: Date) {
  if (!task) return end;
  const match = `${task.uatDetail} ${task.productionDetail}`.match(
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  );
  if (!match) return end;
  const months: { [key: string]: number } = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  let result = new Date(
    end.getFullYear(),
    months[match[2].toLowerCase()],
    Number(match[1]),
  );
  if (result > end)
    result = new Date(
      end.getFullYear() - 1,
      result.getMonth(),
      result.getDate(),
    );
  return result;
}

type TooltipDetails = {
  task: Task;
  deployment?: Deployment;
  begin: Date;
  finish: Date;
  x: number;
  y: number;
};
export function TimelineBoard({
  deployments,
  tasks,
  startDate,
  endDate,
  environment,
  setStartDate,
  setEndDate,
  setEnvironment,
  onPick,
}: {
  deployments: Deployment[];
  tasks: Task[];
  startDate: string;
  endDate: string;
  environment: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setEnvironment: (v: string) => void;
  onPick: (t: Task) => void;
}) {
  const [tooltip, setTooltip] = useState<TooltipDetails | null>(null);
  const start = new Date(`${startDate}T00:00:00`),
    end = new Date(`${endDate}T00:00:00`);
  const valid =
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    end >= start;
  const days: Date[] = [];
  if (valid) {
    for (
      let d = new Date(start);
      d <= end && days.length < 120;
      d.setDate(d.getDate() + 1)
    )
      days.push(new Date(d));
  }
  const environments = [
    ...new Set(tasks.map((task) => task.environment).filter(Boolean)),
  ].sort();
  const monthGroups = days.reduce<
    { label: string; start: number; count: number }[]
  >((groups, day, index) => {
    const label = day.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
    const previous = groups.at(-1);
    if (previous?.label === label) previous.count++;
    else groups.push({ label, start: index, count: 1 });
    return groups;
  }, []);
  const entries = tasks
    .filter((task) => environment === "all" || task.environment === environment)
    .map((task) => {
      const plan = taskDeployPlan(task.taskId, deployments);
      const latestDeployment = latestTaskDeployment(task.taskId, deployments);
      const explicitStart = task.startDate
        ? new Date(`${task.startDate}T00:00:00`)
        : null;
      const explicitEnd = task.endDate
        ? new Date(`${task.endDate}T00:00:00`)
        : null;
      const finish = explicitEnd ?? plan?.date ?? null;
      if (!finish) return null;
      const begin = explicitStart ?? inferredTaskStart(task, finish);
      return { task, d: latestDeployment ?? undefined, finish, begin };
    })
    .filter(
      (
        x,
      ): x is {
        task: Task;
        d: Deployment | undefined;
        finish: Date;
        begin: Date;
      } => x !== null && valid && x.finish >= start && x.begin <= end,
    );
  const columns = `210px repeat(${days.length}, 42px)`;
  return (
    <section className="panel timeline-board">
      <div className="timeline-controls">
        <div>
          <h2>Task timeline</h2>
          <p>
            Bars use each task's Start Date and End Date. Existing tasks fall
            back to deployment data until dates are added.
          </p>
        </div>
        <label>
          Environment
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option value="all">All environments</option>
            {environments.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>
      {!valid ? (
        <p className="range-error">End date must be on or after start date.</p>
      ) : (
        <div className="timeline-scroll gantt-scroll">
          <div className="gantt" style={{ gridTemplateColumns: columns }}>
            <div className="gantt-corner">Timeline</div>
            {monthGroups.map((group) => (
              <div
                className="gantt-month"
                style={{
                  gridColumn: `${group.start + 2} / span ${group.count}`,
                }}
                key={group.label}
              >
                {group.label}
              </div>
            ))}
            <div className="gantt-subcorner">Task</div>
            {days.map((day, i) => (
              <div
                className={`gantt-day ${i === 0 || day.getDate() === 1 ? "month-start" : ""}`}
                key={dayKey(day)}
              >
                <b>{day.getDate()}</b>
                <small>
                  {day.toLocaleDateString("en-GB", { weekday: "narrow" })}
                </small>
              </div>
            ))}
            {entries.map(({ d, task, finish, begin }) => {
              const clippedStart = begin < start ? start : begin;
              const clippedEnd = finish > end ? end : finish;
              const startIndex = Math.max(
                0,
                days.findIndex((day) => dayKey(day) === dayKey(clippedStart)),
              );
              const endIndex = Math.max(
                startIndex,
                days.findIndex((day) => dayKey(day) === dayKey(clippedEnd)),
              );
              return (
                <div
                  className="gantt-entry"
                  style={{
                    gridColumn: `1 / ${days.length + 2}`,
                    gridTemplateColumns: columns,
                  }}
                  key={task.taskId}
                >
                  <button className="gantt-label" onClick={() => onPick(task)}>
                    <b>{task.taskId}</b>
                    <span>{task.title}</span>
                  </button>
                  <div
                    className="gantt-track"
                    style={{
                      gridColumn: `2 / ${days.length + 2}`,
                      gridTemplateColumns: `repeat(${days.length}, 42px)`,
                    }}
                  >
                    <button
                      className={`gantt-bar ${finish <= new Date(Date.now() + 7 * 86400000) ? "soon" : ""}`}
                      style={{
                        gridColumn: `${startIndex + 1} / ${endIndex + 2}`,
                      }}
                      onClick={() => onPick(task)}
                      onMouseEnter={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        setTooltip({
                          task,
                          deployment: d,
                          begin,
                          finish,
                          x: Math.min(
                            Math.max(rect.left + rect.width / 2, 148),
                            window.innerWidth - 148,
                          ),
                          y: Math.max(12, rect.top - 10),
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onFocus={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        setTooltip({
                          task,
                          deployment: d,
                          begin,
                          finish,
                          x: Math.min(
                            Math.max(rect.left + rect.width / 2, 148),
                            window.innerWidth - 148,
                          ),
                          y: Math.max(12, rect.top - 10),
                        });
                      }}
                      onBlur={() => setTooltip(null)}
                      aria-label={`${task.taskId} ${task.title}`}
                    >
                      <span>
                        {task.taskId} · {d?.sprint || task.status} ·{" "}
                        {d?.environment || task.environment}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {!entries.length && (
            <p className="empty">
              No tasks match this date range and environment.
            </p>
          )}
        </div>
      )}
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <i
            className="gantt-tooltip gantt-tooltip-portal"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <b>
              {tooltip.task.taskId} · {tooltip.task.title}
            </b>
            <small>
              {tooltip.task.team} · {tooltip.task.environment}
            </small>
            <small>
              {tooltip.begin.toLocaleDateString("en-GB")} →{" "}
              {tooltip.finish.toLocaleDateString("en-GB")}
            </small>
            <small>
              {tooltip.deployment?.detail ||
                tooltip.task.remark ||
                "Task period"}
            </small>
          </i>,
          document.body,
        )}
    </section>
  );
}
