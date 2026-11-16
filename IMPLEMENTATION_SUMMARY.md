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
