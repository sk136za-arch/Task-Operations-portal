export type Task = {
  id: number;
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
  updatedAt: string;
  updatedBy: string;
};

export type Deployment = {
  id: number;
  taskId: string;
  sprint: string;
  environment: string;
  type: string;
  plannedDate: string | null;
  actualDate: string | null;
  dateLabel: string;
  detail: string;
  result: string;
};

export type Lookup = {
  id: number;
  kind: string;
  value: string;
  active: boolean;
};

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  active: boolean;
  isSuperAdmin?: boolean;
};

export type Audit = {
  id: number;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  createdAt: string;
};

export type Principal = { email: string; name: string; role: string };
export type DueThresholds = { red: number; yellow: number; gray: number };
