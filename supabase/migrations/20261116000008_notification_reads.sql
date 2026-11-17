-- Per-user read state for project activity notifications.
alter table public.projects
  add column if not exists notifications_started_at timestamptz not null default now();

create table if not exists public.project_notification_reads (
  project_id uuid not null references public.projects(id) on delete cascade,
  audit_id bigint not null references public.audit_logs(id) on delete cascade,
  user_id text not null,
  read_at timestamptz not null default now(),
  primary key (project_id, audit_id, user_id)
);

create index if not exists project_notification_reads_project_user_audit_idx
  on public.project_notification_reads(project_id, user_id, audit_id);

alter table public.project_notification_reads enable row level security;
grant all privileges on table public.project_notification_reads to service_role;
