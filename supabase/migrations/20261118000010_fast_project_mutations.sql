-- Collapse common editor mutations into one database round trip each.

create or replace function public.update_project_task(
  p_project_id uuid, p_task_id text, p_revision integer, p_task jsonb,
  p_actor_id text, p_actor_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before public.tasks%rowtype;
  v_updated public.tasks%rowtype;
  v_next_status text := coalesce(p_task->>'status', '');
  v_now timestamptz := now();
begin
  select * into v_before from public.tasks where project_id = p_project_id and task_id = p_task_id for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if v_before.revision <> p_revision then raise exception 'Task changed by another user' using errcode = '40001'; end if;
  if ((lower(trim(v_before.status)) <> 'deploy prod done' and lower(trim(v_next_status)) = 'deploy prod done') or (v_next_status ~* 'cancel' and v_before.status !~* 'cancel'))
    and exists(select 1 from public.deployments where project_id = p_project_id and task_id = p_task_id and result = 'planned') then
    raise exception 'Use the deployment transition workflow' using errcode = 'P0001';
  end if;
  update public.tasks set
    environment = p_task->>'environment', team = p_task->>'team', service = p_task->>'service', title = p_task->>'title',
    start_date = case when p_task ? 'startDate' then p_task->>'startDate' else v_before.start_date end,
    end_date = case when p_task ? 'endDate' then p_task->>'endDate' else v_before.end_date end, uat_detail = coalesce(p_task->>'uatDetail', ''),
    production_detail = coalesce(p_task->>'productionDetail', ''), status = v_next_status, remark = coalesce(p_task->>'remark', ''),
    revision = v_before.revision + 1, updated_at = v_now, updated_by = p_actor_email
  where project_id = p_project_id and task_id = p_task_id returning * into v_updated;
  insert into public.audit_logs(project_id, actor_id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
  values(p_project_id, p_actor_id, p_actor_email, 'update', 'task', p_task_id, to_jsonb(v_before)::text, to_jsonb(v_updated)::text, v_now);
  return to_jsonb(v_updated);
end $$;

create or replace function public.update_project_deployment(
  p_project_id uuid, p_task_id text, p_deployment_id bigint, p_deployment jsonb,
  p_actor_id text, p_actor_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before public.deployments%rowtype;
  v_updated public.deployments%rowtype;
  v_now timestamptz := now();
begin
  select * into v_before from public.deployments where project_id = p_project_id and id = p_deployment_id and task_id = p_task_id for update;
  if not found then raise exception 'Deployment not found' using errcode = 'P0002'; end if;
  update public.deployments set
    sprint = coalesce(p_deployment->>'sprint', ''), environment = p_deployment->>'environment', type = p_deployment->>'type',
    planned_date = case when p_deployment ? 'plannedDate' then p_deployment->>'plannedDate' else v_before.planned_date end,
    actual_date = case when p_deployment ? 'actualDate' then p_deployment->>'actualDate' else v_before.actual_date end, date_label = coalesce(p_deployment->>'dateLabel', ''),
    detail = p_deployment->>'detail', result = coalesce(p_deployment->>'result', 'planned'), updated_at = v_now
  where project_id = p_project_id and id = p_deployment_id returning * into v_updated;
  update public.tasks set updated_at = v_now, updated_by = p_actor_email where project_id = p_project_id and task_id = p_task_id;
  insert into public.audit_logs(project_id, actor_id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
  values(p_project_id, p_actor_id, p_actor_email, 'update', 'deployment', p_deployment_id::text, to_jsonb(v_before)::text, to_jsonb(v_updated)::text, v_now);
  return to_jsonb(v_updated);
end $$;

revoke all on function public.update_project_task(uuid,text,integer,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.update_project_deployment(uuid,text,bigint,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.update_project_task(uuid,text,integer,jsonb,text,text) to service_role;
grant execute on function public.update_project_deployment(uuid,text,bigint,jsonb,text,text) to service_role;
