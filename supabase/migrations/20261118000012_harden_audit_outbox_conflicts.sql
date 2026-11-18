-- Existing local stacks may have applied the first outbox migration before its
-- conflict target was narrowed. Recreate only the worker so every environment
-- treats an unrelated audit_logs constraint failure as a retryable failure.

create or replace function public.process_project_audit_outbox(p_limit integer default 100)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_processed integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'p_limit must be between 1 and 1000' using errcode = '22023';
  end if;

  with claimed as materialized (
    select id, project_id, actor_id, actor_email, action, entity_type, entity_id,
      before_json, after_json, created_at
    from public.project_audit_outbox
    where processed_at is null
    order by created_at, id
    for update skip locked
    limit p_limit
  ), materialized as (
    insert into public.audit_logs(
      outbox_id, project_id, actor_id, actor_email, action, entity_type, entity_id,
      before_json, after_json, created_at
    )
    select id, project_id, actor_id, actor_email, action, entity_type, entity_id,
      before_json, after_json, created_at
    from claimed
    on conflict (outbox_id) where outbox_id is not null do nothing
    returning outbox_id
  ), marked as (
    update public.project_audit_outbox queue
    set processed_at = now(), attempts = queue.attempts + 1
    from claimed
    where queue.id = claimed.id
    returning queue.id
  )
  select count(*) into v_processed from marked;

  return v_processed;
end $$;
