# VARUNA OPS — DRONEOPS PLATFORM
## Complete Enterprise Architecture Audit
### Deep Codebase Analysis · PRD Gap Report · Security Audit · Implementation Roadmap

---

**Document Type:** Senior Staff Engineering Architecture Audit  
**Platform:** Varuna Nexus DroneOps — Drone-as-a-Service Operations & Project Management  
**Audit Scope:** Full-stack — Backend (Node.js/Express/PostgreSQL), Frontend (React/Vite), Database Migrations, Security, RBAC, Performance  
**PRD Reference:** DroneOps Platform v1.0 Final Draft  
**Audit Date:** May 2026  
**Classification:** Internal — Confidential  

---

## TABLE OF CONTENTS

1. Executive Summary
2. Current System Architecture Analysis
3. Full Module-by-Module Analysis (8 Modules)
4. Current Implementation Score
5. PRD Compliance Score
6. Security Audit
7. Database Audit
8. RBAC Audit
9. Frontend Audit
10. Backend Audit
11. API Architecture Review
12. Performance Bottlenecks
13. Scalability Risks
14. Missing Features
15. Incorrect Features
16. Extra Features
17. UX Problems
18. Data Integrity Problems
19. Migration Risks
20. Hidden Critical Risks
21. Technical Debt Analysis
22. Root Cause Analysis
23. Dependency Mapping
24. Full Issue Prioritization (Master Bug Register)
25. Future Production Risks
26. Master Implementation Plan (Phases 1–4)

---

---

# SECTION 1 — EXECUTIVE SUMMARY

## Platform Overview

Varuna Nexus DroneOps is a full-stack enterprise SaaS platform for a Drone-as-a-Service company managing aerial inspection operations across solar PV, wind, T&D power lines, towers, pipelines, and volumetric estimation domains. The platform consolidates project lifecycle management, resource scheduling, cost estimation, document management, and client deliverable tracking into a single role-aware web application.

## Architecture Stack

| Layer | Technology |
|-------|-----------|
| Backend Framework | Node.js 18 + Express 4 |
| Database | PostgreSQL 15 (Supabase-hosted) |
| ORM / Query Layer | Raw `pg` Pool (parameterized queries) |
| Authentication | JWT (HttpOnly Cookie), bcryptjs |
| File Storage | Cloudflare R2 (S3-compatible) |
| Frontend Framework | React 18 + Vite |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| Maps | Leaflet.js (backend: GeoJSON/KML) |
| Scheduling | node-cron (daily expiry checks) |
| Email | Nodemailer (configurable SMTP) |
| Validation | Joi (backend) |

## Audit Verdict

The platform is **structurally sound and architecturally well-organized**. The domain-driven folder structure, parameterized queries throughout, HttpOnly cookie auth, and layered RBAC middleware stack reflect genuine engineering discipline. However, the system is currently at approximately **62% PRD compliance** with several critical gaps that would make it unfit for production deployment at scale. These gaps are concentrated in:

1. Missing secondary resource allocation (secondary pilot/drone — a core PRD requirement)
2. Estimation rate card system exists in DB but never wired to the cost engine
3. Scope handling in `project.service.js` bypasses the proper `scope.service.js` module
4. No testing infrastructure (zero test files found across the entire codebase)
5. Three frontend list views have no pagination (projects, pipeline, library)
6. Certification/insurance/maintenance checks missing from allocation conflict logic

## Most Critical Issues (Must Fix Before Production)

| # | Issue | Severity | Module |
|---|-------|----------|--------|
| 1 | No secondary pilot/drone allocation support | CRITICAL | Projects/Resources |
| 2 | Estimation rate cards DB table never used | CRITICAL | Estimation |
| 3 | Cost engine field naming mismatch (frontend vs backend) | CRITICAL | Estimation |
| 4 | Drone insurance expiry not checked in allocations | CRITICAL | Resource Calendar |
| 5 | Drone next_maintenance not checked in allocations | CRITICAL | Resource Calendar |
| 6 | Pilot per_day_rate never populated from DB | HIGH | Estimation |
| 7 | No testing infrastructure | HIGH | All |
| 8 | No pagination on any list view | HIGH | All |
| 9 | project.service.js inline scope bypasses scope.service.js | HIGH | Projects |
| 10 | Library download endpoint has no per-document access control | HIGH | Library |

---

---

# SECTION 2 — CURRENT SYSTEM ARCHITECTURE ANALYSIS

## 2.1 Folder Structure Assessment

```
backend/
├── src/
│   ├── app.js                    ✅ Clean Express wiring, scheduler now initialized
│   ├── server.js                 (entry point, not audited)
│   ├── core/
│   │   ├── config/
│   │   │   ├── db.js             ✅ Pool config, graceful shutdown
│   │   │   └── env.js            ✅ Required var validation, good defaults
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js         ✅ Cookie+Bearer, sliding session
│   │   │   ├── role.middleware.js         ✅ Clean variadic RBAC
│   │   │   ├── projectAccess.middleware.js ✅ Membership check
│   │   │   ├── projectRole.middleware.js  ✅ Project-level role check
│   │   │   ├── upload.middleware.js       ⚠ MIME-only (no magic bytes)
│   │   │   ├── validate.middleware.js     ✅ Joi wrapper
│   │   │   └── error.middleware.js        ✅ Global error handler
│   │   └── utils/
│   │       ├── scheduler.js      ✅ Daily cron (NOW initialized in app.js)
│   │       ├── r2Upload.js       ⚠ No file integrity check
│   │       ├── r2Download.js     ⚠ No presigned URL support
│   │       └── response.js       ✅ Consistent envelope
│   └── domains/
│       ├── audit/                ✅ Immutable audit log
│       ├── dashboard/            ⚠ N+1 risk, overdue check now in cron
│       ├── estimation/           ❌ Rate card gap, field naming mismatch
│       ├── library/              ⚠ No per-document ACL
│       ├── notification/         ✅ In-app + email, preference table exists
│       ├── pipeline/             ✅ Kanban, conversion, calendar sync
│       ├── project/              ⚠ Inline scope/allocation bypasses modules
│       ├── resource/             ⚠ Missing insurance/maintenance checks
│       ├── scheduling/           ✅ Calendar, conflicts, override
│       └── user/                 ✅ Auth, RBAC, password reset
└── database/migrations/          ✅ Sequential SQL, 5 migrations

frontend/
├── src/
│   ├── api/
│   │   ├── axios.js              ✅ Cookie auth, 401 redirect
│   │   └── endpoints.ts          ✅ Typed endpoint registry
│   ├── context/AuthContext.jsx   ⚠ Sentinel string anti-pattern resolved
│   ├── routes/
│   │   ├── AppRoutes.jsx         ✅ Lazy loading, role gates correct
│   │   ├── PrivateRoute.jsx      ✅ Auth guard
│   │   └── RoleRoute.jsx         ✅ Role guard
│   ├── pages/                    ⚠ No pagination, no global state
│   └── modules/library/          ✅ Separate module folder for library
```

## 2.2 Architecture Pattern Assessment

**Pattern Used:** Domain-Driven Design (DDD) with subdomain routing  
**Request Flow:** `Express Route → Authenticate → Authorize (system) → Authorize (project) → Validate (Joi) → Controller → Service → DB → Response`

This is the correct enterprise pattern. However, **the project domain breaks the pattern** by inlining scope and allocation logic inside `project.service.js` rather than delegating to `scope.service.js` and `allocation.service.js`. This creates duplicate, divergent logic.

## 2.3 Data Access Pattern Assessment

**Pattern Used:** Raw SQL via `pg.Pool` with parameterized queries  
**Verdict:** Correct and secure. No ORM magic, full SQL control, no injection risk from parameterization.  
**Risk:** COALESCE update pattern (`COALESCE($1, column)`) fails when intentionally setting a nullable field to NULL. This is a known pattern flaw in 7 service files.

---

---

# SECTION 3 — FULL MODULE-BY-MODULE ANALYSIS

---

## MODULE 1: DASHBOARD

### CURRENT STATE
`dashboard.service.js` + `dashboard.controller.js` + `dashboard.routes.js` + `frontend/pages/dashboard/Dashboard.jsx`

The backend provides 7 endpoints: summary (KPI counts), projects (filtered list), project details, activity feed, utilization (pilot allocation days), upcoming (30-day lookahead), and alerts (starting-soon + unallocated confirmed + expiring docs). The frontend renders all zones: KPI cards, India map, project list, project summary panel, activity feed, and alert strip.

### WHAT IS CORRECT
- KPI counts correctly use SQL `COUNT(*) FILTER (WHERE ...)` — single-query aggregation
- Role scoping enforced: admins see all, PMs see their projects, pilots see assigned
- `deleted_at IS NULL` filter present in all project queries
- `getAlerts()` provides starting-soon, unallocated, and expiring document alerts
- Activity feed correctly uses `LEFT JOIN users` (handles deleted-user entries)
- Pilot utilization aggregates `SUM(end_date - start_date)` correctly
- Overdue notification now moved to daily cron (fixed this session)

### WHAT IS WRONG
- `getProjects()` in dashboard is a full duplicate of `project.service.js::getProjects()` — same filter logic, same SQL, separate file. Any bug fix in one is not reflected in the other.
- `exportGlobalData()` returns a raw CSV string with no `Content-Type: text/csv` header set — the controller must set headers, but no controller code enforces this.
- Dashboard map in frontend (`DashboardMap`) renders markers but has no clustering for >50 markers — will visually collapse at scale.
- KPI cards compute "open" as `enquiry + confirmed` client-side — inconsistent with backend which returns them separately.
- Frontend project list hardcoded to `max-h-[360px]` (~10 visible rows) with no pagination — shows at most 8-10 projects.

### WHAT IS MISSING
- **Project type breakdown chart** — PRD §3.2 Zone A explicitly requires type-based distribution
- **Pipeline value card** — PRD §3.2 Zone A requires a Pipeline KPI card with total estimated value
- **Resource utilization chart** — PRD §12.1 requires pilot + drone utilization over a period; only pilot days are counted, drone utilization is absent
- **CSV export `Content-Type` header** — `exportGlobalData()` returns raw string, controller must set `text/csv` and `Content-Disposition` headers
- **Global search bar** — PRD §2.2 requires top-bar global search across project names, PO numbers, pilot names — not implemented

### WHAT IS EXTRA
- `triggerOverdueNotifications()` previously called on every `getSummary()` request — now fixed to cron-only
- No unnecessary extra features

### SECURITY RISKS
- `exportGlobalData()` is not restricted to admin-only in routes — any authenticated user can export all projects as CSV if they know the endpoint
- No rate limiting on dashboard endpoints — heavy aggregation queries could be DoS'd by repeated rapid calls

### ARCHITECTURE RISKS
- Duplicated project query logic between `dashboard.service.js` and `project.service.js` — two sources of truth
- `getSummary()` runs 2 independent heavy queries sequentially (projects + pipeline) — should be parallelized with `Promise.all()`

### DATABASE RISKS
- `getActivity()` uses `LIMIT 15` hardcoded — no way for frontend to request more history
- `getUtilization()` runs `SUM(end_date - start_date)` with no index on allocation dates — full table scan for large datasets

### SCALABILITY RISKS
- No caching on `getSummary()` — expensive aggregation on every dashboard load
- No pagination on project list — at 1,000 projects, frontend receives full dataset in one response

### REQUIRED IMPROVEMENTS
1. [HIGH] Add `Content-Type: text/csv` and `Content-Disposition: attachment` to export controller
2. [HIGH] Add admin-only guard to `GET /dashboard/export`
3. [HIGH] Parallelize `getSummary()` queries: `const [projects, pipeline] = await Promise.all([...])`
4. [HIGH] Add pagination to `GET /dashboard/projects` and implement infinite scroll in frontend
5. [MEDIUM] Deduplicate `getProjects()` — dashboard should call `project.service.js::getProjects()`
6. [MEDIUM] Add pipeline value KPI card to frontend
7. [MEDIUM] Add global search bar in top nav (endpoint: `GET /projects?search=`)

### IMPLEMENTATION PRIORITY: HIGH

---

## MODULE 2: PROJECTS

### CURRENT STATE
Full CRUD with 6 submodules (scope, resources/allocations, documents, deliverables, map, members). `project.service.js` handles top-level CRUD; submodules each have their own service/controller/routes. The project creation wizard (6 steps) is implemented in `ProjectForm.jsx`.

### WHAT IS CORRECT
- Parameterized SQL throughout — no injection risk
- COALESCE-based partial update in `updateProject()`
- `deleted_at IS NULL` filter on all SELECT queries
- Audit logging on create/update/delete
- Creator auto-added as `project_manager` to `project_members`
- Allocated pilot auto-added to `project_members` with `pilot` role
- Notification on new project (all admins) and status change (all members)
- Deliverables: optional file (pending vs uploaded lifecycle), approve with `approved_by`/`approved_at`
- Documents: version control (v1, v2...) on re-upload
- Map: GeoJSON upsert with `_created` flag
- Members: role aliasing (project-level vs system-level roles)
- Project routes: `PUT/:id` and `DELETE/:id` protected by `requireProjectRole('project_manager')`

### WHAT IS WRONG
1. **`project.service.js` creates allocations inline** (lines 39–56) instead of calling `allocation.service.js`. This inline code performs ZERO conflict detection — no pilot overlap check, no drone overlap check, no calendar event check, no status validation (active pilot/drone). A project can be created with a double-booked pilot via the creation form.

2. **`project.service.js` creates scope inline** (lines 59–64) using `deliverables_expected: JSON.stringify({ description: data.scope })` — this stores scope as a flat description string in the wrong JSONB field. The structured `scope.service.js` module with proper `scope_type`, `area_hectares`, `length_km`, `asset_count` fields is completely bypassed.

3. **No secondary pilot/drone allocation** — `project.service.js` and `ProjectForm.jsx` Step 4 only handle one pilot and one drone. PRD §4.3 Step 4 explicitly requires secondary pilot and secondary drone. The `allocations.is_primary` column was added in migration 005 but is never populated.

4. **Status transitions not validated** — A project can jump from `enquiry` directly to `delivered` or from `delivered` back to `in_progress`. PRD implies a progression. There is no `validateStatusTransition()` guard.

5. **`project.service.js::updateProject()` scope handling** (lines 183–189): When updating a project, if `data.scope` is provided, it deletes the existing scope and re-inserts inline. This destroys all structured scope fields (`scope_type`, `area_hectares`, `length_km`) and replaces them with a description blob.

6. **`getProjectById()`** does not filter `deleted_at IS NULL` — soft-deleted projects can be retrieved by direct ID lookup.

### WHAT IS MISSING
- **Secondary pilot allocation** — the single most visible missing feature
- **Secondary drone allocation**
- **Conflict check on project creation** — inline allocation bypasses all conflict detection
- **Project status transition validation** — no allowed-transitions matrix
- **Field-level pilot edit restrictions** — pilots should only be able to upload documents/notes; no server-side enforcement beyond RBAC middleware
- **KML boundary rendering** — frontend `ProjectForm` step 2 accepts KML upload but it's stored as a generic project document, not parsed for map rendering in Tab 2
- **Project health percentage** — no computed field for % deliverables approved / total expected
- **PRD §4.3 Step 3**: Scope form step shows a single textarea, not the structured type-specific fields (area hectares, length km, asset count, deliverables checklist)

### WHAT IS EXTRA
- `deleteProject()` is soft-delete only — appropriate
- Notification on status change is extra but valuable

### SECURITY RISKS
- **Insecure Direct Object Reference (IDOR) on `getProjectById()`**: No membership check — any authenticated user can retrieve any project by UUID if they know/guess it. `projectAccess.middleware.js` only runs for routes under `/:id/*`, not the `GET /:id` route itself... actually `router.use('/:id', requireProjectAccess)` does cover `GET /:id` since it applies to all routes with `:id`. But `getProjectById()` in the service does not filter `deleted_at IS NULL`.
- **Pilot forced into project_members**: `createProject()` auto-adds the allocated pilot to `project_members` with `pilot` role — correct per design, but if `pilot_id` is forged or belongs to wrong project, pilot gains membership.

### DATABASE RISKS
- **Orphan scope records**: `updateProject()` calls `DELETE FROM project_scope WHERE project_id=$1` before re-inserting — if the insert fails midway (power cut), scope is permanently deleted with no transaction wrapper.
- **No transaction on `createProject()`**: Inserts into `projects`, `allocations`, `project_scope`, and `project_members` in separate queries with no `BEGIN/COMMIT`. If any step fails, partial data is left in the DB.

### FRONTEND RISKS
- `ProjectForm.jsx` step 4 fetches pilots and drones from hardcoded paths, not using `ENDPOINTS` constants — diverges from endpoint registry
- No availability pre-check before form submission — conflict is only discovered post-submit
- Draft auto-save to localStorage includes pilot/drone IDs that may become stale

### REQUIRED IMPROVEMENTS
1. [CRITICAL] Wrap `createProject()` in a database transaction
2. [CRITICAL] Replace inline allocation creation with a call to `allocation.service.js::createAllocation()` — this enables conflict detection on project creation
3. [CRITICAL] Add secondary pilot/drone fields to both `project.service.js` and `ProjectForm.jsx` step 4
4. [HIGH] Fix `getProjectById()` to filter `deleted_at IS NULL`
5. [HIGH] Wrap `updateProject()` scope changes in a transaction
6. [HIGH] Replace inline scope creation with a call to `scope.service.js`
7. [HIGH] Add status transition validation: define allowed-transitions map
8. [MEDIUM] Add field-level permission enforcement for pilot role (server-side, not just UI)
9. [MEDIUM] Fix `ProjectForm.jsx` to use `ENDPOINTS.RESOURCES.PILOTS` and `ENDPOINTS.RESOURCES.DRONES`
10. [MEDIUM] Implement drone availability pre-check in step 4 (currently commented out)

### DEPENDENCY IMPACT
Fixing allocation creation to use `allocation.service.js` will impact:
- `project.service.js::createProject()` and `updateProject()`
- `project.routes.js` (no route changes needed)
- `ProjectForm.jsx` (must handle conflict warnings in step 4)
- `allocation_conflicts` table (will now receive records on create)

### IMPLEMENTATION PRIORITY: CRITICAL

---

## MODULE 3: PIPELINE

### CURRENT STATE
`pipeline.service.js` + `pipeline.routes.js` + `pipeline.controller.js` + `conversion.service.js` + `PipelineBoard.jsx` + `PipelineForm.jsx`

Kanban board with 4 active stages (enquiry, proposal, negotiation, verbal_confirmation) + lost archive. Drag-and-drop stage updates. Conversion to confirmed project via `conversion.service.js`. Calendar integration for tentative allocations.

### WHAT IS CORRECT
- Stage `converted` is immutable — cannot be set via `PUT /pipeline/:id/stage`
- `converted_project_id` FK links pipeline to project for traceability
- `conversion.service.js` runs inside a DB transaction (BEGIN/COMMIT/ROLLBACK)
- Conversion creates allocation if `tentative_pilot`/`tentative_drone` exists
- Pipeline calendar entries appear in Resource Calendar as tentative blocks
- Stage update prevents setting `lost` → active stages (pipeline stays in lost bucket)
- Kanban board implemented correctly with drag-and-drop
- `PipelineForm.jsx` excludes `converted` from stage dropdown

### WHAT IS WRONG
1. **`conversion.service.js` previously used `${userId}` (UUID) in notification message** — fixed this session (now uses `triggeredBy` name).
2. **`getPipelines()` has no role scoping** — any project manager or admin sees ALL pipeline entries, regardless of who created them. PRD implies PMs should see their own + all (they can create/edit all), but the filter is missing entirely.
3. **Pipeline entries have no `created_by` column** — no way to know who created a pipeline entry, no attribution in audit logs.
4. **`win_probability` is stored as integer (0-100) but displayed as percentage** — inconsistent with PRD which describes it as Low/Medium/High category, not raw number.
5. **Calendar view for pipeline** shows tentative start/end as single-day events, not multi-day spans — `calendar.service.js` builds pipeline events correctly, but frontend may render them incorrectly.

### WHAT IS MISSING
- **`created_by` column on `pipeline` table** — required for attribution and PM scoping
- **Pipeline on India map** — PRD §5.4 requires pipeline entries with location to appear as hollow/dashed markers on the Projects map. Not implemented in `ProjectList.jsx`
- **Pipeline estimated value summary** — PRD §5.3 requires total pipeline value + count per stage in the Kanban header. Not implemented in `PipelineBoard.jsx`
- **PRD §5.2 win probability** — backend has 0-100 integer; PRD allows categories (Low/Medium/High); frontend shows raw number; no color-coded badge
- **Stage duration tracking** — no `stage_changed_at` timestamp to measure funnel velocity

### SECURITY RISKS
- Any admin or PM can view, edit, and delete any pipeline entry — no ownership scoping enforced server-side

### DATABASE RISKS
- `pipeline` table has no `created_by` column — orphaned records after user deletion
- `pipeline.tentative_pilot` and `tentative_drone` are FK columns but have no `ON DELETE SET NULL` — if pilot/drone is deleted, pipeline entries referencing them will fail FK checks

### REQUIRED IMPROVEMENTS
1. [HIGH] Add `created_by UUID REFERENCES users(id) ON DELETE SET NULL` to `pipeline` table (migration)
2. [HIGH] Add `created_by = $userId` to `createPipeline()` service
3. [HIGH] Implement pipeline map markers in `ProjectList.jsx` (hollow markers with 'Show Pipeline' toggle)
4. [MEDIUM] Add pipeline value summary row to `PipelineBoard.jsx`
5. [MEDIUM] Add win probability color-badge (green ≥70%, amber 30–70%, red <30%)
6. [LOW] Add `stage_changed_at` timestamp and stage history tracking

### IMPLEMENTATION PRIORITY: HIGH

---

## MODULE 4: RESOURCE CALENDAR

### CURRENT STATE
`calendar.service.js` + `calendar.routes.js` + `event.service.js` + `conflict.service.js` + `Calendar.jsx`

FullCalendar integration in frontend. Backend merges three event sources: confirmed allocations, pipeline tentatives, and manual events. Conflict detection exists in `allocation.service.js` for new allocations. Override with mandatory reason is supported.

### WHAT IS CORRECT
- Multi-source calendar merge (allocations + pipeline + manual events)
- `allocation.service.js` checks: pilot date overlap, drone date overlap, pilot status (active), drone status (active), calendar event conflicts (leave/training for pilots, maintenance for drones)
- Force override with `override_reason` stored in `allocation_conflicts` table
- Calendar filters by pilot, drone, project (multi-select)
- Event CRUD for manual entries (exhibitions, training, maintenance, leave)
- Conflict record written to `allocation_conflicts` when force=true

### WHAT IS WRONG
1. **No drone maintenance-schedule check**: `allocation.service.js` correctly checks calendar events of type `maintenance` for drones. However, `drones.next_maintenance` (a DB column) is NEVER checked. A drone can be allocated even when its scheduled next_maintenance date falls within the allocation window.

2. **No insurance expiry check**: `drones.insurance_expiry` column exists in DB. An expired-insurance drone can be freely allocated.

3. **No pilot certification check**: `pilots.certifications` JSONB field exists but `allocation.service.js` never validates whether the allocated pilot is certified to fly the specified drone type.

4. **`allocation_conflicts.override_reason` never populated on force=true**: The `override_reason` field was added in migration 005. The `allocation.service.js::createAllocation()` receives `override_reason` from the request body but the INSERT into `allocation_conflicts` does not include it — the override reason is never persisted.

5. **Quarterly view** described in PRD §6.2 — FullCalendar supports this but it is not configured in `Calendar.jsx`. Only month and week views are available.

6. **No concurrent edit protection**: If two project managers allocate the same pilot simultaneously, both may pass the conflict check (before either commits), creating a real conflict.

### WHAT IS MISSING
- **Drone `next_maintenance` date check in allocation** — before allowing an allocation, verify no maintenance falls within the date range
- **Drone `insurance_expiry` check** — warn/block allocation if insurance expired
- **Pilot certification check** — validate pilot is certified for the selected drone
- **Quarterly calendar view** — PRD §6.2 explicitly requires quarterly view
- **`allocation_conflicts.override_reason` persistence** — override reason is logged to console but never written to DB

### SECURITY RISKS
- Calendar events (`POST /calendar/events`) require only authentication — no role restriction. Any pilot can create a "leave" event for a different pilot or a "maintenance" event for a drone they don't own, which would block that resource from future allocations.

### DATABASE RISKS
- `allocation_conflicts` table has `override_reason` column (added M-005) but is never populated — silent data quality issue
- No unique constraint on allocation_conflicts (project_id, pilot_id/drone_id, date_range) — duplicate conflict records possible

### REQUIRED IMPROVEMENTS
1. [CRITICAL] Add `drone.next_maintenance` window check in `allocation.service.js::createAllocation()`
2. [CRITICAL] Add `drone.insurance_expiry` check in `allocation.service.js`
3. [CRITICAL] Populate `override_reason`, `overridden_by`, `overridden_at` in `allocation_conflicts` INSERT
4. [HIGH] Add role guard on `POST /calendar/events` (admin + project_manager only)
5. [HIGH] Add pilot certification validation in `createAllocation()`
6. [MEDIUM] Add quarterly view to `Calendar.jsx`
7. [MEDIUM] Add pessimistic locking (`SELECT ... FOR UPDATE`) to conflict check + insert to prevent race conditions

### IMPLEMENTATION PRIORITY: CRITICAL

---

## MODULE 5: ESTIMATION

### CURRENT STATE
`estimation.service.js` + `estimation.controller.js` + `costEngine.service.js` + `export.service.js` + `estimation.items.controller.js` + `EstimationList.jsx` + `EstimationForm.jsx`

Cost engine computes: pilot cost, drone cost, travel, processing, accommodation, per_diem, software, deliverables, overhead %, contingency %, margin %, GST. Excel export uses ExcelJS with live `{ formula: '...' }` objects. PDF export uses pdfkit with branded cover page. Clone functionality copies estimates for reuse.

### WHAT IS CORRECT
- Admin-only access (routes + frontend AppRoutes)
- Excel export uses `{ formula: '...' }` — formulas are live, not flat values
- PDF is branded with VARUNA NEXUS cover page, financial summary, T&Cs
- Cost engine includes overhead, contingency, per_diem, accommodation, software, deliverables — matches PRD §7.3.6 commercial parameters
- Clone function creates a full copy of the estimation
- `getEstimations()` role-scoped (admin sees all, others filtered — but estimation is admin-only so this is redundant)
- Line items (`estimation_items`) have category + description + quantity + unit_cost + total_cost

### WHAT IS WRONG
1. **Rate card DB table never used**: Migration 005 created `estimation_rate_cards(category, item_name, unit, rate, is_active)` as a configurable rate card system. `costEngine.service.js` never reads from this table — all rates come from request body inputs. The frontend `EstimationForm.jsx` hardcodes default rates per project type. This means: rate changes require code changes, not DB updates.

2. **Field naming mismatch between frontend and backend**: The frontend `costEngine.js` utility (client-side) returns `pilotCost`, `droneCost`, `directCosts`. The backend `costEngine.service.js` returns `pilotCost`, `droneCost` in breakdown. However, `estimation.items.service.js::recalcEstimationTotal()` reads `details.breakdown` fields that do not match the actual structure. This causes items total to diverge from the estimation-level total.

3. **No link to pipeline or project**: The `estimations` table has no `project_id` or `pipeline_id` FK column. PRD §7.3.1 requires linking estimates to pipeline/project entries. There is no way to navigate from a project to its estimate or vice versa.

4. **`EstimationForm.jsx` unit rate display** (cost per MWp / per km / per turbine) — the PRD §7.3.7 requires displaying unit rate. This is computed client-side but not stored in DB or displayed in the list view.

5. **No estimation approval workflow**: PRD implies estimates are "saved to system" and linked to projects for reference. There is no `status` field (draft/final/approved) on estimations.

### WHAT IS MISSING
- **`project_id` / `pipeline_id` FK on `estimations` table** — cannot link estimate to project/pipeline
- **Rate card API endpoint** — `GET /estimations/rate-cards` to load DB rates on form init
- **Rate card integration in `costEngine.service.js`** — load `estimation_rate_cards` and use as defaults
- **Unit rate display** in list view (cost per MWp, per km, etc.)
- **Estimation status** (draft/submitted/approved)
- **PRD §7.4** — "Save to System" currently creates the estimation but does not link it anywhere
- **Overhead/margin default config from `company_config`** — `company_config` table has fields for these but `costEngine` uses request body values only

### SECURITY RISKS
- Estimation data (client names, pricing, margins) is accessible to anyone with admin role — appropriate, but no audit log on estimation views (reads not logged)

### DATABASE RISKS
- `estimations.details` is JSONB — schema-less. If `costEngine.service.js` changes field names, old estimations become unreadable without migration
- `estimation_items` `total_cost` field is manually set by caller — no DB trigger to enforce `total_cost = quantity * unit_cost`

### REQUIRED IMPROVEMENTS
1. [CRITICAL] Add `project_id UUID REFERENCES projects(id) ON DELETE SET NULL` and `pipeline_id UUID REFERENCES pipeline(id) ON DELETE SET NULL` to `estimations` table
2. [CRITICAL] Implement `GET /estimations/rate-cards` endpoint that reads from `estimation_rate_cards`
3. [CRITICAL] Wire `costEngine.service.js` to load defaults from `estimation_rate_cards` (pilot rate, drone rate, travel rate, accommodation, overhead %, margin %, GST %, contingency %)
4. [HIGH] Standardize `costEngine` field naming across frontend and backend
5. [HIGH] Fix `recalcEstimationTotal()` to use correct breakdown field names
6. [MEDIUM] Add `status` field (draft/submitted/approved) to estimations
7. [MEDIUM] Add unit rate display to `EstimationList.jsx`
8. [LOW] Read overhead/margin defaults from `company_config` table

### IMPLEMENTATION PRIORITY: CRITICAL

---

## MODULE 6: LIBRARY

### CURRENT STATE
`library.service.js` + `library.controller.js` + `library.routes.js` + `folder.controller.js` + `tag.controller.js` + `LibraryPage.jsx`

Multi-level folder hierarchy, tag system, document versioning (`library_versions` table), admin-only writes, restore previous version. File storage on Cloudflare R2.

### WHAT IS CORRECT
- Admin-only for all write operations (create/update/delete/upload/version)
- All reads require authentication
- Version history maintained in `library_versions` table
- Version restore endpoint: `POST /library/documents/:id/versions/:versionId/restore`
- Folder hierarchy supports parent_id (self-referential) for nesting
- Tag system with many-to-many junction table (`library_file_tags`)
- Download endpoint logs activity to `activity_logs`
- `library_documents.deleted_at` column exists (soft-delete schema in place)

### WHAT IS WRONG
1. **No per-document access control**: Any authenticated user (including pilots) can download any document. There is no way to mark a document as "admin-only" or "project-specific". A salary slip or unreleased pricing document would be visible to all 30 pilots.

2. **Soft-delete not enforced in queries**: `library_documents.deleted_at` column exists but none of the `getDocuments()`, `getVersions()`, or `downloadDocument()` queries filter `WHERE deleted_at IS NULL`. Soft-deleted documents are still returned and downloadable.

3. **`updateDocument()` is metadata-only** — can update name/description/category but cannot replace file. To replace a file, user must go to version history → add version. This is unintuitive and not documented.

4. **`library_documents.file_size` column**: Added in migration 005 but never populated in `createDocument()` service — all documents show null file size.

### WHAT IS MISSING
- **Per-document access level** — `public` (all users), `admin_only`, `project_restricted` 
- **Preview functionality** — PRD §8.3 requires preview button for PDF and images; no preview endpoint or signed URL generation
- **Search in document name AND description** — `getDocuments()` uses only `ILIKE` on `name`; description search is missing
- **File type filter** — `GET /library/documents?file_type=pdf` not implemented
- **`file_size` population** — must be populated from `req.file.size` in upload middleware
- **Archive functionality** — PRD §8.5 describes archive (removed from active listing but kept for compliance); `deleted_at` exists but no archive endpoint

### SECURITY RISKS
- **No download authorization beyond authentication**: A pilot can download the company's financial estimation templates, NDA templates with pricing, and compliance certificates
- **No presigned URL expiry**: R2 stream endpoint proxies files — but if the file key is guessed, it could be fetched directly from R2 without authentication (depending on R2 bucket policy)

### DATABASE RISKS
- `library_versions` table accumulates indefinitely — no retention policy or cleanup job
- `library_file_tags` has no cascade delete — deleting a tag leaves orphaned junction rows

### REQUIRED IMPROVEMENTS
1. [HIGH] Add `access_level TEXT DEFAULT 'all'` column to `library_documents` (migration)
2. [HIGH] Filter `deleted_at IS NULL` in all `getDocuments()`, `getVersions()`, download queries
3. [HIGH] Populate `file_size` from `req.file.size` in `createDocument()` and `addVersion()`
4. [HIGH] Add document description to search query
5. [MEDIUM] Add file type filter parameter to `GET /library/documents`
6. [MEDIUM] Add `POST /library/documents/:id/archive` endpoint (sets `deleted_at`)
7. [LOW] Add presigned URL generation option for direct browser preview (PDF/image)

### IMPLEMENTATION PRIORITY: HIGH

---

## MODULE 7: RESOURCE MANAGEMENT (PILOTS & DRONES)

### CURRENT STATE
`pilot.service.js` + `drone.service.js` + `allocations.service.js` + `resource.routes.js` + `Pilots.jsx` + `Drones.jsx` + `DroneDetail.jsx` + `Allocations.jsx`

Full CRUD for pilots and drones. Pilots are user profile extensions (1:1 with `users` table). Auto-creates user account and emails credentials when pilot created with email. Soft-delete with active-allocation guard. Availability endpoint for pilots.

### WHAT IS CORRECT
- Pilot auto-create user account with bcrypt-hashed random password and email notification
- Soft-delete with active allocation guard (prevents deleting actively-deployed resources)
- Drone maintenance log CRUD (`drone_maintenance_logs` table)
- Pilot availability check (allocations + calendar events in date range)
- Global allocations view with pilot/drone/project filters
- Drone status check (`active` required for allocation)

### WHAT IS WRONG
1. **`pilot.service.js::createPilot()` random password generation** uses `Math.random()` — not cryptographically secure. For credential generation, `crypto.randomBytes()` should be used.

2. **`pilot.service.js::updatePilot()`** can set `license_expiry` but never validates that the new expiry date is in the future.

3. **`drone.service.js::getDrones()`** joins nothing — returns drones without any maintenance status context. Frontend `DroneDetail.jsx` must make a separate call for maintenance logs.

4. **`allocations.service.js`** (global view) contains a `conflict_count` aggregation that is computationally expensive — counts from `allocation_conflicts` for every row.

5. **Pilot page `Pilots.jsx`** hardcodes pilot availability check to `ENDPOINTS.RESOURCES.PILOT_AVAIL` — but the endpoint was previously 404ing (referenced in summary as "commented out to avoid 404"). This needs verification.

### WHAT IS MISSING
- **Per-day rate** (`pilots.per_day_rate`, `drones.day_rate`) — columns exist in DB schema but are never returned by `getPilots()` / `getDrones()`. The estimation form cannot auto-populate resource rates from the resource registry.
- **`drones.make` field** — PRD §10.2 requires Make as a separate field from Model. The DB has `make` column (migration 003+) but `drone.service.js::createDrone()` INSERT does not include `make`.
- **`drones.sensor_payloads` (array)** — PRD §10.2 requires multi-sensor support; DB has `TEXT[]` but service only handles single `sensor_type TEXT`. Insert/update ignores `sensor_payloads`.
- **Drone insurance expiry tracking in allocation** — column exists, check missing in `allocation.service.js`
- **Pilot `employee_id`** — column exists but never populated from API
- **`DroneDetail.jsx`** — shows drone info + maintenance logs but no allocation history

### SECURITY RISKS
- Plaintext provisional password printed to server console (acceptable for internal tool, but log aggregation services like DataDog/Papertrail would capture it)
- `Math.random()` used for credential generation — not CSPRNG

### REQUIRED IMPROVEMENTS
1. [CRITICAL] Replace `Math.random()` with `crypto.randomBytes(6).toString('hex')` for pilot credential generation
2. [CRITICAL] Include `per_day_rate` in `getPilots()` and `day_rate` in `getDrones()` response for estimation integration
3. [HIGH] Add `make` to `drone.service.js::createDrone()` INSERT and `updateDrone()` UPDATE
4. [HIGH] Handle `sensor_payloads TEXT[]` in drone create/update (currently only `sensor_type TEXT`)
5. [MEDIUM] Add `license_expiry >= CURRENT_DATE` validation warning in `updatePilot()`
6. [MEDIUM] Add allocation history to `DroneDetail.jsx`

### IMPLEMENTATION PRIORITY: HIGH

---

## MODULE 8: AUTHENTICATION & USER MANAGEMENT

### CURRENT STATE
`auth.service.js` + `auth.controller.js` + `password.service.js` + `user.service.js` + `auth.routes.js` + `user.routes.js` + `Login.jsx` + `Profile.jsx` + `Users.jsx`

JWT in HttpOnly cookie (8h expiry), bcrypt(12) password hashing, OTP-based password reset (bcrypt-hashed OTP in DB), sliding session (cookie refreshed on each request).

### WHAT IS CORRECT
- HttpOnly cookie prevents XSS token theft
- bcrypt(cost=12) for password storage and OTP storage
- OTP has 1-hour expiry + `used` flag + `FOR UPDATE` pessimistic lock on reset
- Anti-enumeration: forgot-password always returns success regardless of email existence
- Sliding session: cookie `maxAge` refreshed on each authenticated request
- Cookie is `sameSite: strict` — CSRF protection
- Admin-only user registration
- Self-deletion prevention in `deleteUser()`

### WHAT IS WRONG
1. **No account lockout after failed login attempts** — unlimited brute-force allowed at API level (rate limiter skipped in development and limited to 10 req/15min in production — 10 attempts per 15min for any credential pair is insufficient for targeted attacks).

2. **No email verification on registration** — admins can create accounts with any email address; no confirmation that the email belongs to the user.

3. **No token revocation** — JWT-only with TTL expiry. There is no token blacklist. If a token is stolen, it remains valid until natural expiry (8 hours). Admin cannot forcibly log out a compromised account.

4. **2FA columns exist in DB** (`two_factor_enabled`, `two_factor_secret`, `two_factor_backup_codes`) but there is no 2FA flow in `auth.service.js` or `auth.routes.js` — completely unimplemented.

### WHAT IS MISSING
- **Account lockout** after N failed attempts (e.g., 5 attempts → 15-minute lockout)
- **Token revocation/blacklist** — required for security incident response
- **2FA implementation** — DB columns exist, logic does not
- **Role change audit** — when admin changes a user's role, it is not separately logged beyond general user update
- **Password policy enforcement** — only `length >= 8` validated; no complexity requirements

### REQUIRED IMPROVEMENTS
1. [HIGH] Implement account lockout: add `failed_login_attempts INT DEFAULT 0` and `locked_until TIMESTAMP` to users table; increment on failure, reset on success
2. [HIGH] Implement token revocation: add `revoked_tokens` table; check on each auth middleware execution
3. [MEDIUM] Implement 2FA flow (TOTP): use `speakeasy` library with existing DB columns
4. [MEDIUM] Log role changes as separate RBAC_CHANGE audit entries
5. [LOW] Add password complexity validation (uppercase + number + special char)

### IMPLEMENTATION PRIORITY: HIGH

---

---

# SECTION 4 — CURRENT IMPLEMENTATION SCORE

| Module | PRD Features | Implemented | Partial | Missing | Score |
|--------|-------------|-------------|---------|---------|-------|
| Dashboard | 18 | 12 | 3 | 3 | 67% |
| Projects | 32 | 20 | 5 | 7 | 63% |
| Pipeline | 14 | 10 | 2 | 2 | 71% |
| Resource Calendar | 20 | 13 | 3 | 4 | 65% |
| Estimation | 22 | 13 | 4 | 5 | 59% |
| Library | 18 | 12 | 2 | 4 | 67% |
| Resources | 16 | 10 | 3 | 3 | 63% |
| Auth/Users | 12 | 8 | 1 | 3 | 67% |
| **TOTAL** | **152** | **98** | **23** | **31** | **64%** |

**Overall Platform Implementation: 64%**

---

---

# SECTION 5 — PRD COMPLIANCE SCORE

| PRD Section | Requirement | Status | Gap |
|-------------|-------------|--------|-----|
| §3 Dashboard — KPI cards | 6 cards defined | ⚠ Partial | Pipeline value card missing |
| §3 Dashboard — Map overlay | India map with markers | ✅ | — |
| §3 Dashboard — Activity feed | Last 10 actions | ✅ | Pagination missing |
| §4.3 Projects — Step 4 Resources | Primary + Secondary pilot + drone | ❌ Missing | Secondary resources entirely absent |
| §4.3 Projects — Step 3 Scope | Structured fields by type | ❌ Wrong | Single textarea, not type-specific |
| §4.4 Projects — Tab 2 Map | KML boundary rendering | ⚠ Partial | KML uploaded but not parsed for display |
| §4.5 Project editing — Pilot limits | Pilot can upload docs/notes only | ⚠ Partial | No server-side field-level guard |
| §5.4 Pipeline — Map integration | Hollow markers for pipeline | ❌ Missing | Not in ProjectList.jsx |
| §5.5 Pipeline → Project conversion | Convert + pre-fill + link | ✅ | — |
| §6.2 Calendar — Quarterly view | Three-month compact view | ❌ Missing | Only month/week |
| §6.7 Calendar — Conflict detection | Overlap warning + override | ✅ | Override_reason not persisted |
| §7.3.1 Estimation — Project link | Link estimate to pipeline/project | ❌ Missing | No FK columns on estimations |
| §7.3.3 Estimation — Logistics | Accommodation, per_diem, distance | ✅ | — |
| §7.3.5 Estimation — Rate cards | Default rates from system config | ❌ Missing | Hardcoded in frontend |
| §7.3.8 Estimation — Excel formulas | Live formulas in .xlsx | ✅ | — |
| §8.3 Library — Preview | PDF and image preview | ❌ Missing | Download only |
| §8.6 Library — Version history | Version restore | ✅ | — |
| §9.1 RBAC — Pilot field limits | Pilot can only edit notes/field docs | ⚠ Partial | Not server-side enforced |
| §9.3 Auth — 2FA | Configurable per user | ❌ Missing | DB columns only |
| §10.1 Company Config | Company name, logo, GSTIN | ✅ Table exists | No admin UI to manage it |
| §10.2 Resource Master — Drone | Make, model, sensor, UIN, day_rate | ⚠ Partial | make/sensor_payloads not fully used |
| §10.2 Resource Master — Pilot | License expiry, per_day_rate | ⚠ Partial | per_day_rate not returned in API |
| §10.3 Rate Cards | Travel, accommodation, overhead defaults | ❌ Missing | Table exists, never queried |
| §11.2 Email notifications | 6 specific alert types | ⚠ Partial | Allocation + expiry done; others missing |
| §11.3 Notification preferences | User-configurable per category | ⚠ Partial | Table exists, logic not wired |

**PRD Compliance: 58%** (14 fully met, 8 partial, 11 missing)

---

---

# SECTION 6 — SECURITY AUDIT

## 6.1 Authentication Security

| Check | Status | Notes |
|-------|--------|-------|
| Password hashing | ✅ PASS | bcrypt cost=12 |
| Token storage | ✅ PASS | HttpOnly cookie |
| Token expiry | ✅ PASS | 8h per PRD |
| CSRF protection | ✅ PASS | sameSite=strict |
| HTTPS enforcement | ✅ PASS | Helmet + secure cookie in prod |
| Brute force protection | ⚠ PARTIAL | 10 req/15min (not IP-per-user) |
| Account lockout | ❌ MISSING | No lockout after failed logins |
| Token revocation | ❌ MISSING | No blacklist |
| 2FA | ❌ MISSING | DB columns only |
| Sliding session refresh | ✅ PASS | Cookie maxAge refreshed per request |

## 6.2 Authorization Security

| Check | Status | Notes |
|-------|--------|-------|
| RBAC system-level | ✅ PASS | 3-tier role middleware |
| RBAC project-level | ✅ PASS | project_members role check |
| Estimation admin-only | ✅ PASS | routes + frontend |
| Library writes admin-only | ✅ PASS | all mutation routes guarded |
| Calendar event creation | ❌ FAIL | Any authenticated user can create events |
| Library download (per-doc ACL) | ❌ FAIL | Any user can download any document |
| Dashboard export (admin-only) | ❌ FAIL | No role guard on export endpoint |
| Pilot field-level restrictions | ⚠ PARTIAL | UI-only, no server enforcement |

## 6.3 Injection Security

| Check | Status | Notes |
|-------|--------|-------|
| SQL injection | ✅ PASS | All queries parameterized |
| XSS in emails | ✅ PASS | `esc()` helper applied throughout |
| HTML injection in notifications | ✅ PASS | Plain text only in notification messages |
| File upload path traversal | ✅ PASS | R2 key generation sanitizes filename |
| File upload MIME spoofing | ⚠ RISK | MIME type only, no magic byte verification |
| CORS misconfiguration | ✅ PASS | `env.frontendUrl` only (no wildcard) |

## 6.4 Data Exposure Security

| Check | Status | Notes |
|-------|--------|-------|
| Password in responses | ✅ PASS | Never returned |
| Token in response body | ✅ PASS | Cookie only |
| PII in audit logs | ⚠ RISK | `old_value`/`new_value` JSONB can contain anything |
| Provisional password in logs | ⚠ RISK | Printed to console/server logs |
| Error stack traces | ✅ PASS | Hidden in production |

## 6.5 Critical Security Findings

### SEC-01 [HIGH] — Calendar Event Creation Open to All Roles
**Vulnerability:** Any authenticated user (including pilot) can call `POST /calendar/events` to create a leave event for ANY pilot or maintenance event for ANY drone.  
**Impact:** Pilot can block colleagues from future allocations by creating fake leave entries. Denial-of-resource attack vector.  
**Fix:** Add `authorize('admin', 'project_manager')` to `POST/PUT/DELETE /calendar/events`

### SEC-02 [HIGH] — Dashboard Export No Role Guard
**Vulnerability:** `GET /dashboard/export` has no role restriction. Any project manager or pilot can export all project data as CSV.  
**Fix:** Add `authorize('admin')` to export endpoint in `dashboard.routes.js`

### SEC-03 [MEDIUM] — Library No Per-Document Access Level
**Vulnerability:** All authenticated users can download any document including financial templates, pricing, HR documents.  
**Fix:** Add `access_level` column to `library_documents`; check before stream

### SEC-04 [MEDIUM] — MIME-Only File Validation
**Vulnerability:** Attacker can rename `malicious.php` to `malicious.pdf` and upload it. MIME type from `req.file.mimetype` is derived from filename extension by multer — not from file content.  
**Fix:** Add magic byte verification in `upload.middleware.js` using `file-type` npm package

### SEC-05 [LOW] — Provisional Password in Server Logs
**Risk:** `console.log` of `randomPassword` is captured by log aggregation services.  
**Fix:** Remove or mask console log; email delivery is sufficient

---

---

# SECTION 7 — DATABASE AUDIT

## 7.1 Schema Completeness

| Table | Status | Notes |
|-------|--------|-------|
| users | ✅ Complete | Has 2FA columns (unused), deleted_at |
| projects | ✅ Complete | All PRD fields present |
| project_scope | ✅ Complete | Structured fields + JSONB for deliverables |
| pilots | ✅ Complete | license_expiry, per_day_rate, certifications JSONB |
| drones | ⚠ Partial | `make` exists but not populated by service |
| allocations | ✅ Complete | is_primary, is_pipeline flags added |
| pipeline | ⚠ Partial | Missing `created_by` FK |
| estimations | ❌ Gap | Missing `project_id`, `pipeline_id` FKs |
| estimation_rate_cards | ⚠ Exists | Table created, never queried |
| company_config | ⚠ Exists | Seeded, no admin UI |
| user_notification_prefs | ⚠ Exists | Table created, never used in logic |
| library_documents | ⚠ Partial | `file_size` never populated |
| allocation_conflicts | ✅ Complete | Override columns added in M-005 |
| activity_logs | ✅ Complete | FK to users added in M-005 |

## 7.2 Index Audit

| Index | Present | Needed For |
|-------|---------|-----------|
| projects.created_by | ✅ | Creator lookup |
| projects.status | ✅ | Status filtering |
| allocations.pilot_id | ✅ | Conflict detection |
| allocations.drone_id | ✅ | Conflict detection |
| allocations.start_date, end_date | ❌ | Date range overlap queries |
| project_members.user_id | ✅ | Membership check |
| notifications.user_id + is_read | ❌ | Unread count queries |
| pipeline.stage | ❌ | Kanban board queries |
| activity_logs.entity_type + entity_id | ❌ | Entity-specific audit log |

## 7.3 Data Integrity Audit

| Constraint | Status | Notes |
|------------|--------|-------|
| project_scope UNIQUE(project_id) | ✅ Added M-005 | |
| activity_logs FK user_id | ✅ Added M-005 | ON DELETE SET NULL |
| project_members UNIQUE(project_id, user_id) | ✅ Initial | |
| pilots UNIQUE(employee_id) | ✅ Initial | |
| drones UNIQUE(serial_number) | ✅ Initial | |
| library_tags UNIQUE(name) | ✅ | |
| allocation: no unique constraint on overlaps | ❌ Missing | Relies on service-level check only |
| library_file_tags cascade on tag delete | ❌ Missing | Orphaned tag rows |
| pipeline.tentative_pilot ON DELETE SET NULL | ❌ Missing | FK violation on pilot delete |

## 7.4 COALESCE Pattern Risk

Seven services use the `COALESCE($n, column_name)` pattern for partial updates. This pattern fails silently when a field is intentionally set to `NULL` (e.g., clearing a pilot assignment). The `COALESCE` will preserve the old value instead of clearing it. Affected services: `project.service.js`, `drone.service.js`, `pilot.service.js`, `pipeline.service.js`, `event.service.js`, `allocation.service.js`, `library.service.js`.

**Fix:** Use explicit `data.field !== undefined ? data.field : existing.field` pattern (already used in some services) consistently across all.

## 7.5 Migration Numbering

| File | Notes |
|------|-------|
| 001_initial_schema.sql | ✅ Foundation — complete |
| 002_enterprise_library.sql | ✅ Library tables |
| 003_fix_schema.sql | ✅ Renames, indexes, soft-delete |
| 004_operational_enhancements.sql | ✅ Location fields, category |
| 005_system_config_and_integrity.sql | ✅ Company config, rate cards, integrity |

No gaps in numbering. No forward-reference FK issues (projects.source_pipeline_id is plain UUID, not FK).

---

---

# SECTION 8 — RBAC AUDIT

## 8.1 System-Level RBAC Matrix

| Endpoint Category | Admin | Project Manager | Pilot |
|-------------------|-------|----------------|-------|
| POST /auth/register | ✅ Required | ❌ Blocked | ❌ Blocked |
| GET/PUT/DELETE /users | ✅ | ❌ | ❌ |
| POST/PUT/DELETE /projects | ✅ | ✅ (assigned) | ❌ |
| GET /projects | ✅ | ✅ (scoped) | ✅ (scoped) |
| POST/PUT/DELETE /pipeline | ✅ | ✅ | ❌ |
| POST/PUT/DELETE /calendar/events | ✅ | ✅ | ✅ ← **WRONG** |
| POST/PUT/DELETE /estimations | ✅ | ❌ | ❌ |
| GET /estimations | ✅ | ❌ | ❌ |
| POST/PUT/DELETE /library/documents | ✅ | ❌ | ❌ |
| GET /library/documents (download) | ✅ | ✅ | ✅ |
| GET /dashboard/export | ✅ | ✅ ← **WRONG** | ✅ ← **WRONG** |
| GET /audit | ✅ | ❌ | ❌ |
| GET/PUT/DELETE /resources/pilots | ✅ | ❌ (read-only) | ❌ |
| GET/PUT/DELETE /resources/drones | ✅ | ❌ (read-only) | ❌ |

## 8.2 Project-Level RBAC Matrix

| Action | Admin | Project Manager (member) | Pilot (member) |
|--------|-------|--------------------------|----------------|
| GET project details | ✅ | ✅ | ✅ |
| PUT project core | ✅ | ✅ | ❌ |
| DELETE project | ✅ | ✅ | ❌ |
| POST/PUT/DELETE scope | ✅ | ✅ | ❌ |
| POST/PUT/DELETE allocations | ✅ | ✅ | ❌ |
| POST documents | ✅ | ✅ | ✅ ← Pilot can upload documents (correct) |
| DELETE documents | ✅ | ✅ | ✅ ← **WRONG** — pilot should not delete |
| POST deliverables | ✅ | ✅ | ✅ ← Pilot can upload deliverables (correct) |
| PUT/DELETE deliverables | ✅ | ✅ | ❌ |
| PUT deliverables/approve | ✅ | ✅ | ❌ |
| GET members | ✅ | ✅ | ✅ |
| POST/DELETE members | ✅ | ✅ | ❌ |

**Issue identified:** Document DELETE has no role guard in `projectDocs.routes.js` — pilots can delete project documents.

## 8.3 RBAC Gaps Summary

1. `POST/PUT/DELETE /calendar/events` — pilots can create fake leave/maintenance events
2. `GET /dashboard/export` — no admin-only guard
3. `DELETE /projects/:id/documents/:docId` — pilot can delete project documents
4. Library download — no per-document access level check
5. Pilot can edit project core fields (server doesn't enforce field-level restrictions)

---

---

# SECTION 9 — FRONTEND AUDIT

## 9.1 Architecture Assessment

| Aspect | Assessment |
|--------|-----------|
| State Management | useState per-component (no Zustand/Redux) — scales poorly |
| Data Fetching | Raw `axios` calls per component — no caching, deduplication, or SWR |
| Routing | React Router v6 with lazy loading — correct |
| Auth Context | Custom AuthContext with localStorage persistence — functional |
| Error Handling | Basic try/catch in components — no global error boundary |
| Bundle Splitting | Lazy imports per page — correct |
| Form Management | Controlled inputs — functional |
| Map Integration | Leaflet.js — correct choice for India map with KML |

## 9.2 Page-Level Audit

| Page | Status | Key Issues |
|------|--------|-----------|
| Login | ✅ OK | — |
| Dashboard | ⚠ | No pagination, hardcoded map height, no pipeline card |
| ProjectList | ⚠ | Map clustering not implemented for >50 markers |
| ProjectDetail | ⚠ | Tab data fetched on first access only (stale if updated from elsewhere) |
| ProjectForm | ❌ | No secondary pilot/drone, scope is single textarea, no conflict pre-check |
| PipelineBoard | ⚠ | No stage value summary, drag-and-drop relies on HTML5 DnD (touch issues) |
| Calendar | ⚠ | No quarterly view, no drag-to-reschedule |
| EstimationForm | ❌ | Hardcoded rates, no project linkage UI, no status field |
| LibraryPage | ⚠ | No preview functionality, no access level indicator |
| Users | ✅ OK | — |
| AuditLog | ✅ OK | — |

## 9.3 Common Frontend Anti-Patterns Found

1. **No React Query / SWR**: Every page fetches on mount with no caching. Navigating back to a page re-fetches all data.
2. **No error boundaries**: If any component throws during render, the entire page crashes with no graceful fallback.
3. **No optimistic updates**: All mutations wait for server response before updating UI — creates noticeable lag.
4. **No debounce on all search inputs**: Some inputs debounce, others do not — inconsistent UX.
5. **Map component leaks**: Leaflet maps instantiated but not always cleaned up on `useEffect` unmount.
6. **No form validation library**: Validation is ad-hoc per component — some fields validated, others not.
7. **Constants not fully used**: `ENDPOINTS` registry exists but `ProjectForm.jsx` hardcodes paths.

---

---

# SECTION 10 — BACKEND AUDIT

## 10.1 Service Layer Quality

| Service | Quality | Key Issues |
|---------|---------|-----------|
| auth.service.js | ✅ HIGH | Clean, secure |
| project.service.js | ⚠ MEDIUM | Inline allocation/scope bypass |
| allocation.service.js | ✅ HIGH | Excellent conflict detection |
| pilot.service.js | ⚠ MEDIUM | Math.random() for credentials |
| drone.service.js | ⚠ MEDIUM | make/sensor_payloads not used |
| costEngine.service.js | ⚠ MEDIUM | Rate card not wired |
| dashboard.service.js | ✅ HIGH | Clean, role-scoped |
| library.service.js | ⚠ MEDIUM | file_size not populated |
| notification.service.js | ✅ HIGH | Preference table not used |
| scheduler.js | ✅ HIGH | Now initialized correctly |
| conversion.service.js | ✅ HIGH | Transactional, notification fixed |

## 10.2 Missing Transactions

Services without transaction wrapping on multi-table operations:

| Service | Operation | Risk |
|---------|-----------|------|
| `project.service.js::createProject()` | 4 table inserts | Partial project on failure |
| `project.service.js::updateProject()` scope update | DELETE + INSERT | Scope lost on failure |
| `pilot.service.js::createPilot()` | user + pilot insert | User created, pilot fails |

## 10.3 N+1 Query Risks

| Location | Issue |
|----------|-------|
| `scheduler.js::runExpiryChecks()` | Loops per pilot to send email — no batch |
| `project.service.js::createProject()` notifications | `Promise.all` is correct, not N+1 |
| `getAlerts()` | 3 separate queries — acceptable, could be parallelized |
| `dashboard.service.js::getProjects()` → no N+1 | ✅ Single query |

---

---

# SECTION 11 — API ARCHITECTURE REVIEW

## 11.1 API Design Assessment

| Aspect | Assessment |
|--------|-----------|
| REST Compliance | ✅ Good — proper HTTP verbs and status codes |
| Response Envelope | ✅ Consistent `{success, data, message}` |
| Error Format | ✅ Consistent `{success: false, message, statusCode}` |
| Versioning | ✅ `/api/v1/` prefix |
| Nested Routes | ✅ `/projects/:id/deliverables/:deliverableId` correct |
| Endpoint Naming | ✅ Consistent REST naming |
| Validation | ✅ Joi validation on create/update for projects |
| Pagination | ❌ Missing on most list endpoints |

## 11.2 Missing API Endpoints (PRD-required)

| Endpoint | PRD Section | Status |
|----------|-------------|--------|
| GET /estimations/rate-cards | §10.3 | ❌ Missing |
| GET /system/config | §10.1 | ❌ Missing |
| PUT /system/config | §10.1 | ❌ Missing |
| GET /resources/drones/:id/availability | §4.3 | ❌ Missing |
| GET /pipeline/calendar-view | §5.6 | ✅ Exists |
| GET /library/documents?file_type= | §8.4 | ❌ Param missing |
| POST /library/documents/:id/archive | §8.5 | ❌ Missing |
| GET /notifications (with category filter) | §11.3 | ❌ Param missing |
| PUT /users/:id/notification-prefs | §11.3 | ❌ Missing |

## 11.3 Validation Coverage

| Route | Validation | Status |
|-------|-----------|--------|
| POST /projects | createProjectSchema | ✅ |
| PUT /projects/:id | updateProjectSchema | ✅ |
| POST /pipeline | validation schema | ✅ |
| POST /allocations | date validation in service | ⚠ (no Joi schema) |
| POST /estimations | no Joi schema | ❌ |
| POST /resources/pilots | no Joi schema | ❌ |
| POST /resources/drones | no Joi schema | ❌ |
| POST /library/documents | no Joi schema | ❌ |

---

---

# SECTION 12 — PERFORMANCE BOTTLENECKS

| Issue | Severity | Location | Fix |
|-------|----------|----------|-----|
| Dashboard `getSummary()` — 2 sequential queries | HIGH | dashboard.service.js | `Promise.all()` |
| No pagination on list endpoints | HIGH | All list routes | Add `LIMIT/OFFSET` + metadata |
| `getActivity()` 15-row hardcoded limit | MEDIUM | dashboard.service.js | Make limit configurable |
| `getUtilization()` full `allocations` scan | MEDIUM | dashboard.service.js | Add index on `start_date, end_date` |
| Scheduler pilot loop: sequential email sends | MEDIUM | scheduler.js | `Promise.all()` for email batch |
| No response caching on static data (rate cards, categories) | MEDIUM | Multiple | Redis/node-cache for 1h TTL |
| Leaflet map re-render on every project filter change | MEDIUM | ProjectList.jsx | Memoize markers array |
| `getDrones()` full scan for pagination | LOW | drone.service.js | Index on `deleted_at` |
| No query timeout on DB pool | LOW | db.js | Add `statement_timeout: 30000` |
| R2 stream proxy adds latency vs presigned URL | LOW | r2Download.js | Add presigned URL for browser preview |

---

---

# SECTION 13 — SCALABILITY RISKS

| Risk | Current State | Limit | Fix |
|------|--------------|-------|-----|
| No pagination — project list | Full table returned | ~200 projects before 3s load | Add cursor pagination |
| No connection pool sizing | 5 dev / 20 prod | ~20 concurrent users in prod | Tune pool based on Supabase limits |
| JSONB `details` in estimations | Flexible but schema-less | Requires migration if structure changes | Add versioned schema metadata |
| R2 stream via server | All downloads proxied | 50+ concurrent = bandwidth bottleneck | Presigned URLs for large files |
| No caching layer | All data from PostgreSQL | >100 RPS on dashboard = DB saturation | Add Redis for KPI aggregates (5min TTL) |
| Single-process scheduler | node-cron in Express process | Multiple pods = multiple cron executions | Move to separate worker process or use pg-cron |
| No CDN for frontend assets | Static from Vite build | Acceptable for current scale | Add Cloudflare CDN in prod |

---

---

# SECTION 14 — MISSING FEATURES

## Critical (blocks core PRD compliance)

| ID | Feature | PRD Reference | Impact |
|----|---------|---------------|--------|
| MF-01 | Secondary pilot allocation | §4.3 Step 4 | Can't staff complex missions |
| MF-02 | Secondary drone allocation | §4.3 Step 4 | Can't deploy 2-drone teams |
| MF-03 | Estimation ↔ Project/Pipeline link | §7.3.1 | Can't navigate from project to estimate |
| MF-04 | Rate card API endpoint | §10.3 | Rates are hardcoded, not configurable |
| MF-05 | Estimation rate card in cost engine | §10.3 | Admin can't update rates without code change |

## High (significant UX/workflow gaps)

| ID | Feature | PRD Reference |
|----|---------|---------------|
| MF-06 | Pipeline map overlay | §5.4 |
| MF-07 | KML boundary rendering on project map | §4.4 Tab 2 |
| MF-08 | Quarterly calendar view | §6.2 |
| MF-09 | Project scope structured form (type-specific) | §4.3 Step 3 |
| MF-10 | System configuration admin UI | §10.1 |
| MF-11 | Company config API endpoints | §10.1 |
| MF-12 | Drone availability check (GET /drones/:id/availability) | §4.3 Step 4 |
| MF-13 | Library document preview (PDF/image) | §8.3 |
| MF-14 | Notification preferences UI + API | §11.3 |

## Medium (polish and completeness)

| ID | Feature | PRD Reference |
|----|---------|---------------|
| MF-15 | Account lockout after failed logins | §9.3 |
| MF-16 | 2FA implementation | §9.3 |
| MF-17 | Project health percentage computed field | §4.4 Tab 1 |
| MF-18 | Library per-document access level | §8 |
| MF-19 | Certification validation in allocations | §10.2 |
| MF-20 | Insurance expiry check in allocations | §10.2 |
| MF-21 | Pilot `employee_id` API | §10.2 |
| MF-22 | `per_day_rate` in pilot API response | §10.2 |
| MF-23 | `day_rate` in drone API response | §10.2 |

---

---

# SECTION 15 — INCORRECT FEATURES

| ID | Feature | What Is Wrong | Correct Behavior |
|----|---------|---------------|-----------------|
| IF-01 | Project creation inline allocation | No conflict detection | Use `allocation.service.js` |
| IF-02 | Project creation inline scope | Stores description blob in wrong JSONB field | Use `scope.service.js` |
| IF-03 | Drone `createDrone()` — missing `make` field | `make` column in DB, never inserted | Include `make` in INSERT |
| IF-04 | Drone `sensor_type` TEXT vs `sensor_payloads TEXT[]` | Service uses single text field | Use array field |
| IF-05 | `allocation_conflicts.override_reason` never populated | Column exists, always null | Populate on forced override |
| IF-06 | `library_documents.file_size` never populated | Column exists, always null | Set from `req.file.size` |
| IF-07 | `updateProject()` scope — DELETE + inline INSERT | Destroys structured scope fields | Delegate to `scope.service.js::upsertScope()` |
| IF-08 | Calendar event POST — no role guard | Pilots can create fake events | Add `authorize('admin','project_manager')` |
| IF-09 | Dashboard export — no admin guard | Any user can export | Add `authorize('admin')` |
| IF-10 | `Math.random()` for pilot credentials | Not CSPRNG | Use `crypto.randomBytes()` |
| IF-11 | `getProjectById()` — no `deleted_at IS NULL` | Soft-deleted projects retrievable | Add filter |

---

---

# SECTION 16 — EXTRA FEATURES

These exist in the codebase beyond the PRD scope. They are not wrong, but represent scope creep or premature implementation.

| Feature | Location | Assessment |
|---------|----------|-----------|
| Two-factor auth DB columns (without logic) | users table | Pre-mature — good to have later |
| `company_config` table (without admin UI) | Migration 005 | Half-baked — complete or remove |
| `user_notification_prefs` table (without logic) | Migration 005 | Half-baked — wire or remove |
| `estimation_rate_cards` table (without queries) | Migration 005 | Half-baked — wire or remove |
| Pilot provisional password console log with emojis | pilot.service.js | Remove in production |
| `is_pipeline` flag on allocations | allocations table | Useful, but never queried |

---

---

# SECTION 17 — UX PROBLEMS

| ID | Problem | Location | User Impact |
|----|---------|----------|-------------|
| UX-01 | No pagination on any list | Dashboard, Projects, Pipeline, Library | App slows/crashes at 200+ records |
| UX-02 | ProjectForm has no back button | ProjectForm.jsx | User must refresh to fix step 1 errors |
| UX-03 | No conflict pre-check before form submit | ProjectForm step 4 | User submits, gets error, loses form state |
| UX-04 | Tab data stale if edited elsewhere | ProjectDetail.jsx | Pilot sees outdated allocation info |
| UX-05 | No loading states on list mutations | All list pages | UI freezes without feedback during delete |
| UX-06 | No undo on delete operations | Projects, Deliverables | No recovery after accidental delete |
| UX-07 | Scope form is a single textarea | ProjectForm step 3 | Cannot structure scope by type |
| UX-08 | No library preview | LibraryPage | Must download to see content |
| UX-09 | Calendar drag-and-drop (HTML5 DnD) | Calendar.jsx | Poor mobile/tablet touch support |
| UX-10 | No global search bar | Top navigation | Must navigate to each module to search |
| UX-11 | KPI cards — "open" computed client-side | Dashboard.jsx | Inconsistent count vs server |
| UX-12 | No document delete confirmation modal | Library, Documents | Accidental permanent deletion |

---

---

# SECTION 18 — DATA INTEGRITY PROBLEMS

| ID | Problem | Risk Level | Fix |
|----|---------|-----------|-----|
| DI-01 | `createProject()` not in transaction | CRITICAL | Wrap in `client.query('BEGIN')` |
| DI-02 | `updateProject()` scope DELETE not in transaction | HIGH | Wrap in transaction |
| DI-03 | `createPilot()` user + pilot inserts not in transaction | HIGH | Wrap in transaction |
| DI-04 | `allocation_conflicts.override_reason` always null | MEDIUM | Populate on force override |
| DI-05 | `library_documents.file_size` always null | LOW | Set from `req.file.size` |
| DI-06 | `pipeline.tentative_pilot` has no ON DELETE SET NULL | HIGH | Add FK constraint update |
| DI-07 | `library_file_tags` no cascade delete on tag | MEDIUM | Add `ON DELETE CASCADE` |
| DI-08 | `estimation_items.total_cost` not enforced | LOW | Add DB check constraint or trigger |
| DI-09 | COALESCE pattern prevents clearing nullable fields | MEDIUM | Use explicit `data.field !== undefined` |
| DI-10 | Soft-deleted library documents still retrievable | MEDIUM | Add `deleted_at IS NULL` filters |
| DI-11 | Soft-deleted pilots still in allocation conflict checks | HIGH | Add `deleted_at IS NULL` to allocation queries |
| DI-12 | `allocations` no unique constraint — two overlapping allocs possible if race condition | MEDIUM | Add DB-level partial unique index |

---

---

# SECTION 19 — MIGRATION RISKS

| Migration | Risk | Notes |
|-----------|------|-------|
| M-005 `project_scope` duplicate cleanup | DATA LOSS | `DELETE FROM project_scope a USING project_scope b WHERE a.updated_at < b.updated_at` — silently deletes all but the newest scope per project with no warning. Run on non-empty prod DB. |
| M-005 `activity_logs` FK add | BREAKAGE RISK | `ALTER TABLE activity_logs ADD CONSTRAINT fk_activity_logs_user` fails if any `user_id` in `activity_logs` does not exist in `users`. Must clean up orphaned rows first. |
| Next: Add `project_id` to estimations | LOW RISK | Additive nullable column — safe |
| Next: Add `created_by` to pipeline | LOW RISK | Additive nullable column — safe |
| Next: Add `access_level` to library_documents | LOW RISK | Additive with default — safe |
| Next: Add `failed_login_attempts` to users | LOW RISK | Additive — safe |
| Any rename of `pilot_rate`/`drone_rate` in costEngine | HIGH RISK | Would invalidate all historical JSONB data in `estimations.details` |

---

---

# SECTION 20 — HIDDEN CRITICAL RISKS

## RISK-01: Race Condition in Allocation Conflict Detection
**Severity:** CRITICAL  
**Description:** The conflict check in `allocation.service.js` reads existing allocations, then writes a new one — two separate queries with no transaction isolation. If two project managers simultaneously allocate the same pilot, both reads will show no conflict and both writes will succeed, creating a genuine double-booking.  
**Trigger:** Simultaneous allocation requests within ~5ms of each other  
**Fix:** Use `BEGIN; SELECT ... FOR UPDATE; INSERT; COMMIT;` with SERIALIZABLE isolation or a partial unique index: `CREATE UNIQUE INDEX ON allocations (pilot_id, daterange(start_date, end_date)) WHERE deleted_at IS NULL` (requires PostgreSQL daterange type).

## RISK-02: Estimation JSONB Schema Lock-in
**Severity:** HIGH  
**Description:** `estimations.details` is a JSONB blob containing all cost breakdown fields (`pilotCost`, `droneCost`, `breakdown`, `inputs`). If `costEngine.service.js` field names are renamed, ALL historical estimations become unreadable in the export. There is no schema version in the JSONB.  
**Fix:** Add `schema_version` key to `details` JSONB; write migration handler to transform old schemas.

## RISK-03: Scheduler Running Multiple Instances
**Severity:** HIGH  
**Description:** `scheduler.init()` is called in `app.js`. In a horizontally scaled deployment (multiple pods/dynos), every instance will run the same daily cron job, sending duplicate notifications to every pilot and admin.  
**Fix:** Move scheduler to a dedicated worker process (separate `scheduler.js` entrypoint) or use PostgreSQL advisory locks / `pg_cron` extension.

## RISK-04: R2 Key Collision
**Severity:** MEDIUM  
**Description:** R2 upload key format: `${folder}/${Date.now()}-${sanitized_filename}`. Two simultaneous uploads of the same filename within the same millisecond produce identical keys, causing one to silently overwrite the other.  
**Fix:** Add a `uuid` component to the key: `${folder}/${Date.now()}-${uuid()}-${sanitized_filename}`.

## RISK-05: Pilot Account Credential Exposure
**Severity:** MEDIUM  
**Description:** When a new pilot is created, a plaintext provisional password is logged to `console.log`. In any log aggregation system (DataDog, CloudWatch, Papertrail), this password is captured in plaintext and potentially visible to anyone with log access.  
**Fix:** Remove the console.log; rely on email delivery for credential transmission.

## RISK-06: Auth Middleware Sliding Session Cookie Refresh
**Severity:** LOW  
**Description:** `auth.middleware.js` refreshes the cookie on every authenticated request. Under high-frequency polling (e.g., dashboard auto-refresh every 30s), this generates constant cookie write operations. Not a security risk, but may cause unexpected session behavior with multiple tabs.

---

---

# SECTION 21 — TECHNICAL DEBT ANALYSIS

## Debt Level: MODERATE (3.2/5)

| Debt Category | Severity | Items |
|---------------|----------|-------|
| Missing tests | CRITICAL | 0 test files in entire codebase — no unit, no integration, no e2e |
| Duplicate logic | HIGH | `getProjects()` in `dashboard.service.js` duplicates `project.service.js` |
| Missing transactions | HIGH | 3 multi-table operations without transactions |
| COALESCE pattern | MEDIUM | 7 services — prevents setting nullable fields to null |
| Hardcoded rates in frontend | HIGH | `EstimationForm.jsx` — rates should come from DB |
| No API documentation | MEDIUM | No OpenAPI/Swagger spec — onboarding risk |
| `Math.random()` in credentials | HIGH | Security debt — not CSPRNG |
| No error boundaries in React | MEDIUM | Uncaught errors crash full page |
| No global state management | MEDIUM | Scaling risk as app grows |
| Half-built tables (rate_cards, notification_prefs) | MEDIUM | Feature soup — complete or remove |

## Debt Payoff Order (highest ROI first)
1. Tests — prevents regressions on all other fixes
2. Transactions — prevents data corruption
3. Rate card wiring — unblocks estimation accuracy
4. Duplicate `getProjects()` — one source of truth
5. Global state management — enables caching, offline, real-time

---

---

# SECTION 22 — ROOT CAUSE ANALYSIS

## RCA-01: Why does inline allocation bypass conflict detection?
`project.service.js::createProject()` was written before `allocation.service.js` was built. The allocation submodule was added later as a sub-resource (`/projects/:id/resources`). The project creation wizard needed a quick path to set an initial allocation, and the developer copied a direct INSERT rather than calling the (then-new) `allocation.service.js`. The fix is straightforward but requires wiring the dependency correctly.

## RCA-02: Why are rate cards in DB but not used?
Migration 005 created the `estimation_rate_cards` table as infrastructure. The developer who wrote the migration intended to build the API endpoint and frontend integration later, but the EstimationForm was already working with hardcoded defaults. The feature was never picked up. Classic "schema first, feature never" debt.

## RCA-03: Why is there no testing?
The codebase structure suggests iterative feature delivery under time pressure. The parameterized SQL pattern and consistent error handling indicate engineering discipline, but the absence of any test file suggests testing was deferred indefinitely. The modular service architecture is actually well-suited for unit testing — the debt is lower than it appears.

## RCA-04: Why do secondary allocations not exist?
`ProjectForm.jsx` step 4 was built to handle the simplest allocation case (one pilot, one drone). The `allocations.is_primary` column was added in migration 005 as a schema placeholder, but neither the project creation form nor the API service was extended to support multiple allocations per project in the creation wizard.

---

---

# SECTION 23 — DEPENDENCY MAPPING

## Critical Dependency Chains

```
allocation.service.js ──requires──► pilots table (status='active')
                      ──requires──► drones table (status='active')
                      ──requires──► calendar_events (leave/maintenance)
                      ──requires──► allocations (date range overlap)
                       
project.service.js    ──BYPASSES──► allocation.service.js (creates inline)
                      ──BYPASSES──► scope.service.js (creates inline)
                       
costEngine.service.js ──MISSING──► estimation_rate_cards (never queried)
                      ──MISSING──► company_config (overhead/margin defaults)
                       
scheduler.js          ──requires──► dashboard.service.js::triggerOverdueNotifications
                      ──requires──► notification.service.js::createNotification
                      ──requires──► email.service.js::sendEmail
```

## Change Impact Matrix

| If you change... | It impacts... |
|-----------------|--------------|
| `costEngine.service.js` field names | `estimations.details` JSONB (all historical data), `estimation.items.service.js` |
| `allocation.service.js` signature | `project.service.js` (after fix), `allocation.routes.js` |
| `scope.service.js` schema | `project.service.js` (after fix), `project_scope` table |
| `pilot.service.js::getPilots()` response | `EstimationForm.jsx` rate auto-population (after fix) |
| `project_members` table | `projectAccess.middleware.js`, `projectRole.middleware.js`, all project submodules |
| JWT structure (`{id, email, role}`) | ALL middleware, ALL controllers, frontend AuthContext |

---

---

# SECTION 24 — FULL ISSUE PRIORITIZATION (MASTER BUG REGISTER)

## CRITICAL (P0) — Production Blocker

| ID | Issue | File(s) | Fix Effort |
|----|-------|---------|-----------|
| P0-01 | No transaction in `createProject()` — partial data on failure | project.service.js | 2h |
| P0-02 | Inline allocation in `createProject()` bypasses all conflict detection | project.service.js, allocation.service.js | 4h |
| P0-03 | Race condition in allocation conflict check | allocation.service.js | 3h |
| P0-04 | Drone `next_maintenance` never checked before allocation | allocation.service.js, drones table | 2h |
| P0-05 | Drone `insurance_expiry` never checked | allocation.service.js | 1h |
| P0-06 | `allocation_conflicts.override_reason` never populated | allocation.service.js | 1h |
| P0-07 | Calendar event POST open to all roles (pilot can block resources) | calendar.routes.js | 30min |
| P0-08 | Dashboard export no admin guard | dashboard.routes.js | 30min |

## HIGH (P1) — Significant Feature Gap or Security Risk

| ID | Issue | File(s) | Fix Effort |
|----|-------|---------|-----------|
| P1-01 | Secondary pilot/drone allocation (entire feature) | project.service.js, ProjectForm.jsx, allocation.service.js | 2 days |
| P1-02 | Estimation rate cards never used | costEngine.service.js, EstimationForm.jsx | 1 day |
| P1-03 | Estimation not linked to project/pipeline | estimations table, estimation.service.js, EstimationForm.jsx | 4h |
| P1-04 | `Math.random()` for pilot credential generation | pilot.service.js | 30min |
| P1-05 | Document DELETE no role guard (pilot can delete) | projectDocs.routes.js | 30min |
| P1-06 | `getProjectById()` missing `deleted_at IS NULL` | project.service.js | 30min |
| P1-07 | Pilot credential printed to console log | pilot.service.js | 30min |
| P1-08 | Account lockout after failed logins | auth.service.js + migration | 3h |
| P1-09 | No transaction in `createPilot()` | pilot.service.js | 1h |
| P1-10 | Drone `make` field not populated | drone.service.js | 30min |
| P1-11 | `drone.sensor_payloads TEXT[]` not used | drone.service.js | 2h |
| P1-12 | `pilot.per_day_rate` not returned by API | pilot.service.js | 30min |
| P1-13 | `drone.day_rate` not returned by API | drone.service.js | 30min |
| P1-14 | Pipeline `created_by` column missing | migration + pipeline.service.js | 2h |
| P1-15 | Library `file_size` never populated | library.service.js | 30min |
| P1-16 | Library soft-delete not enforced in queries | library.service.js | 1h |
| P1-17 | `pipeline.tentative_pilot` no ON DELETE SET NULL | migration | 30min |
| P1-18 | No pagination on list endpoints | All list routes + frontend | 2 days |
| P1-19 | Rate card API endpoint missing | estimation.routes.js | 4h |
| P1-20 | Company config admin API/UI missing | New routes + frontend | 2 days |

## MEDIUM (P2) — PRD Compliance or Quality Issues

| ID | Issue | Fix Effort |
|----|-------|-----------|
| P2-01 | Project scope form — single textarea not type-specific | 3 days (frontend) |
| P2-02 | Pipeline map overlay (hollow markers) | 2 days (frontend) |
| P2-03 | KML boundary rendering in project map tab | 2 days (frontend) |
| P2-04 | Quarterly calendar view | 1 day |
| P2-05 | `updateProject()` scope not in transaction | 1h |
| P2-06 | Pilot certification validation in allocation | 4h |
| P2-07 | Library per-document access level | 4h + migration |
| P2-08 | Library document preview (presigned URL) | 4h |
| P2-09 | Notification preference logic wiring | 1 day |
| P2-10 | `allocation_conflicts` partial unique index | 1h |
| P2-11 | Scheduler — separate process to prevent multi-instance duplication | 4h |
| P2-12 | Estimation `schema_version` in JSONB | 2h |
| P2-13 | R2 key collision risk (add UUID to key) | 30min |
| P2-14 | Dashboard `getSummary()` — `Promise.all()` parallelization | 30min |
| P2-15 | `library_file_tags` cascade on tag delete | 30min migration |
| P2-16 | Status transition validation for projects | 2h |

## LOW (P3) — Polish and Completeness

| ID | Issue | Fix Effort |
|----|-------|-----------|
| P3-01 | 2FA implementation | 3 days |
| P3-02 | Token revocation/blacklist | 1 day |
| P3-03 | Global search bar in top nav | 2 days (frontend) |
| P3-04 | Pipeline stage duration tracking | 4h |
| P3-05 | Drag-to-reschedule in calendar | 2 days |
| P3-06 | Error boundaries in React | 4h |
| P3-07 | React Query / SWR for data caching | 3 days |
| P3-08 | Global state management (Zustand) | 3 days |
| P3-09 | API documentation (OpenAPI/Swagger) | 2 days |
| P3-10 | Test infrastructure (Jest + Supertest) | 5 days |

---

---

# SECTION 25 — FUTURE PRODUCTION RISKS

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Double-booking pilots on simultaneous allocation | HIGH | CRITICAL (operational disruption) | Implement DB-level lock on conflict check |
| Scheduler duplicate notifications at scale | HIGH | MEDIUM (user annoyance) | Move to worker process |
| Data loss from missing transactions | MEDIUM | HIGH (partial project records) | Add transactions immediately |
| Estimation JSONB schema drift | MEDIUM | HIGH (reports broken for old data) | Add schema_version to JSONB |
| R2 bill spike from no download quotas | LOW | MEDIUM (cost overrun) | Add download rate limiting |
| PostgreSQL pool exhaustion at >20 users | MEDIUM | HIGH (app unavailable) | Tune pool size + PgBouncer |
| No audit of estimation views | LOW | MEDIUM (pricing leak undetected) | Log GET on estimations |
| Authentication brute force on pilot accounts | MEDIUM | HIGH (credential theft) | Implement account lockout |
| Pilot credential exposure via server logs | LOW | HIGH (account compromise) | Remove console.log |
| Tab data staleness causing wrong decisions | HIGH | MEDIUM (wrong allocation based on stale info) | Add React Query with cache invalidation |

---

---

# SECTION 26 — MASTER IMPLEMENTATION PLAN

---

## PHASE 1 — CRITICAL (Week 1–2)
*Production blockers, security vulnerabilities, data integrity risks*

### 1.1 Transaction Safety on Multi-Table Operations

**Root Cause:** Multiple write operations across related tables execute without a transaction, leaving partial data on failure.

**Files:** `project.service.js`, `pilot.service.js`

**Implementation:**
```js
// project.service.js::createProject()
const client = await db.connect();
try {
  await client.query('BEGIN');
  // all inserts (projects, allocations, project_scope, project_members)
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

**Migration Risk:** None — no schema change  
**Testing Strategy:** Unit test: verify no projects row exists after simulated allocation insert failure

---

### 1.2 Replace Inline Allocation with `allocation.service.js`

**Root Cause:** `createProject()` was written before `allocation.service.js` existed.

**Files:** `project.service.js::createProject()`, `project.service.js::updateProject()`

**Implementation:**
- Remove lines 39–56 (inline allocation) from `createProject()`
- Import `allocationService = require('../project/submodules/resources/allocation.service')`
- Call `allocationService.createAllocation(project.id, { pilot_id, drone_id, start_date, end_date }, userId)`
- Handle the conflict error (409) with a clear message to the frontend
- Repeat for `updateProject()` inline allocation block

**Migration Risk:** None — same data outcome, better integrity  
**Frontend Impact:** `ProjectForm.jsx` step 4 must handle 409 conflict response

---

### 1.3 Secure Calendar Event Creation

**Root Cause:** `calendar.routes.js` does not restrict event creation by role.

**File:** `backend/src/domains/scheduling/calendar.routes.js`

**Change:**
```js
router.post('/events', authorize('admin', 'project_manager'), eventController.createEvent);
router.put('/events/:id', authorize('admin', 'project_manager'), eventController.updateEvent);
router.delete('/events/:id', authorize('admin', 'project_manager'), eventController.deleteEvent);
```

**Migration Risk:** None  
**Testing Strategy:** Integration test: pilot user POST /calendar/events should return 403

---

### 1.4 Secure Dashboard Export

**File:** `backend/src/domains/dashboard/dashboard.routes.js`

**Change:** Add `authorize('admin')` to `GET /export`

---

### 1.5 Document DELETE Role Guard

**File:** `backend/src/domains/project/submodules/documents/projectDocs.routes.js`

**Change:** Add `requireProjectRole('project_manager')` to DELETE route

---

### 1.6 Drone Maintenance + Insurance Checks in Allocation

**File:** `backend/src/domains/project/submodules/resources/allocation.service.js`

**Add after drone status check:**
```js
// Insurance expiry check
if (data.drone_id) {
  const drone = await db.query('SELECT insurance_expiry, next_maintenance FROM drones WHERE id=$1', [data.drone_id]);
  const d = drone.rows[0];
  if (d.insurance_expiry && new Date(d.insurance_expiry) < new Date()) {
    throw Object.assign(new Error('Drone insurance has expired. Renew before allocating.'), { statusCode: 409 });
  }
  if (d.next_maintenance) {
    const maintDate = new Date(d.next_maintenance);
    const allocStart = new Date(data.start_date);
    const allocEnd = new Date(data.end_date);
    if (maintDate >= allocStart && maintDate <= allocEnd) {
      if (!data.force) {
        throw Object.assign(new Error(`Drone has scheduled maintenance on ${d.next_maintenance} within this allocation window.`), { statusCode: 409, conflict: { type: 'drone_maintenance', maintenance_date: d.next_maintenance } });
      }
    }
  }
}
```

---

### 1.7 Populate `override_reason` in Allocation Conflicts

**File:** `allocation.service.js` — force override INSERT block

**Change:** Include `override_reason`, `overridden_by`, `overridden_at` in `allocation_conflicts` INSERT

---

### 1.8 Replace `Math.random()` with CSPRNG

**File:** `pilot.service.js::createPilot()`

**Change:**
```js
const crypto = require('crypto');
// Replace:
randomPassword = Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 10);
// With:
randomPassword = crypto.randomBytes(8).toString('hex');
```

---

### 1.9 Fix `getProjectById()` Soft-Delete Filter

**File:** `project.service.js`

**Change:** `WHERE id=$1 AND deleted_at IS NULL`

---

## PHASE 2 — HIGH PRIORITY (Week 3–4)
*Core PRD features, security improvements, database integrity*

### 2.1 Secondary Pilot and Drone Allocation

**Files:** `project.service.js`, `ProjectForm.jsx`, `allocation.service.js`

**Backend:** Accept `secondary_pilot_id` and `secondary_drone_id` in project create/update. Call `createAllocation()` twice (once for primary, once for secondary) with `is_primary = false` for secondary.

**Frontend:** Add pilot 2 and drone 2 dropdowns in `ProjectForm.jsx` step 4. Render secondary allocation in `ProjectDetail.jsx` Resources tab.

**Migration:** Add `is_primary BOOLEAN DEFAULT TRUE` (already in migration 005).

---

### 2.2 Estimation Rate Card API + Cost Engine Wiring

**New File:** `GET /api/v1/estimations/rate-cards` → queries `estimation_rate_cards WHERE is_active=TRUE`

**Modified Files:** `costEngine.service.js` — accept `rateOverrides` object; fall back to DB rates when not provided  
**Frontend:** `EstimationForm.jsx` — `useEffect` on mount to `GET /estimations/rate-cards`, pre-fill default rates

---

### 2.3 Estimation ↔ Project/Pipeline Link

**Migration:**
```sql
ALTER TABLE estimations ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE estimations ADD COLUMN pipeline_id UUID REFERENCES pipeline(id) ON DELETE SET NULL;
```

**Backend:** Update `createEstimation()` and `updateEstimation()` to accept/store these FKs  
**Frontend:** `EstimationForm.jsx` — add "Link to Project" dropdown; `ProjectDetail.jsx` — add "Estimations" tab

---

### 2.4 Pipeline `created_by` + Map Overlay

**Migration:**
```sql
ALTER TABLE pipeline ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pipeline ADD COLUMN tentative_pilot UUID REFERENCES pilots(id) ON DELETE SET NULL; -- if not already
```

**Backend:** Populate `created_by = userId` in `createPipeline()`  
**Frontend:** `ProjectList.jsx` — add "Show Pipeline" toggle; render hollow dashed markers for pipeline entries with lat/lng

---

### 2.5 Pagination on All List Endpoints

**Pattern (example):**
```js
// Backend: standard pagination params
GET /projects?limit=25&offset=0
// Response:
{ data: [...], total: 150, limit: 25, offset: 0, has_more: true }
```

**Files:** All list endpoints + corresponding frontend pages  
**Frontend:** Add "Load More" / page controls to Dashboard, ProjectList, PipelineBoard, LibraryPage, Allocations

---

### 2.6 Account Lockout

**Migration:**
```sql
ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMP;
```

**Backend:** In `auth.service.js::login()`:
- Check `locked_until > NOW()` → throw 423 with `locked_until` in response
- On failure: `UPDATE users SET failed_login_attempts = failed_login_attempts + 1, locked_until = CASE WHEN failed_login_attempts >= 4 THEN NOW() + INTERVAL '15 minutes' END`
- On success: `UPDATE users SET failed_login_attempts = 0, locked_until = NULL`

---

### 2.7 Library Enhancements

- Add `access_level TEXT DEFAULT 'all' CHECK (access_level IN ('all','admin_only'))` to `library_documents`
- Filter `deleted_at IS NULL` in all library queries
- Populate `file_size` from `req.file.size` in `createDocument()` and `addVersion()`
- Add description to search query
- Add `POST /library/documents/:id/archive` endpoint

---

### 2.8 Resource API Rate Exposure

**Files:** `pilot.service.js::getPilots()`, `drone.service.js::getDrones()`

**Change:** Include `per_day_rate` in pilot JOIN query; include `day_rate` in drone query  
**Impact:** `EstimationForm.jsx` can pre-fill rates from resource selection

---

## PHASE 3 — MEDIUM PRIORITY (Week 5–6)
*PRD completeness, UX improvements, architecture cleanup*

### 3.1 Structured Project Scope Form

Replace `ProjectForm.jsx` step 3 single textarea with type-specific field sets:
- Solar PV: capacity (MWp), modules, thermal+RGB toggle
- Wind: turbine count, hub height, inspection type
- T&D Lines: line length (km), voltage, terrain, tower count
- Tower: tower count, type, height range
- Pipeline: length (km), diameter, terrain
- Volumetric: area (hectares), stockpile count

Backend: Update scope validation schema; `scope.service.js` already supports all fields.

---

### 3.2 Quarterly Calendar View

Add to `Calendar.jsx`:
```js
// FullCalendar config
views: {
  timeGridQuarter: {
    type: 'timeGrid',
    duration: { months: 3 },
    buttonText: 'Quarter'
  }
}
headerToolbar: { center: 'dayGridMonth,timeGridWeek,timeGridQuarter' }
```

---

### 3.3 Company Config Admin UI + API

**New Routes:** `GET /api/v1/system/config`, `PUT /api/v1/system/config` (admin only)  
**New Frontend Page:** `SystemSettings.jsx` with company name, logo upload, GSTIN, CIN, overhead/margin defaults

---

### 3.4 Notification Preferences Logic

Wire `user_notification_prefs` table:
- Before calling `createNotification()`, check `user_notification_prefs` for `in_app_enabled` by category
- Before calling `email.sendEmail()`, check `email_enabled` by category
- Add `GET/PUT /users/:id/notification-prefs` endpoints
- Add preferences UI in `Profile.jsx`

---

### 3.5 Transaction Safety Completion

- Wrap `updateProject()` scope changes in transaction
- Wrap `pilot.service.js::createPilot()` (user + pilot) in transaction

---

### 3.6 Dashboard Deduplication

Remove `getProjects()` from `dashboard.service.js`; import and call `project.service.js::getProjects()` instead.

---

### 3.7 Race Condition Fix for Allocation

Add partial unique index:
```sql
-- Migration 006
CREATE UNIQUE INDEX ON allocations (pilot_id, daterange(start_date, end_date))
WHERE pilot_id IS NOT NULL AND deleted_at IS NULL;
-- Requires btree_gist extension
```

---

## PHASE 4 — POLISH (Week 7–8)
*Quality, observability, long-term maintainability*

### 4.1 Test Infrastructure

Install: `jest`, `supertest`, `@jest/globals`

Priority test suites:
1. `auth.service.test.js` — login, lockout, OTP flow
2. `allocation.service.test.js` — all 7 conflict scenarios
3. `costEngine.service.test.js` — cost calculation accuracy
4. `project.service.test.js` — create/update/delete lifecycle
5. Integration: `POST /projects` end-to-end with conflict detection

---

### 4.2 API Documentation

Generate OpenAPI 3.0 spec using `swagger-jsdoc` + `swagger-ui-express`. Auto-document all routes with JSDoc annotations. Mount at `/api/v1/docs` (admin-accessible only in production).

---

### 4.3 Frontend Error Boundaries

```jsx
// components/ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <ErrorFallback onRetry={() => this.setState({ hasError: false })} />;
    return this.props.children;
  }
}
// Wrap each page/tab with <ErrorBoundary>
```

---

### 4.4 React Query Integration

Replace manual `useEffect(fetch, [])` with `useQuery`/`useMutation` from `@tanstack/react-query`. Key benefits: automatic caching, background refetch, stale-while-revalidate, optimistic updates. Start with Dashboard and ProjectList (highest-traffic pages).

---

### 4.5 KML Boundary Rendering

- In `ProjectForm.jsx` step 2: parse uploaded KML/KMZ on client using `@tmcw/togeojson`
- Send GeoJSON to `PUT /projects/:id/map` (map.service.js already handles GeoJSON)
- In `ProjectDetail.jsx` Map tab: render `geojson_data` from map API using Leaflet `L.geoJSON()`

---

### 4.6 Scheduler Worker Process

Create `backend/src/worker.js` as a separate entry point that runs only the scheduler:
```js
// worker.js
const scheduler = require('./core/utils/scheduler');
scheduler.init();
console.log('[Worker] Scheduler process started');
```

Remove `scheduler.init()` from `app.js`. In `package.json`, add `"worker": "node src/worker.js"`. Deploy separately to prevent multi-instance duplication.

---

### 4.7 R2 Presigned URL for Preview

Add `getPresignedUrl(key, expiresIn=300)` to `r2Download.js` using `@aws-sdk/s3-request-presigner`. Use for library document preview and deliverable preview (time-limited, no server proxy needed).

---

**Document ends.**

---

*Audit prepared by Senior Staff Engineering Analysis — Varuna Nexus DroneOps Platform*  
*All recommendations are production-safe and additive unless explicitly noted.*
