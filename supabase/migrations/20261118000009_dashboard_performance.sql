-- Support the project dashboard's scoped read and refresh paths.

create index if not exists tasks_project_updated_at_idx
  on public.tasks (project_id, updated_at desc);

create index if not exists deployments_project_result_planned_date_idx
  on public.deployments (project_id, result, planned_date);

create index if not exists audit_logs_project_created_at_idx
  on public.audit_logs (project_id, created_at desc);

create index if not exists lookup_values_project_sort_order_idx
  on public.lookup_values (project_id, sort_order);

create index if not exists project_access_requests_project_status_created_at_idx
  on public.project_access_requests (project_id, status, created_at desc);

-- Return exactly the deployment records changed by cancellation so the client can
-- reconcile its timeline before the background server refresh completes.
create or replace function public.cancel_project_task_deployments(
  p_project_id uuid, p_task_id text, p_revision integer, p_scope text,
  p_deployment_id bigint, p_task_status text, p_actor_id text, p_actor_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks%rowtype;
  v_updated_task public.tasks%rowtype;
  v_deployment public.deployments%rowtype;
  v_before_deployment public.deployments%rowtype;
  v_cancelled_count integer := 0;
  v_before_deployments jsonb := '[]'::jsonb;
  v_after_deployments jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  if p_scope not in ('one', 'all') then raise exception 'Invalid cancellation scope' using errcode = '22023'; end if;
  if p_task_status !~* 'cancel' then raise exception 'Task status must be a cancellation status' using errcode = '22023'; end if;
  select * into v_task from public.tasks where project_id = p_project_id and task_id = p_task_id for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if v_task.revision <> p_revision then raise exception 'Task changed by another user' using errcode = '40001'; end if;

  if p_scope = 'one' then
    if p_deployment_id is null then raise exception 'A deployment selection is required' using errcode = '22023'; end if;
    select * into v_deployment from public.deployments where project_id = p_project_id and task_id = p_task_id and id = p_deployment_id and result = 'planned' for update;
    if not found then raise exception 'Selected deployment is no longer planned' using errcode = '40001'; end if;
    v_before_deployment := v_deployment;
    update public.deployments set result = 'cancelled', updated_at = v_now where project_id = p_project_id and id = v_deployment.id returning * into v_deployment;
    v_cancelled_count := 1;
    v_before_deployments := jsonb_build_array(to_jsonb(v_before_deployment));
    v_after_deployments := jsonb_build_array(to_jsonb(v_deployment));
  else
    with locked_plans as (
      select id, to_jsonb(deployment) as before_snapshot from public.deployments deployment
      where project_id = p_project_id and task_id = p_task_id and result = 'planned' for update
    ), cancelled_plans as (
      update public.deployments deployment set result = 'cancelled', updated_at = v_now
      from locked_plans where deployment.id = locked_plans.id
      returning deployment.id, to_jsonb(deployment) as after_snapshot
    )
    select count(cancelled_plans.id), coalesce(jsonb_agg(locked_plans.before_snapshot), '[]'::jsonb), coalesce(jsonb_agg(cancelled_plans.after_snapshot), '[]'::jsonb)
    into v_cancelled_count, v_before_deployments, v_after_deployments
    from locked_plans left join cancelled_plans using (id);
    if v_cancelled_count = 0 then raise exception 'No planned deployment remains' using errcode = '40001'; end if;
  end if;

  update public.tasks set status = p_task_status, revision = revision + 1, updated_at = v_now, updated_by = p_actor_email
  where project_id = p_project_id and task_id = p_task_id and revision = p_revision returning * into v_updated_task;
  if not found then raise exception 'Task changed by another user' using errcode = '40001'; end if;

  insert into public.audit_logs(project_id, actor_id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
  values (p_project_id, p_actor_id, p_actor_email, 'cancel-deployments', 'task', p_task_id,
    jsonb_build_object('task', to_jsonb(v_task), 'scope', p_scope, 'deploymentId', p_deployment_id, 'deployments', v_before_deployments)::text,
    jsonb_build_object('task', to_jsonb(v_updated_task), 'cancelledDeploymentCount', v_cancelled_count, 'deployments', v_after_deployments)::text, v_now);
  return jsonb_build_object('task', to_jsonb(v_updated_task), 'deployments', v_after_deployments, 'cancelledDeploymentCount', v_cancelled_count);
end $$;

revoke all on function public.cancel_project_task_deployments(uuid,text,integer,text,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.cancel_project_task_deployments(uuid,text,integer,text,bigint,text,text,text) to service_role;
