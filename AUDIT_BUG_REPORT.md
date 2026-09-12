# Varuna Ops / Niyamak — Full Audit Bug Report

**Generated:** 2026-06-30
**Scope:** Full read-only codebase audit (24-phase review, 10 modules, ~95 files read line-by-line, all 50 migrations surveyed).
**Status:** No files modified. Findings only. Every severity claim verified against source or explicit grep.

**Severity legend:** 🔴 HIGH (security / data integrity) · 🟠 MEDIUM (correctness / access / DoS / money) · 🟢 LOW / Informational

**Total findings: 51** (7 High · 21 Medium · 23 Low/Info)

---

## 🔴 HIGH — fix first

### H-1 · Password-reset OTP is brute-forceable
- **Location:** `backend/src/app.js:103-104` (limiter only on `/login` + `/forgot-password`); `backend/src/domains/user/password.service.js` `resetPassword`
- **Root cause:** `/api/v1/auth/reset-password` has no rate limit and no per-OTP attempt counter; OTP is a 6-digit number (10⁶ space) valid 1 hour.
- **Impact:** Attacker who knows a target email can script unlimited guesses → account takeover, bypassing 2FA (reset doesn't require it).
- **Fix:** Rate-limit `/reset-password`; add attempt counter on the token row (lock after ~5); raise code entropy.
- **Difficulty:** Low

### H-2 · OTP generated with `Math.random()` (not CSPRNG)
- **Location:** `backend/src/domains/user/password.service.js:68` (`crypto` imported at line 1 but unused)
- **Root cause:** Non-cryptographic RNG for a security token; predictable.
- **Impact:** Compounds H-1.
- **Fix:** `crypto.randomInt(100000, 1000000)`.
- **Difficulty:** Trivial

### H-3 · Account-lockout schema exists but is never enforced
- **Location:** `backend/src/domains/user/auth.service.js` `login` vs migration `007_account_lockout.sql` (columns `failed_login_attempts`, `locked_until` referenced only in `backend/unlock.js`)
- **Root cause:** Login path never reads/increments/resets the lockout columns; only protection is the IP rate-limit.
- **Impact:** Per-account brute force across rotating IPs is unthrottled; the lockout is dead.
- **Fix:** In `login()`: check `locked_until`, increment on failure, reset on success.
- **Difficulty:** Low

### H-4 · Stale JWT — revocation / role changes lag up to 8h
- **Location:** `backend/src/core/middleware/auth.middleware.js:39-40`; `backend/src/core/socket/socket.auth.js:34-35`
- **Root cause:** Stateless JWT (role baked in at login), 8h lifetime, no DB re-check of existence/active/role; password reset/change don't invalidate sessions.
- **Impact:** Soft-deleted user keeps full API + socket access ≤8h; demoted admin keeps admin ≤8h; reset doesn't kick existing sessions.
- **Fix:** Add `token_version`/`session_invalidated_at` on users, verify in `authenticate`; or cached DB lookup of role/deleted_at.
- **Difficulty:** Medium

### PR-1 · Invoices writable/deletable by any project member (incl. pilots)
- **Location:** `backend/src/domains/project/submodules/invoices/invoice.routes.js` (no `requireProjectRole`); parent mount `project.routes.js:52` adds only `requireProjectAccess`
- **Root cause:** Missing role middleware on the only financial submodule (all others gate writes to `project_manager`).
- **Impact:** A pilot member can create/edit/delete invoices and trigger OCR. Financial records mutable by least-privileged role.
- **Fix:** Add `requireProjectRole('project_manager')` to POST/PUT/DELETE/extract (mirror `expense.routes.js`).
- **Difficulty:** Trivial

### PR-2 · `bulkUpdateStatus` bypasses membership AND forward-only transitions
- **Location:** `backend/src/domains/project/project.routes.js:30`; `project.service.js:432-471`
- **Root cause:** Global `authorize('admin','project_manager')` with no `requireProjectRole`; service sets status directly with no `ALLOWED_TRANSITIONS` check.
- **Impact:** Any PM can change status on projects they aren't a member of, and skip lifecycle stages.
- **Fix:** Filter target IDs to PM's projects (or admin-only); enforce transitions per row.
- **Difficulty:** Medium

### UP-1 · Chunked upload bypasses project access control
- **Location:** `backend/src/domains/upload/upload.routes.js` (only `authenticate`); `upload.service.js` (`initiateUpload`/`completeUpload` guard by owner, not project membership)
- **Root cause:** No project-access check; `_markEntityUploaded` inserts `project_documents`/`deliverables` for any `projectId`.
- **Impact:** Any authenticated user can upload docs/deliverables into a project they aren't a member of, bypassing `requireProjectRole`.
- **Fix:** Verify project access in initiate/complete for `document`/`deliverable` entity types.
- **Difficulty:** Medium

---

## 🟠 MEDIUM — fix next

### SA-1 · Public, unauthenticated SuperAdmin metrics behind a hardcoded unsalted hash
- **Location:** `backend/src/domains/system/system.routes.js:13` (mounted before `authenticate`); `superadmin.controller.js:11,19`
- **Root cause:** No JWT; only gate is an unsalted SHA-256 committed in source; no rate limit.
- **Impact:** Discloses DB/table/R2/Redis/server (hostname/CPU/mem/OS) intel to anyone with the secret; static secret is offline-crackable from the committed hash and online-brute-forceable.
- **Fix:** Require admin JWT; move secret to env; add rate limiting.

### NQ-1 · Overdue-drone maintenance email spam *(originally reported issue)*
- **Location:** `backend/src/core/utils/scheduler.js:57` (query lacks lower bound); email path `emailTriggers.onDroneMaintenanceDue` has no dedupe
- **Root cause:** `next_maintenance <= NOW()+7d` with no `>= CURRENT_DATE` lower bound → past-due drones re-match every run; in-app has `dedupeHours:24`, email does not.
- **Impact:** Same overdue drone emails daily forever until `next_maintenance` is advanced.
- **Fix:** Apply the predicate already used at `dashboard.service.js:531` (`next_maintenance >= CURRENT_DATE`) + add email dedupe.

### EST-1 / EST-2 · Cost-engine FE/BE default mismatch + server not authoritative
- **Location:** `backend/src/domains/estimation/costEngine.service.js:146,150` (margin/tax default 0) vs `frontend/src/utils/costEngine.js:161,165` (margin 10 / tax 18); `deriveTypeDefaults` FE-only
- **Root cause:** Duplicated engines disagree on defaults; server recomputes (`estimation.controller.js:51,79`) but depends on client-applied derivations.
- **Impact:** When fields omitted, stored total ≠ previewed total on the core quote math; server computes days=0 without client-derived values.
- **Fix:** Single source of truth for defaults (pull from `company_config` both sides); port `deriveTypeDefaults` server-side.

### PL-1 · `convertToProject` double-conversion race
- **Location:** `backend/src/domains/pipeline/conversion.service.js:9-28` (check outside transaction/lock)
- **Impact:** Two concurrent convert calls (double-click) → two projects, two calendar markers, double allocation from one lead.
- **Fix:** Re-check inside the txn with `SELECT … FOR UPDATE` or advisory lock on the pipeline id.

### PL-2 · Required phone blocks editing existing pipeline leads
- **Location:** `backend/src/domains/pipeline/pipeline.validation.js:55` (`contact_number: requiredPhone` on update)
- **Impact:** Editing any field on a legacy/partial lead fails until a valid E.164 phone is supplied.
- **Fix:** Make phone optional on update (required only on create).

### PR-3 / PR-4 · Project update unvalidated; `post_processing` missing from Joi enum
- **Location:** `backend/src/domains/project/project.routes.js:36` (no `validate`); `project.validation.js:10,40` (enum omits `post_processing`)
- **Impact:** Unvalidated input reaches the service; fixing validation later would block the `executed→post_processing` transition.
- **Fix:** Wire `validate(updateProjectSchema)` and add `post_processing` to both enums together.

### PR-5 · Orphaned R2 object on failed project completion
- **Location:** `backend/src/domains/project/project.controller.js:60` (uploads invoice before status check)
- **Impact:** Wrong-status completion (422) leaves an uploaded object with no DB reference and no cleanup.
- **Fix:** Validate status before upload, or delete the object on failure.

### PR-6 · Silent allocation failure on project update
- **Location:** `backend/src/domains/project/project.service.js:237-239,253-255`
- **Impact:** Allocation conflict caught as "non-fatal"; update returns 200 while pilot/drone assignment silently didn't apply.
- **Fix:** Surface a partial-success warning to the client.

### PR-7 · OCR / Python spawn exposed to any member, no rate limit
- **Location:** `backend/src/domains/project/submodules/invoices/invoice.service.js` `runPythonExtract`; route `/extract`
- **Impact:** With PR-1, any member can trigger repeated heavy OCR (tesseract, 90s) → CPU/memory DoS; undocumented Python prod dependency.
- **Fix:** PM-gate (PR-1) + rate-limit `/extract`; document the Python runtime.

### RS-1 · Conflict count disagrees across screens
- **Location:** `backend/src/domains/resource/allocations.service.js:48-49,108-109` (stored `allocation_conflicts`) vs `scheduling/conflict.service.js` (live compute)
- **Impact:** Resources overview shows a different conflict count than Calendar/Dashboard; live double-bookings can show 0.
- **Fix:** Drive both from the live computation.

### RS-2 / M-4 · Credentials emailed in plaintext
- **Location:** `backend/src/domains/resource/pilot.service.js:85-102` (+ `provisional_password` in response `:107`); `auth.controller.js:60-62` (welcome email)
- **Impact:** Passwords sit permanently in inboxes/mail logs.
- **Fix:** Send an invite/set-password link instead of the password.

### UP-2 · KMZ zip-bomb (no decompressed-size cap)
- **Location:** `backend/src/core/utils/kmlProcessor.js:46-51` (`zlib.inflateRaw` with no size limit)
- **Impact:** Small malicious KMZ expands to GBs → memory DoS (PM-gated path).
- **Fix:** Cap inflated bytes; consider a maintained unzip lib.

### DB-1 · Mixed `TIMESTAMP` vs `TIMESTAMPTZ`
- **Location:** `001_initial_schema.sql` (TIMESTAMP) vs `007/013/036` (TIMESTAMPTZ); `db.js` only sets a DATE parser
- **Impact:** `created_at`/`updated_at` can render hours off for IST; comparisons can shift across the date boundary.
- **Fix:** Standardize on `TIMESTAMPTZ` via one migration.

### DB-2 · Migration baseline foot-gun on partial schema
- **Location:** `backend/src/core/config/migrate.js:42-57`
- **Impact:** If `schema_migrations` empty but `users` exists (partial restore), all migrations are marked applied without running → permanently missing schema.
- **Fix:** Baseline only on an explicit flag/env or a late-migration sentinel object.

### DASH-2 · `getReminders` heavy fan-out + O(n²) self-join, no cache
- **Location:** `backend/src/domains/dashboard/dashboard.service.js:436-618` (15 parallel queries incl. over-scheduled self-join `:576`)
- **Impact:** Heaviest read path; degrades as data grows.
- **Fix:** Short-TTL cache or materialized summary.

### PR-8 · Expense delete blocks non-adder PMs
- **Location:** `backend/src/domains/project/submodules/expenses/expense.service.js:92-101`
- **Impact:** A `project_manager` can't delete expenses they didn't add unless they're a global admin; contradicts route intent.
- **Fix:** Decide whether PMs manage all project expenses; verify `isAdmin` derivation in controller.

### M-5 · `updateUser` no role whitelist → privilege escalation
- **Location:** `backend/src/domains/user/user.service.js:34-40` (`role = COALESCE($2, role)`)
- **Impact:** An admin can set a user's role to `super_admin` or an invalid string (locks them out of all checks).
- **Fix:** Validate role against allowed set; forbid escalation to `super_admin` via this path.

### FE-1 · Duplicate `/auth/profile` probe on every load
- **Location:** `frontend/src/context/ThemeContext.jsx:84` (independent probe) + `AuthContext.initAuth`; providers ordered so ThemeProvider is outside AuthProvider (`App.jsx:17-21`)
- **Impact:** 2–3× the profile request per load (mount + post-login).
- **Fix:** Have ThemeContext read the user AuthContext already fetched (reorder providers / share theme).

### FE-2 · `StrictMode` removed (masks effect bugs)
- **Location:** `frontend/src/main.jsx:5-8`
- **Impact:** Hides missing-cleanup/duplicate-subscribe bugs (e.g. FE-1).
- **Fix:** Restore StrictMode and fix the effects it exposes.

### EST-3 / SYS-1 · Margins/overhead readable by non-admins
- **Location:** `backend/src/domains/estimation/estimation.routes.js:11` (`/rate-cards` before admin gate); `system.routes.js:17` (`GET /config`)
- **Impact:** A pilot can read company margin/overhead defaults despite estimations being admin-only.
- **Fix:** Strip cost fields for non-admins, or gate the endpoints.

---

## 🟢 LOW / Informational

### Auth / session
- **M-1** `remember_me=false` silently upgraded to a persistent cookie on next request — `auth.middleware.js:43-45`.
- **M-2** "Sliding session" refreshes cookie maxAge but not JWT exp — session still hard-dies at 8h (cosmetic) — `auth.middleware.js:44`.
- **M-3** User enumeration: login timing side-channel (`auth.service.js:68-79`) + forgot-password "not registered" message while `NEUTRAL_MESSAGE` is unused (`password.service.js:7,50-56`).
- **M-6** Client-side SuperAdmin unlock backdoor (hardcoded SHA-256) — `frontend/src/pages/auth/Login.jsx:38-45` (real gate is server secret SA-1).
- **M-7** Email case mismatch: forgot uses `LOWER(email)`, reset uses raw `email` — `password.service.js:49` vs `:132`.
- **L-1** Inconsistent password policy: register requires complexity; change/reset only length ≥ 8.
- **L-2** Mixed validation styles (hand-rolled `auth.validation` vs Joi).
- **L-3** Client role spoofable in localStorage; `RoleRoute.jsx:12` trusts it (backend is the real gate).
- **L-4** `super_admin`→`admin` mapping safe today — no route uses `authorize('super_admin')`.
- **L-5** `ROLES` constant omits `super_admin`/`client` though both referenced.
- **L-6** `cookie.js:13` doc says "Render provides it" — prod is EC2.
- **L-7** `env.js` validates JWT_SECRET presence but not strength/length.
- **L-8** 2FA: no backup codes; no throttle on `/2fa/enable|disable` code attempts.

### Database
- **DB-3** No partial indexes for the heavily-filtered `deleted_at IS NULL`.
- **DB-4** `database/runMigration.js` reads a non-sequence file (`create_project_expenses.sql`) — dead/broken script.
- **DB-5** Hardcoded personal email in `047_super_admin_role.sql:7` (promotes a specific account to super_admin on every run).
- **DB-6** Dead columns: `users.two_factor_backup_codes` (never used); `allocation_conflicts` table partly superseded by live computation.
- **DB-7** `activity_logs` / `notifications` have no retention/pruning — unbounded growth.
- **DB-8** Historical schema drift (`036_reconcile_schema_drift`, `012` "never ran on fresh DB", `003` mislabeled "002") — contained but fresh-DB parity unproven.

### Projects / Pipeline
- **PR-9** Overlap semantics inconsistent: allocation overlap exclusive (`allocation.service.js:67`) vs calendar-event inclusive (`:80`) → edge-of-day off-by-one.
- **PR-10** Drone maintenance calendar conflict is a hard throw (can't force) unlike insurance/license — `allocation.service.js:155`.
- **PR-11** `member.service.addMember/updateMember` don't validate `role` against CHECK set (DB 500 on bad value); project-level `'admin'` role is dead/confusing.
- **PR-12** Invoice amounts/fields unvalidated (no schema).
- **PR-13** Some project-existence checks omit `deleted_at IS NULL` (`member.service`, `expense.service`).
- **PL-3** `stage` accepted by `updatePipelineSchema:44` but silently ignored on `PUT /:id`.
- **PL-4** `listDocuments` has GET side-effects (`ensureDefaultsExist` inserts on read).
- **PL-5** `getPipelineHistory` approximates outcome time with `COALESCE(updated_at, created_at)`.

### Resources / Scheduling
- **RS-3** Stale `'lost'` stage in live queries — `conflict.service.js:51`, `calendar.service.js:37` (harmless dead clause).
- **RS-4** `updatePilot` unvalidated (bad status → DB 500; can set inactive while allocated).
- **RS-5** `getAvailability` ignores training/maintenance events (only leave) — disagrees with allocation guard.
- **RS-6** Open read access to all resource schedules/history (`/resources/allocations`, `/pilots|drones/:id/history` only `authenticate`).

### Uploads / Estimation / Notifications / Audit / Frontend
- **UP-3** `uploadAny` accepts any file type — ensure downloads served `Content-Disposition: attachment` (verify `r2Download.js`).
- **UP-5** Entire upload layer on `multer@1.x` (known advisories; 2.x maintained).
- **NQ-2** `getNotifications` unbounded (no pagination/limit).
- **NQ-3** Notification category inference is brittle (title keyword match).
- **NQ-4** Workers run in-process in prod (compete with API event loop); standalone `worker.js` unused.
- **NQ-5** Synchronous email fan-out in degraded (no-Redis) mode blocks the triggering request.
- **AUD-1** `audit.getLogs` `::jsonb` cast on legacy non-JSON text could throw (low — all writes use JSON.stringify).
- **EST-4** Dead code: `getEstimations` non-admin branch (route is admin-only); unused queue imports in estimation controller.
- **EST-5** `cloneEstimation` drops `pipeline_id`.
- **EST-6** No input validation on estimation create/update (admin-only).
- **FE-3** ErrorBoundary "Try Again" re-renders the same failing tree; renders raw `error.message`.
- **FE-4** UI-only restrictions (Calendar/Allocations) map to backend routes that are only `authenticate`-gated.
- **FE-5** `xlsx@0.18.5` on the client (proto-pollution/ReDoS CVE) — verify it never parses untrusted `.xlsx`.
- **M-8** Stale enum constants: `constants.PIPELINE_STAGE` / `EVENT_TYPES` don't match live values (dead, not breaking).

---

## Dismissed (checked, not bugs)
- **Calendar event-type CHECK** — migration `025_database_recovery` widened it to include `meeting/deadline/other`; `calendar.validation.js:7` matches. No bug.
- **KML XXE** — `@xmldom/xmldom` doesn't resolve external entities; not exploitable.
- **Stale `PIPELINE_STAGE` runtime break** — `pipeline.service` hardcodes its own vocabulary; the constant is dead, not a breaker.

---

## Recommended fix sequence
1. **Security quick wins (hours):** PR-1, H-2, H-1, SA-1, NQ-1, M-5
2. **Access-control (half-day):** UP-1, PR-2, EST-3/SYS-1
3. **Correctness (half-day):** PR-3/PR-4, PR-5, PR-6, EST-1/EST-2, PL-1, PL-2
4. **Session integrity (1 day):** H-3, H-4
5. **Perf/quality:** DASH-2, FE-1/FE-2, DB-1, RS-1
6. **Lows + dependency upgrades** (multer/xlsx/pdfjs), dead-code/constants cleanup

## Strengths worth preserving
- Parameterized SQL throughout (no SQL injection found); whitelisted dynamic `ORDER BY`.
- Mature migration runner (tracked, checksum-verified, transactional, halts on error).
- FK covering indexes (`044`), GIST overlap indexes (`012`), per-project uniqueness (`049`).
- Allocation conflict engine: advisory locks + transactions + soft/hard + force-override audit.
- Queue/Redis resilience: shared connection, enqueue timeout, full synchronous fallback when Redis down.
- Audit log bulk-resolve (no N+1); route-level code-splitting; hardened DB pool + graceful shutdown.
