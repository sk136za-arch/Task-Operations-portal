# Task

Repair multi-project isolation, request lifecycle safety, and the audited project-management UI issues.

# Result

Operational data APIs now require an authorized project scope; dashboard actions use the project-scoped API surface. Access requests, lookup changes, urgency thresholds, seed imports, and production completion use transactional Supabase RPCs where partial writes previously existed.

# Implementation Plan

- Scope all task, deployment, member, lookup, import, export, audit, and dashboard operations by `project_id`.
- Add explicit `/api/projects/[projectId]/...` adapters and update dashboard callers.
- Use SQL transactions for request approval, request submission, and multi-write workflows.
- Correct responsive, keyboard, status-feedback, and duplicate-submit UI behavior.

# Changes Made

- Added `lib/project-route.ts`, scoped API authorization, and project API adapters.
- Scoped legacy-compatible handlers with mandatory `projectId` authorization and `project_id` filters/inserts.
- Added migration `20261116000006_atomic_project_access_requests.sql` for atomic request, lookup, threshold, seed-import, and production-completion operations.
- Replaced global user management with project membership management in the dashboard.
- Improved chooser and super-admin project UI accessibility and mobile behavior.
- Added a shared full-screen loading dialog for all client-side API mutations, with concurrent-request tracking and operation labels.
- Locked super-admin members from project-level editing, removal, and manual addition in both UI and API handlers.
- Removed desktop shell letterboxing so the dashboard fills the viewport at every supported breakpoint.

# Architecture Decisions

- Existing global endpoint paths require an explicit authorized project scope for stale clients; current dashboard calls use `/api/projects/[projectId]/...`.
- Supabase service-role calls remain server-only; permissions are checked before RPC calls.
- An approved request cannot be resubmitted, even if a member is later removed; a disabled prior admin who is approved again receives `viewer`, not their former elevated role.

# Tests

- `git diff --check`
- `npm run build`
- Static project-isolation and transaction review

# Validation

- Diff check passed.
- Production build passed.
- Live Supabase migration/RPC integration was not run because it requires the user's local or remote database environment.

# Review Findings

- Fixed cross-project API access, null project IDs on writes, request review races, partial urgency/import/completion writes, admin privilege restoration, and audited UI problems.

# Problems Found and Fixed

- Global APIs omitted project scope.
- Access requests used check-then-write behavior.
- Several multi-write workflows could partially commit.
- Mobile admin management and keyboard navigation were incomplete.

# Remaining Concerns

- Apply the new migration before deploying this code.
- `npm run lint` has existing repository-wide issues outside this focused change; build is clean.

# Files Changed

- Project API routes, dashboard, chooser/admin components, loading provider, stylesheet, project route helper, and Supabase migration.

# Final Status

Ready for migration application and environment-backed integration testing.

---

# Task

Keep overdue plans visible, synchronize terminal Task/deployment transitions, and provide a per-user notification activity feed.

# Result

Overdue Planned deployments remain visible as persistent red entries. Terminal Task transitions synchronize with deployment results atomically, and notifications now default to other users’ activity with per-user read state and before/after snapshots.

# Changes Made

- Removed the current-date exclusion from the timeline and added a dedicated red `due-overdue` state.
- Added migration `20261116000007_task_status_deployment_transitions.sql` with atomic success and cancellation RPCs.
- Added a project-scoped cancellation endpoint with validation, project authorization, revision checking, and conflict handling.
- Added a multi-plan cancellation modal and corrected the multiple-plan completion modal so it also completes the Task.
- Kept Task-only terminal status updates available when no Planned deployment remains.
- Added a read-only Notifications tab with project-scoped Task/deployment audit entries, safe snapshot parsing, detail comparison, and Task drawer navigation.
- Extended terminal transition audit snapshots with the affected deployment data before and after the change.
- Added migration `20261116000008_notification_reads.sql`, a scoped mark-read endpoint, unread badges, and an Others/My activity selector.
- Reworked activity details into Task/deployment change cards that show only user-facing fields whose values changed; raw audit JSON is no longer rendered in the UI.

# Architecture Decisions

- Timeline membership is still determined by deployment `Result`.
- Cancellation affects only deployments whose result is currently `planned`; terminal results are never overwritten.
- The all-plans cancellation RPC locks and updates the selected row set in one SQL statement to prevent concurrent plans from being unintentionally included.
- Notifications use the existing latest-100 project audit query. Read records are per user and audit event; all activity before the migration baseline is treated as read.
- Activity detail normalizes flat CRUD snapshots and nested terminal-transition snapshots, matching related Task and deployment records by stable IDs before calculating a field-level diff.

# Tests

- `git diff --check`
- Targeted ESLint on changed files
- `npm run lint`
- `npm run build`
- Field-level audit-diff static scenarios for create, update, delete, terminal transitions, malformed snapshots, and narrow/mobile layouts
- Independent implementation test and review

# Validation

- Diff check and production build passed.
- Targeted lint found only pre-existing errors/warnings in existing dashboard and task-route code; no new endpoint or validation error was reported.
- Repository-wide lint remains blocked by existing issues.

# Review Findings

- Verified scoped authorization, revision locking, terminal-result preservation, no-plan Task-only fallback, and desktop/mobile modal behavior by static review.
- Verified notification project isolation, viewer read-only behavior, malformed snapshot fallback, and deleted-record detail behavior by independent review.
- Verified mark-read idempotence, default other-user filtering, unread count behavior, and responsive source selector by independent test/review.

# Remaining Concerns

- Apply migrations `20261116000007_task_status_deployment_transitions.sql` and `20261116000008_notification_reads.sql` before deploying this version.
- No automated dashboard test suite is configured; local Supabase/browser QA remains recommended.

# Files Changed

- Dashboard, audit types, timeline stylesheet, Task API routes, validation, project cancellation route, and Supabase migration.

# Final Status

Ready for migration application and browser QA.

---

# Task

Keep dashboard mutations visibly fresh without waiting for RSC refreshes and reduce the project dashboard's Vercel/Supabase load.

# Result

Confirmed mutation responses now update dashboard state immediately; server refresh is a background reconciliation step. Notification feed payloads no longer include every audit snapshot, and detail data loads only when a user opens an activity.

# Changes Made

- Added local reconciliation for Task/deployment CRUD and terminal Done/Cancel transitions, including protection against an older server refresh overwriting a newer confirmed record.
- Kept bulk CSV import as a full navigation after the import succeeds, avoiding a mixed partial UI for bulk changes.
- Added a protected, no-store project-scoped activity-detail endpoint and reduced the initial audit query to notification summary fields.
- Added migration `20261118000009_dashboard_performance.sql` for query indexes and cancellation RPC results that include all changed deployments.

# Tests

- `npm run build`
- Targeted ESLint
- `git diff --check`
- Independent static test and review

# Validation

- Production build and diff check passed.
- Targeted lint still reports pre-existing dashboard/page lint debt; no new route or type error was introduced.

# Remaining Concerns

- Apply migration `20261118000009_dashboard_performance.sql` before deployment.
- Local Supabase `EXPLAIN ANALYZE` and deployed-browser latency measurement require the configured database and Vercel environment.

---

# Follow-up Performance Check

- Production dashboard reload on 18 Nov 2026 measured about 6.65 seconds in the authenticated browser, with no data-changing actions performed.
- Reused the authenticated identity and already-validated project record in the dashboard route, removing a duplicate authentication lookup and duplicate `projects` query before the dashboard's parallel data load.
- `npm run build` and `git diff --check` passed after the follow-up.

---

# Save-path performance follow-up

- Added migration `20261118000010_fast_project_mutations.sql` that moves standard Task and deployment updates into single, revision-safe Supabase RPC transactions with audit logging.
- The project-scoped API handlers retain existing validation and terminal deployment-transition protections while replacing sequential read/update/audit calls with one RPC request.
- Apply this migration before deploying the matching API code.

# Completion-status shortcut

- `Deploy Prod Done` now opens the local plan selector directly when several Planned deployments exist, or sends the one known plan ID directly when only one exists. This removes the previous preliminary server request while the RPC still validates the selected plan transactionally.
- Background dashboard reconciliation is now debounced for 1.2 seconds, so rapid consecutive saves coalesce into one expensive RSC refresh while confirmed local state remains visible immediately.

---

# Task

Move Task and Deployment notification auditing off the save critical path without losing audit events.

# Result

Task and Deployment mutations now atomically save their business change plus a durable outbox event. A bounded database worker materializes queued events into `audit_logs` later, so the Notifications feed is eventually consistent while edits no longer wait for the audit-log write.

# Implementation Plan

- Add a project-scoped, durable outbox with an idempotency link to `audit_logs`.
- Move Task/Deployment create, update, delete, Done, and Cancel audit generation inside their existing or new transactional RPCs.
- Process queued events in a bounded, concurrent-safe worker and document the Supabase Cron schedule.

# Changes Made

- Added `20261118000011_async_task_deployment_audits.sql` with `project_audit_outbox`, a partial pending index, `audit_logs.outbox_id`, and a unique idempotency index. `20261118000012_harden_audit_outbox_conflicts.sql` upgrades already-migrated stacks with the narrowly scoped conflict handler.
- Added transactional RPCs for Task creation, Deployment creation, and Deployment deletion; their API routes no longer perform sequential write/audit requests.
- Replaced synchronous Task/Deployment audit inserts in normal edits and Done/Cancel transitions with an outbox enqueue in the same database transaction.
- Added `process_project_audit_outbox(p_limit)` using `FOR UPDATE SKIP LOCKED` and a scoped `outbox_id` conflict arbiter, so concurrent/retried workers cannot duplicate or silently discard audit events.
- Documented the one-time Supabase Cron schedule in `README.md`; it runs the bounded worker every minute after the Cron extension is enabled.

# Architecture Decisions

- The scheduler is configured separately from the schema migration so production migration does not fail when the optional `pg_cron` extension has not yet been enabled.
- Outbox events retain the original action timestamp when materialized, preserving notification order.
- If the worker is down, business writes still succeed and audit events remain pending rather than being lost. New notifications can therefore appear up to one Cron interval later.

# Tests

- `npx supabase@latest db push --local`
- Read-only local verification of the outbox table and worker/create/delete RPC registrations
- `npm run build`
- `npm run lint`
- `git diff --check`
- Independent migration/concurrency review

# Validation

- Local Supabase applied migrations `20261118000010_fast_project_mutations.sql`, `20261118000011_async_task_deployment_audits.sql`, and `20261118000012_harden_audit_outbox_conflicts.sql` successfully.
- Production build and diff check passed.
- Repository lint still fails on existing repository-wide `no-explicit-any`, link, and render-purity issues; the changed routes retain the repository's existing `any` style but introduced no lint category beyond it.
- The local stack was not reset or seeded, so no user task/deployment records were modified for worker delivery testing.

# Review Findings

- Independent review identified that a broad `ON CONFLICT DO NOTHING` could mask an unrelated future unique violation and incorrectly mark an event delivered. It was narrowed to the outbox idempotency index before completion.

# Remaining Concerns

- Enable Supabase Cron and run the documented `cron.schedule` statement in each environment after applying migrations `20261118000011_async_task_deployment_audits.sql` and `20261118000012_harden_audit_outbox_conflicts.sql`; until then events accumulate safely in `project_audit_outbox` and Notifications will not receive new activity.
- Local integration delivery tests require disposable task/deployment fixtures; they were not run against existing local user data.

# Files Changed

- `supabase/migrations/20261118000011_async_task_deployment_audits.sql`
- `supabase/migrations/20261118000012_harden_audit_outbox_conflicts.sql`
- Task and Deployment API routes
- `README.md`

# Final Status

Ready to deploy after applying the migration and enabling the Cron worker.

---

# Project-entry performance follow-up

- Replaced the chooser's full-document project link with a prefetched framework `Link`.
- Parallelized project and membership authorization queries.
- Removed Notifications, notification-read state, project members, and pending access requests from the initial dashboard render path.
- Added protected, project-scoped deferred APIs for notification summaries and admin access data; Notifications preloads after first paint and Access loads only when its tab opens.
- `npm run build` and `git diff --check` passed. Targeted lint remains blocked only by existing repository-wide lint debt in the touched legacy files.
