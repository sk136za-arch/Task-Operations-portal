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
