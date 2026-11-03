import type { Deployment, DueThresholds, Lookup, Task } from "./types";

const MONTHS: Record<string, number> = {
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

export const blankTask = {
  taskId: "",
  environment: "",
  team: "",
  service: "",
  title: "",
  startDate: "",
  endDate: "",
  uatDetail: "",
  productionDetail: "",
  status: "To-Do",
  remark: "",
};

export const tone = (status: string) =>
  /done/i.test(status)
    ? "green"
    : /fail|block|cancel/i.test(status)
      ? "red"
      : /test/i.test(status)
        ? "blue"
        : /wait/i.test(status)
          ? "amber"
          : "purple";

const parseDeploymentDate = (label: string) => {
  const date = new Date(label);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const deployPlanDate = (deployment: Deployment) => {
  if (deployment.plannedDate) {
    const date = new Date(`${deployment.plannedDate.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const header = parseDeploymentDate(deployment.dateLabel);
  const match = deployment.detail.match(/prod\s+(\d{1,2})\s+([a-z]{3})/i);
  const month = match ? MONTHS[match[2].toLowerCase()] : undefined;
  return month === undefined
    ? header
    : new Date(
        header?.getFullYear() ?? new Date().getFullYear(),
        month,
        Number(match![1]),
      );
};

export const taskDeployPlan = (taskId: string, deployments: Deployment[]) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const plans = deployments
    .filter((deployment) => deployment.taskId === taskId)
    .map((d) => ({ d, date: deployPlanDate(d) }))
    .filter((item): item is { d: Deployment; date: Date } => Boolean(item.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return plans.find((item) => item.date >= today) ?? plans.at(-1) ?? null;
};

export const latestTaskDeployment = (
  taskId: string,
  deployments: Deployment[],
) =>
  deployments
    .filter((deployment) => deployment.taskId === taskId)
    .map((deployment) => ({ deployment, date: deployPlanDate(deployment) }))
    .sort(
      (left, right) =>
        (left.date?.getTime() ?? 0) - (right.date?.getTime() ?? 0),
    )
    .at(-1)?.deployment ?? null;

export const dateInputValue = (date: Date | null) =>
  date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : "";

export const timelineDefaultRange = (now = new Date()) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextMonth = start.getMonth() + 1;
  const endYear = start.getFullYear() + Math.floor(nextMonth / 12);
  const endMonth = nextMonth % 12;
  const lastDay = new Date(endYear, endMonth + 1, 0).getDate();
  const end = new Date(endYear, endMonth, Math.min(start.getDate(), lastDay));
  return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
};
export const isDone = (task: Task) =>
  /deploy prod done|cancel/i.test(task.status);

export const dueThresholdsFrom = (lookups: Lookup[]): DueThresholds => {
  const values = Object.fromEntries(
    lookups
      .filter((lookup) => lookup.kind === "due_threshold" && lookup.active)
      .map((lookup) => lookup.value.split(":")),
  );
  const red = Number(values.red) || 3,
    yellow = Number(values.yellow) || 7,
    gray = Number(values.gray) || 11;
  return red < yellow && yellow < gray
    ? { red, yellow, gray }
    : { red: 3, yellow: 7, gray: 11 };
};
