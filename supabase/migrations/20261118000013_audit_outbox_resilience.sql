-- Failed audit events stay durable and inspectable without blocking later work.
alter table public.project_audit_outbox
  add column if not exists last_error text,
  add column if not exists failed_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

create index if not exists project_audit_outbox_eligible_idx
  on public.project_audit_outbox (next_attempt_at, created_at, id)
  where processed_at is null and dead_lettered_at is null;

-- The project SSR query scopes deployments then orders this field.
create index if not exists deployments_project_date_label_idx
  on public.deployments (project_id, date_label);

create or replace function public.process_project_audit_outbox(p_limit integer default 100)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_processed integer := 0;
  v_row record;
  v_attempt integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'p_limit must be between 1 and 1000' using errcode = '22023';
  end if;
  for v_row in
    select id, project_id, actor_id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at
    from public.project_audit_outbox
    where processed_at is null and dead_lettered_at is null and (next_attempt_at is null or next_attempt_at <= now())
    order by created_at, id for update skip locked limit p_limit
  loop
    begin
      insert into public.audit_logs(outbox_id, project_id, actor_id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
      values (v_row.id, v_row.project_id, v_row.actor_id, v_row.actor_email, v_row.action, v_row.entity_type, v_row.entity_id, v_row.before_json, v_row.after_json, v_row.created_at)
      on conflict (outbox_id) where outbox_id is not null do nothing;
      update public.project_audit_outbox
      set processed_at = now(), attempts = attempts + 1, last_error = null, failed_at = null, next_attempt_at = null
      where id = v_row.id;
      v_processed := v_processed + 1;
    exception when others then
      -- Nested exception rolls back only this event. The rest of the batch proceeds.
      v_attempt := coalesce((select attempts from public.project_audit_outbox where id = v_row.id), 0) + 1;
      update public.project_audit_outbox
      set attempts = v_attempt,
          last_error = sqlerrm,
          failed_at = now(),
          next_attempt_at = case when v_attempt >= 5 then null else now() + make_interval(secs => least(300, 2 ^ v_attempt)) end,
          dead_lettered_at = case when v_attempt >= 5 then now() else null end
      where id = v_row.id;
    end;
  end loop;
  return v_processed;
end $$;

revoke all on function public.process_project_audit_outbox(integer) from public, anon, authenticated;
