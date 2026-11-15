-- The Task Ops server uses the local/hosted Supabase service_role key.
-- Grant it table and identity-sequence privileges while browser roles remain protected by RLS.

grant usage on schema public to service_role;
grant all privileges on table public.users to service_role;
grant all privileges on table public.tasks to service_role;
grant all privileges on table public.deployments to service_role;
grant all privileges on table public.lookup_values to service_role;
grant all privileges on table public.audit_logs to service_role;
grant all privileges on table public.import_runs to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
