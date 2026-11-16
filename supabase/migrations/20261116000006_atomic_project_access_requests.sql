-- Keep request lifecycle and membership creation in one transaction so competing reviews
-- cannot produce a rejected request with a granted membership.
create or replace function public.submit_project_access_request(
  p_project_id uuid,
  p_user_id text,
  p_email text,
  p_display_name text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rejected integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || lower(p_email), 0));
  if not exists (select 1 from public.projects where id = p_project_id and active) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.project_members where project_id = p_project_id and email = lower(p_email) and active) then
    raise exception 'You already have project access' using errcode = '23505';
  end if;
  if exists (select 1 from public.project_access_requests where project_id = p_project_id and email = lower(p_email) and status = 'pending') then
    raise exception 'An access request is already pending' using errcode = '23505';
  end if;
  if exists (select 1 from public.project_access_requests where project_id = p_project_id and email = lower(p_email) and status = 'approved') then
    raise exception 'You already have project access' using errcode = '23505';
  end if;
  select count(*) into v_rejected from public.project_access_requests where project_id = p_project_id and email = lower(p_email) and status = 'rejected';
  if v_rejected >= 3 then raise exception 'Access requests are no longer available after three rejections for this project.' using errcode = '42501'; end if;
  insert into public.project_access_requests(project_id, user_id, email, display_name, requested_role, status)
  values(p_project_id, p_user_id, lower(p_email), p_display_name, 'viewer', 'pending');
  return jsonb_build_object('status', 'pending');
end $$;

create or replace function public.review_project_access_request(
  p_project_id uuid,
  p_request_id bigint,
  p_action text,
  p_reviewer_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_request public.project_access_requests%rowtype; v_now timestamptz := now();
begin
  if p_action not in ('approve','reject') then raise exception 'Invalid action' using errcode = '22023'; end if;
  select * into v_request from public.project_access_requests where id = p_request_id and project_id = p_project_id and status = 'pending' for update;
  if not found then raise exception 'Request has already been reviewed' using errcode = 'P0002'; end if;
  if p_action = 'approve' then
    insert into public.project_members(project_id,user_id,email,display_name,role,active,granted_by,granted_at,updated_at)
    values(p_project_id,v_request.user_id,v_request.email,v_request.display_name,'viewer',true,p_reviewer_email,v_now,v_now)
    on conflict(project_id,email) do update set
      user_id = excluded.user_id,
      display_name = excluded.display_name,
      role = case when project_members.active and project_members.role in ('admin','editor') then project_members.role else excluded.role end,
      active = true, granted_by = excluded.granted_by, granted_at = excluded.granted_at, updated_at = excluded.updated_at;
  end if;
  update public.project_access_requests set status = case when p_action = 'approve' then 'approved' else 'rejected' end, reviewed_by = p_reviewer_email, reviewed_at = v_now, updated_at = v_now where id = v_request.id;
  return jsonb_build_object('id', v_request.id, 'status', case when p_action = 'approve' then 'approved' else 'rejected' end);
end $$;

revoke all on function public.submit_project_access_request(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.review_project_access_request(uuid,bigint,text,text) from public, anon, authenticated;
grant execute on function public.submit_project_access_request(uuid,text,text,text) to service_role;
grant execute on function public.review_project_access_request(uuid,bigint,text,text) to service_role;

create or replace function public.replace_project_due_thresholds(
  p_project_id uuid, p_red_days integer, p_yellow_days integer, p_gray_days integer,
  p_actor_id text, p_actor_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if p_red_days < 0 or p_red_days >= p_yellow_days or p_yellow_days >= p_gray_days then
    raise exception 'Due thresholds must increase from red to yellow to gray' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_before from public.lookup_values l where l.project_id = p_project_id and l.kind = 'due_threshold';
  delete from public.lookup_values where project_id = p_project_id and kind = 'due_threshold';
  insert into public.lookup_values(project_id, kind, value, active, sort_order) values
    (p_project_id, 'due_threshold', 'red:' || p_red_days, true, 1),
    (p_project_id, 'due_threshold', 'yellow:' || p_yellow_days, true, 2),
    (p_project_id, 'due_threshold', 'gray:' || p_gray_days, true, 3);
  insert into public.audit_logs(project_id, actor_id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
  values(p_project_id, p_actor_id, p_actor_email, 'update_due_thresholds', 'settings', 'settings', v_before::text, jsonb_build_object('redDays',p_red_days,'yellowDays',p_yellow_days,'grayDays',p_gray_days)::text, now());
  return jsonb_build_object('redDays',p_red_days,'yellowDays',p_yellow_days,'grayDays',p_gray_days);
end $$;

create or replace function public.import_project_seed(
  p_project_id uuid, p_tasks jsonb, p_deployments jsonb, p_lookups jsonb,
  p_actor_id text, p_actor_email text, p_source_id text,
  p_valid_tasks integer, p_deployment_count integer, p_warnings integer, p_duplicates integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if exists(select 1 from public.import_runs where project_id = p_project_id and source_id = p_source_id) then
    raise exception 'The spreadsheet has already been imported for this project' using errcode = '23505';
  end if;
  v_result := public.import_project_csv(p_project_id, 'insert', p_tasks, p_deployments, p_lookups, p_actor_id, p_actor_email, 'legacy-spreadsheet');
  insert into public.import_runs(project_id, source_id, imported_by, valid_tasks, deployments, warnings, duplicates, created_at)
  values(p_project_id, p_source_id, p_actor_email, p_valid_tasks, p_deployment_count, p_warnings, p_duplicates, now());
  return v_result;
end $$;

revoke all on function public.replace_project_due_thresholds(uuid,integer,integer,integer,text,text) from public, anon, authenticated;
revoke all on function public.import_project_seed(uuid,jsonb,jsonb,jsonb,text,text,text,integer,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.replace_project_due_thresholds(uuid,integer,integer,integer,text,text) to service_role;
grant execute on function public.import_project_seed(uuid,jsonb,jsonb,jsonb,text,text,text,integer,integer,integer,integer) to service_role;

create or replace function public.complete_project_production(
  p_project_id uuid, p_task_id text, p_revision integer, p_deployment_id bigint,
  p_mark_task_done boolean, p_actor_id text, p_actor_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_task public.tasks%rowtype; v_deployment public.deployments%rowtype; v_updated_task public.tasks%rowtype; v_now timestamptz := now();
begin
  select * into v_task from public.tasks where project_id = p_project_id and task_id = p_task_id for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if v_task.revision <> p_revision then raise exception 'Task changed by another user' using errcode = '40001'; end if;
  if p_deployment_id is null then
    select * into v_deployment from public.deployments where project_id = p_project_id and task_id = p_task_id and result = 'planned' order by id limit 1 for update;
  else
    select * into v_deployment from public.deployments where project_id = p_project_id and task_id = p_task_id and id = p_deployment_id and result = 'planned' for update;
  end if;
  if not found then raise exception 'Selected deployment is no longer planned' using errcode = '40001'; end if;
  update public.deployments set result = 'success', updated_at = v_now where project_id = p_project_id and id = v_deployment.id returning * into v_deployment;
  v_updated_task := v_task;
  if p_mark_task_done then
    update public.tasks set status = 'Deploy Prod Done', revision = revision + 1, updated_at = v_now, updated_by = p_actor_email where project_id = p_project_id and task_id = p_task_id and revision = p_revision returning * into v_updated_task;
    if not found then raise exception 'Task changed by another user' using errcode = '40001'; end if;
  end if;
  insert into public.audit_logs(project_id, actor_id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
  values(p_project_id,p_actor_id,p_actor_email,case when p_mark_task_done then 'complete-production' else 'selected-success' end,'deployment',v_deployment.id::text,null,to_jsonb(v_deployment)::text,v_now);
  return jsonb_build_object('task',to_jsonb(v_updated_task),'deployment',to_jsonb(v_deployment),'taskStatusChanged',p_mark_task_done);
end $$;
revoke all on function public.complete_project_production(uuid,text,integer,bigint,boolean,text,text) from public, anon, authenticated;
grant execute on function public.complete_project_production(uuid,text,integer,bigint,boolean,text,text) to service_role;

create or replace function public.create_project_lookup(
  p_project_id uuid, p_kind text, p_value text, p_actor_id text, p_actor_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_created public.lookup_values%rowtype; v_next integer;
begin
  if p_kind not in ('environment','team','service','status') then raise exception 'Invalid lookup kind' using errcode = '22023'; end if;
  if exists(select 1 from public.lookup_values where project_id = p_project_id and kind = p_kind and value = p_value) then raise exception 'This value already exists' using errcode = '23505'; end if;
  select coalesce(max(sort_order), 0) + 1 into v_next from public.lookup_values where project_id = p_project_id and kind = p_kind;
  insert into public.lookup_values(project_id,kind,value,active,sort_order) values(p_project_id,p_kind,p_value,true,v_next) returning * into v_created;
  insert into public.audit_logs(project_id,actor_id,actor_email,action,entity_type,entity_id,after_json,created_at)
  values(p_project_id,p_actor_id,p_actor_email,'create','settings','settings',to_jsonb(v_created)::text,now());
  return to_jsonb(v_created);
end $$;
revoke all on function public.create_project_lookup(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_project_lookup(uuid,text,text,text,text) to service_role;
