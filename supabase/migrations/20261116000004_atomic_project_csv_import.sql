-- Imports must be all-or-nothing: a failed Replace must never leave a project empty.
create or replace function public.import_project_csv(
  p_project_id uuid,
  p_mode text,
  p_tasks jsonb,
  p_deployments jsonb,
  p_lookups jsonb,
  p_actor_id text,
  p_actor_email text,
  p_file_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mode not in ('insert', 'replace') then
    raise exception 'Import mode must be insert or replace' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text, 0));

  if p_mode = 'insert' and exists (
    select 1
    from public.tasks t
    join jsonb_to_recordset(p_tasks) as incoming(task_id text) on incoming.task_id = t.task_id
    where t.project_id = p_project_id
  ) then
    raise exception 'CSV contains Task IDs that already exist' using errcode = '23505';
  end if;

  if p_mode = 'replace' then
    delete from public.deployments where project_id = p_project_id;
    delete from public.tasks where project_id = p_project_id;
    delete from public.lookup_values where project_id = p_project_id;
  end if;

  insert into public.tasks (project_id, task_id, environment, team, service, title, start_date, end_date, uat_detail, production_detail, status, remark, revision, created_at, updated_at, updated_by)
  select p_project_id, task_id, environment, team, service, title, start_date, end_date, uat_detail, production_detail, status, remark, revision, created_at, updated_at, updated_by
  from jsonb_to_recordset(p_tasks) as incoming(task_id text, environment text, team text, service text, title text, start_date text, end_date text, uat_detail text, production_detail text, status text, remark text, revision integer, created_at timestamptz, updated_at timestamptz, updated_by text);

  insert into public.deployments (project_id, task_id, sprint, environment, type, planned_date, actual_date, date_label, detail, result, created_at, updated_at)
  select p_project_id, task_id, sprint, environment, type, planned_date, actual_date, date_label, detail, result, created_at, updated_at
  from jsonb_to_recordset(p_deployments) as incoming(task_id text, sprint text, environment text, type text, planned_date text, actual_date text, date_label text, detail text, result text, created_at timestamptz, updated_at timestamptz);

  insert into public.lookup_values (project_id, kind, value, active, sort_order)
  select p_project_id, kind, value, active, sort_order
  from jsonb_to_recordset(p_lookups) as incoming(kind text, value text, active boolean, sort_order integer)
  on conflict (project_id, kind, value) do nothing;

  insert into public.audit_logs (project_id, actor_id, actor_email, action, entity_type, entity_id, after_json, created_at)
  values (p_project_id, p_actor_id, p_actor_email, 'csv_' || p_mode, 'csv', p_file_name, jsonb_build_object('taskCount', jsonb_array_length(p_tasks), 'deploymentCount', jsonb_array_length(p_deployments), 'lookupCount', jsonb_array_length(p_lookups))::text, now());

  return jsonb_build_object('taskCount', jsonb_array_length(p_tasks), 'deploymentCount', jsonb_array_length(p_deployments), 'lookupCount', jsonb_array_length(p_lookups), 'mode', p_mode);
end;
$$;

revoke all on function public.import_project_csv(uuid, text, jsonb, jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.import_project_csv(uuid, text, jsonb, jsonb, jsonb, text, text, text) to service_role;
