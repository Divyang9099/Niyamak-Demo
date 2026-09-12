# Business Development (BD) Module — End-to-End Plan

**Status:** Planning only — no code written.
**Migration:** `058_business_development.sql`
**Access:** `admin` + `super_admin` only.
**Core principle:** **a self-contained module that lives inside Niyamak but shares no business data with it.**

---

## 0. The independence rule

This module is for **lead generation**. The dividing line is exact:

> **Reuse every piece of Niyamak's machinery. Share none of Niyamak's data.**

### 0.1 Machinery BD reuses — as-is, no forking

| Layer | What's reused | Notes |
|---|---|---|
| **Auth** | `auth.middleware.js` (`authenticate`), `role.middleware.js` (`authorize('admin')`), the existing JWT/session + cookie handling | Same login. See §0.3 — **no second login.** |
| **Frontend guards** | `PrivateRoute.jsx`, `RoleRoute.jsx` | Same session already in `AuthContext` |
| **HTTP client** | `api/axios.js` instance + its auth/refresh interceptors | BD's `bd.api.js` just imports it |
| **Mail transport** | `email.service.js` `sendEmail()` — the pooled Nodemailer transport, Gmail rate-limit tuning, "Niyamak" from-name | BD writes its own templates, borrows only the pipe |
| **Async send** | `emailQueue` + `email.worker` via the `addJob()` helper | Degrades to synchronous if Redis is down — already handled |
| **Timed jobs** | `node-cron` in `core/utils/scheduler.js` + the `scheduler_state` DB-lease (`_claimRun`) | Prevents double-fire across API + worker processes |
| **File storage** | `r2Upload.js` / `r2Download.js`, `upload.middleware.js` `uploadTiny` (multer, size + mime caps) | Client logos, same path as user avatars |
| **Exports** | `excelQueue` + `export.worker.js` | BD list/filter export |
| **API conventions** | `core/utils/response.js` (`success()` / `error()`), `error.middleware.js`, rate limiter, `helmet`/CORS stack | Identical response shape to every other endpoint |
| **DB plumbing** | `core/config/db.js` pool, transactions, the `update_updated_at_column()` trigger fn, `runMigration.js` | Same connection, own tables |
| **Utilities** | `phone.js` (Indian number normalisation), `dateUtils.js` (`formatDateIST`), `logger.js` | |
| **UI primitives** | `Card`, `Badge`, `Modal`, `Table`, `Input`, `Button`, `EmptyState`, `Skeleton(s)`, `PageHeader`, `ExportMenu`, `UnsavedChangesModal`, `CommandPalette`, `Breadcrumbs`, `ErrorBoundary` | Visual + behavioural consistency |
| **Design system** | The 5-theme CSS-variable architecture in `frontend/DESIGN_SYSTEM.md` | BD adds only 3 new tokens (priority A/B/C) |
| **Shell** | `MainLayout`, `Sidebar`, `Topbar`, lazy-route + `Suspense` pattern | BD is a nav group like any other |
| **Deploy** | Same PM2 backend process, same cPanel frontend build | Nothing new to operate |

### 0.2 Data BD does NOT touch

| Existing table / data | BD's own instead |
|---|---|
| `clients` | `bd_clients` — separate prospect master |
| `projects`, `pipeline`, `estimations`, `invoices`, `deliverables` | nothing — no FK, no join, no conversion flow |
| `project_type_configs` | `bd_sectors` — **seeded with the same sector names**, independent from that moment on |
| `activity_logs` (global audit) | `bd_activity_log` + its own viewer inside the module |
| `notifications`, `user_notification_prefs` | The BD Follow-ups page **is** the inbox; sidebar badge is a `COUNT` on `bd_followups`. No rows written to the shared notification tables. |
| `company_config`, `system_config` | `bd_settings` |

**The only foreign key leaving the module is `users(id)`** — unavoidable, because "which admin logged this call" needs an identity, and login is shared. It is read-only and `ON DELETE SET NULL`.

**Test of independence:** drop the nine `bd_*` tables, delete `backend/src/domains/bd/` and `frontend/src/modules/bd/`, remove three lines of route/sidebar wiring — and Niyamak is byte-for-byte unaffected. No broken joins, no orphaned rows, no missing columns.

### 0.3 Access — no second login

BD is a module **inside** Niyamak, not an app behind it. The admin has already logged in; BD adds no gate of its own.

- **No BD password, no separate credentials, no re-auth prompt, no PIN screen.**
- Frontend: BD routes sit inside the existing `<PrivateRoute>` → `<MainLayout>` → `<RoleRoute allowedRoles={[ROLES.ADMIN]}>` block, exactly like Users / Audit Log / Attendance.
- Backend: `bd.routes.js` declares `router.use(authenticate, authorize('admin'))` **once** at the top, so no endpoint can be added unprotected by accident.
- `super_admin` gets in automatically — `role.middleware.js` already maps `super_admin` → `admin`.
- The logged-in admin's id auto-fills `created_by` and defaults `bd_owner_id` ("BD person") on every new client.
- Non-admins never see the sidebar group and get the standard `AccessDenied` page if they type the URL.

> Contrast: `/super-admin` **does** have its own password gate. BD deliberately does not — it's a normal admin module.

---

## 1. What we're building

| Face | Route | Purpose |
|---|---|---|
| **Back office** | `/bd/clients` | Admin fills and edits everything — client, contacts, emails, phones, LinkedIn, follow-up logging |
| **Front dashboard** | `/bd` | Sector sections → inside each, client cards **arranged in a line, priority A → B → C**, each showing logo + status |
| **Follow-up inbox** | `/bd/followups` | Every outreach still awaiting a reply, across all clients |
| **Settings** | `/bd/settings` | Sectors, departments, reminder cadence |

---

## 2. Your answers, locked in

| Question | Your answer | How it's built |
|---|---|---|
| Status/priority per sector? | **Priority is per client**, set once by admin. Dashboard arranges clients in a line, priority-wise, inside each sector section. | `bd_clients.priority` (A/B/C) — one value per client. `ORDER BY sector_sort, priority, …` server-side. Same priority shows in every sector that client appears under. |
| Sector list | **Take the sector names from this software, but don't connect to it.** | `bd_sectors` table, seeded with Solar PV / Wind / T&D Lines / Tower / Chimney / Pipeline / Volumetric / Other. After seeding it's fully independent and admin-editable inside BD. |
| Does the app send prospecting mail? | **No — mail goes only to the admin**, for this BD module. | Zero client-facing email. All outreach happens outside the app (Outlook, phone, LinkedIn) and is **logged** in BD. |
| Should every change email the admin? | **No — only reminders and important info.** | Editing/creating/deleting anything is silent (still recorded in `bd_activity_log`). Email is reserved for follow-up reminders, overdue escalation, and an optional weekly summary. See §8. |
| Onboarded clients | **Don't connect to the software.** | `closed_onboard` is just a status. It stays in BD. No conversion to Pipeline, no client record created anywhere else. |
| Separate login for this module? | **No — it's admin is admin.** The admin is already logged into Niyamak; BD needs no login of its own. | BD routes sit inside the existing `<PrivateRoute>` + `authenticate` middleware, gated by role only (`admin`). See §0.3. |

---

## 3. Architectural decisions

### D1 — Log-only outreach model

The admin emails/calls the prospect using their own tools, then records it in BD. This is the single biggest simplification from your answer #3.

**Dropped from the design:** compose-and-send UI, per-recipient rate limiting, SMTP reputation handling, message-id tracking, bounce webhooks.

**Kept:** the full interaction record — what was sent, when, by whom, what came back.

### D2 — Channels + touchpoints, not flat checkbox columns

You described the UI as *"email 1, 2… with checkboxes on the right for email sent, sent date, reply, follow-up, call, remark."*

If those become plain columns on an email row, the history dies the second you email someone twice. Since you asked for a properly accurate log, the model splits:

| Table | Role |
|---|---|
| `bd_channels` | The address itself **+ rolled-up latest state** — this is the checkbox row you see |
| `bd_touchpoints` | **Append-only log** of every outreach and every reply |

Ticking "email sent" **writes a touchpoint**; the service recomputes the channel's rollup (`last_outreach_at`, `last_response_at`, `outreach_count`, `channel_status`). Your form stays exactly as simple as you described. The audit trail underneath is complete.

### D3 — One polymorphic channel table, not six

Emails, phones, and LinkedIn need identical follow-up treatment at **two levels**: general company contacts, and per-person contacts. Rather than six near-identical tables, one `bd_channels` table keyed by:

- `owner_type` — `client` | `contact`
- `channel_type` — `email` | `phone` | `linkedin` | `whatsapp`

**Payoff:** one follow-up engine, one reminder sweep, one filter set, one React component (`<ChannelLogTable>`) reused in all six places.

### D4 — BD keeps its own audit log

`bd_activity_log`, not the global `activity_logs`. Consistent with the independence rule, needs no change to `audit.service.getLogs()`, and puts the "who changed the priority to C?" answer inside the BD module where the admin is already working.

### D5 — Reminders via `node-cron` sweep, not BullMQ

`reminderQueue` exists in `core/queues/index.js` but **nothing consumes it** — there is no reminder worker. And Redis is optional here (queues degrade to synchronous execution). So the BD sweep goes into the scheduler using the same `scheduler_state` DB-lease pattern that already guards drone-maintenance and licence-expiry reminders — works with or without Redis, survives restarts, no double-fire across API + worker processes. The reminder **email** still goes out through `emailQueue` when Redis is up.

### D6 — Frontend lives in `modules/`, not `pages/`

The codebase already separates self-contained features (`modules/library`, `modules/archive`) from core pages. BD goes in `frontend/src/modules/bd/` with its own `api/ components/ pages/ store/`. One folder to delete if the module is ever pulled.

---

## 4. Data model — migration `058_business_development.sql`

Nine tables, all `bd_` prefixed. Only outside FK is `users(id)`.

### 4.1 `bd_clients` — the prospect master (independent)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT NOT NULL | client / company name |
| `details` | TEXT | free-form description of the client |
| `logo_url` | TEXT | R2 object key (same pattern as `users.avatar_url`) |
| `bd_owner_id` | UUID → `users(id)` ON DELETE SET NULL | "BD person" — **defaults to the admin who creates the record** |
| `priority` | TEXT NOT NULL DEFAULT `'C'` CHECK IN (`'A'`,`'B'`,`'C'`) | drives dashboard ordering |
| `sectors` | TEXT[] NOT NULL DEFAULT `'{}'` | keys from `bd_sectors` |
| `status` | TEXT NOT NULL DEFAULT `'to_be_initiated'` CHECK IN (`'to_be_initiated'`,`'wip'`,`'closed_onboard'`,`'closed_cancelled'`) | |
| `status_changed_at` | TIMESTAMPTZ | |
| `status_reason` | TEXT | required when → `closed_cancelled` |
| `website`, `city`, `state`, `address` | TEXT | optional enrichment |
| `notes` | TEXT | internal remarks |
| **Rollups (service-maintained)** | | |
| `next_follow_up_at` | TIMESTAMPTZ | earliest pending follow-up → the ⚠ badge on the card |
| `last_activity_at` | TIMESTAMPTZ | powers the "stale / never contacted" filter |
| `contact_count`, `touchpoint_count` | INTEGER DEFAULT 0 | shown on the card without an N+1 query |
| `created_by` | UUID → `users(id)` | |
| `created_at` / `updated_at` | TIMESTAMPTZ | + existing `update_updated_at_column()` trigger |
| `deleted_at` | TIMESTAMPTZ | soft delete |

**Unique:** partial index on `LOWER(TRIM(name)) WHERE deleted_at IS NULL` — stops "NTPC" and "ntpc" becoming two leads.
**Indexes:** `(status)`, `(priority)`, `(bd_owner_id)`, **GIN** on `(sectors)`, `(next_follow_up_at) WHERE deleted_at IS NULL`.

---

### 4.2 `bd_sectors` — the dashboard sections

| Column | Type |
|---|---|
| `id` UUID PK · `key` TEXT UNIQUE · `label` TEXT · `icon` TEXT (Material Symbols) · `color_token` TEXT · `sort_order` INT · `is_active` BOOL · timestamps |

**Seed** (names taken from the software, table stays independent):

| key | label | icon | sort |
|---|---|---|---|
| `solar` | Solar | `solar_power` | 10 |
| `windmill` | Windmill | `wind_power` | 20 |
| `td_lines` | T&L | `electric_bolt` | 30 |
| `chimney` | Chimney | `factory` | 40 |
| `tower` | Tower | `cell_tower` | 50 |
| `pipeline` | Pipeline | `water` | 60 |
| `volumetric` | Volumetric | `view_in_ar` | 70 |
| `other` | Other | `category` | 80 |

Admin adds/renames/reorders sectors in BD Settings — the dashboard sections follow automatically, no code change.

---

### 4.3 `bd_departments` — the department dropdown

`id · key · label · sort_order · is_active · timestamps`

**Seed:** Procurement · Projects · O&M / Maintenance · Engineering & Design · Finance · Management / CXO · Quality & Safety · Business Development · Other. Admin-editable in BD Settings.

---

### 4.4 `bd_contacts` — "person involved"

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID NOT NULL → `bd_clients(id)` **ON DELETE CASCADE** | |
| `name` | TEXT NOT NULL | |
| `designation` | TEXT | free text — job titles are too varied to enumerate |
| `department` | TEXT | **dropdown**, key from `bd_departments` |
| `is_primary` | BOOLEAN DEFAULT FALSE | partial unique index: one primary per client |
| `is_decision_maker` | BOOLEAN DEFAULT FALSE | useful filter |
| `notes` | TEXT | |
| `sort_order` | INTEGER | |
| `created_by` · `created_at` · `updated_at` · `deleted_at` | | |

---

### 4.5 `bd_channels` — every contactable endpoint (D3)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID NOT NULL → `bd_clients(id)` ON DELETE CASCADE | denormalised for fast client-scoped reads |
| `owner_type` | TEXT CHECK IN (`'client'`,`'contact'`) | general vs person-level |
| `contact_id` | UUID → `bd_contacts(id)` ON DELETE CASCADE | NULL when `owner_type='client'` |
| `channel_type` | TEXT CHECK IN (`'email'`,`'phone'`,`'linkedin'`,`'whatsapp'`) | |
| `value` | TEXT NOT NULL | address / number / profile URL |
| `label` | TEXT | "Office", "Personal", "Tender desk" |
| `sort_order` | INTEGER DEFAULT 0 | **this is your "email 1, email 2, email 3" ordering** |
| `is_primary` | BOOLEAN DEFAULT FALSE | |
| **Rollups (D2)** | | |
| `outreach_count` | INTEGER DEFAULT 0 | |
| `last_outreach_at` | TIMESTAMPTZ | → the **"sent date"** cell |
| `last_response_at` | TIMESTAMPTZ | → the **"reply received"** checkbox |
| `channel_status` | TEXT DEFAULT `'not_contacted'` CHECK IN (`'not_contacted'`,`'contacted'`,`'awaiting_response'`,`'responded'`,`'bounced'`,`'unreachable'`) | |
| `last_remark` | TEXT | latest remark, shown inline |
| `created_by` · `created_at` · `updated_at` · `deleted_at` | | |

**Constraints**
- `CHECK ((owner_type = 'contact') = (contact_id IS NOT NULL))` — keeps the polymorphism honest.
- Partial unique on `(client_id, channel_type, LOWER(value)) WHERE deleted_at IS NULL` — no duplicate email on one client.

**Indexes:** `(client_id, channel_type, sort_order)`, `(contact_id)`, `(channel_status)`.

---

### 4.6 `bd_touchpoints` — the append-only interaction log

The heart of "proper accurate log system".

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID NOT NULL → `bd_clients(id)` ON DELETE CASCADE | |
| `contact_id` | UUID → `bd_contacts(id)` ON DELETE SET NULL | |
| `channel_id` | UUID → `bd_channels(id)` ON DELETE SET NULL | |
| `interaction_type` | TEXT CHECK IN (`'email'`,`'call'`,`'linkedin'`,`'whatsapp'`,`'meeting'`,`'site_visit'`,`'other'`) | |
| `direction` | TEXT CHECK IN (`'outbound'`,`'inbound'`) | |
| `occurred_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | ← your **"sent date"** |
| `subject` | TEXT | email subject / call purpose |
| `summary` | TEXT | what was sent or discussed |
| `response_status` | TEXT DEFAULT `'awaiting'` CHECK IN (`'awaiting'`,`'positive'`,`'negative'`,`'neutral'`,`'no_response'`,`'bounced'`) | |
| `response_at` | TIMESTAMPTZ | |
| `response_summary` | TEXT | ← your **"reply (response) of this client"** |
| `remark` | TEXT | ← your **"remark"** |
| `outcome` | TEXT | "send profile", "share rate card", "not interested" |
| `next_follow_up_at` | TIMESTAMPTZ | seeds `bd_followups` |
| `attachment_keys` | TEXT[] | optional R2 keys (quote PDF, company profile) |
| `is_corrected` | BOOLEAN DEFAULT FALSE | set when an entry is edited |
| `created_by` | UUID → `users(id)` | who logged it |
| `created_at` · `updated_at` | | |

**No `deleted_at` — touchpoints are never deleted.** Corrections are edits that flip `is_corrected` and write a `bd_activity_log` row with the before/after. That is what makes the log trustworthy.

**Indexes:** `(client_id, occurred_at DESC)`, `(channel_id, occurred_at DESC)`, `(response_status)`, `(created_by)`.

---

### 4.7 `bd_followups` — scheduled reminders

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID NOT NULL → `bd_clients(id)` ON DELETE CASCADE | |
| `touchpoint_id` | UUID → `bd_touchpoints(id)` ON DELETE CASCADE | the outreach being chased |
| `contact_id` · `channel_id` | UUID | who / where to chase |
| `due_at` | TIMESTAMPTZ NOT NULL | |
| `status` | TEXT DEFAULT `'pending'` CHECK IN (`'pending'`,`'sent'`,`'completed'`,`'cancelled'`,`'escalated'`) | |
| `assigned_to` | UUID → `users(id)` | defaults to `bd_owner_id` |
| `reminder_count` | INTEGER DEFAULT 0 | |
| `last_reminded_at` | TIMESTAMPTZ | |
| `note` | TEXT | |
| `completed_at` · `completed_by` | | set automatically when a response is logged |
| `created_by` · `created_at` · `updated_at` | | |

**Index:** `(status, due_at) WHERE status IN ('pending','sent')` — the cron sweep's only hot query.

---

### 4.8 `bd_activity_log` — BD's own audit trail (D4)

| Column | Type |
|---|---|
| `id` UUID PK · `user_id` UUID → `users(id)` · `action` TEXT · `entity_type` TEXT (`client`/`contact`/`channel`/`touchpoint`/`followup`/`settings`) · `entity_id` UUID · `client_id` UUID (so a client's whole history is one indexed query) · `old_value` JSONB · `new_value` JSONB · `created_at` |

**Append-only.** Indexes on `(client_id, created_at DESC)` and `(entity_type, entity_id)`.

---

### 4.9 `bd_settings` — single-row module config

| Column | Default | Purpose |
|---|---|---|
| `default_followup_days` | 3 | first reminder N days after outreach with no reply |
| `priority_a_followup_days` | 2 | tighter cadence for A-priority |
| `escalation_days` | 7 | cadence for the 2nd/3rd reminder |
| `max_reminders` | 3 | stop nagging, mark `escalated` |
| `reminder_hour_ist` | 9 | when the daily mail goes out |
| `digest_enabled` | true | one digest vs one mail per follow-up |
| `notify_user_ids` | UUID[] | extra admins to copy (empty ⇒ all admins) |
| `weekly_summary_enabled` | true | Monday BD status summary to admins |

---

## 5. Backend — `backend/src/domains/bd/`

```
bd/
├── bd.routes.js              # all routes, authorize('admin')
├── bd.controller.js          # thin: parse → delegate → respond
├── bd.clients.service.js     # CRUD, dashboard aggregation, filter builder
├── bd.contacts.service.js
├── bd.channels.service.js
├── bd.touchpoints.service.js # + rollup recomputation (D2)
├── bd.followups.service.js   # scheduling, completion, escalation
├── bd.reminders.service.js   # cron sweep body + admin email templates
├── bd.audit.service.js       # writes bd_activity_log
├── bd.config.service.js      # sectors, departments, settings
├── bd.export.service.js      # Excel/CSV honouring active filters
└── bd.validation.js
```

Mounted once in `app.js`: `app.use('/api/bd', require('./domains/bd/bd.routes'))`.
Every route sits behind `authenticate` + `authorize('admin')` — declared once via `router.use(...)`, so no endpoint can be added unprotected by accident.

### 5.1 Endpoints

**Clients**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/bd/clients` | list + full filters + pagination + sort |
| GET | `/api/bd/clients/:id` | detail: client + contacts + channels + recent touchpoints + open follow-ups |
| POST | `/api/bd/clients` | create |
| PUT | `/api/bd/clients/:id` | update |
| PATCH | `/api/bd/clients/:id/status` | status + reason, audit-logged, cancels open follow-ups on closure |
| PATCH | `/api/bd/clients/:id/priority` | quick change from the dashboard card |
| DELETE | `/api/bd/clients/:id` | soft delete |
| POST/GET/DELETE | `/api/bd/clients/:id/logo` | R2 upload via `upload.uploadTiny.single('logo')`; GET streams back |
| GET | `/api/bd/clients/:id/timeline` | touchpoints + activity log merged, paginated |

**Contacts & channels**

| Method | Path |
|---|---|
| GET / POST | `/api/bd/clients/:id/contacts` |
| PUT / DELETE | `/api/bd/contacts/:contactId` |
| GET / POST | `/api/bd/clients/:id/channels` (`?owner_type=&contact_id=&channel_type=`) |
| PUT / DELETE | `/api/bd/channels/:channelId` |
| PATCH | `/api/bd/channels/reorder` (bulk `sort_order`) |
| **POST** | **`/api/bd/channels/:channelId/log`** ← **the checkbox action.** One transaction: touchpoint + rollups + follow-up + client rollups + audit |

**Touchpoints**

| Method | Path |
|---|---|
| GET | `/api/bd/clients/:id/touchpoints` (filterable) |
| POST | `/api/bd/touchpoints` (manual entry: meeting, site visit) |
| PUT | `/api/bd/touchpoints/:id` (correction — audit-logged, sets `is_corrected`) |
| PATCH | `/api/bd/touchpoints/:id/response` | log the reply → auto-completes the linked follow-up |

**Follow-ups**

| Method | Path |
|---|---|
| GET | `/api/bd/followups` (`?status=&due_before=&assigned_to=&priority=`) — the inbox |
| POST | `/api/bd/followups` (manual) |
| PATCH | `/api/bd/followups/:id/complete` · `/snooze` · `/cancel` |

**Dashboard, config, export**

| Method | Path |
|---|---|
| GET | `/api/bd/dashboard` — sector-grouped, priority-ordered payload (§6.1) |
| GET | `/api/bd/stats` — KPI tiles |
| GET / POST / PUT / DELETE | `/api/bd/sectors` · `/api/bd/departments` |
| GET / PUT | `/api/bd/settings` |
| GET | `/api/bd/activity` — BD audit viewer |
| GET | `/api/bd/export?format=xlsx\|csv` |

### 5.2 Transactional integrity

Three flows **must** be single `pg` transactions (the codebase already threads a `connection` through service calls):

1. **Create client** → insert `bd_clients` → insert initial channels/contacts → `bd_activity_log`.
2. **Log outreach** (`POST /channels/:id/log`) → insert `bd_touchpoints` → update `bd_channels` rollups → insert `bd_followups` → update `bd_clients.last_activity_at` + `next_follow_up_at` → `bd_activity_log`.
3. **Log response** → update touchpoint → update channel rollups → complete linked follow-up → recompute client rollups → `bd_activity_log`.

If any step fails the whole thing rolls back — no touchpoint without its follow-up, no rollup that disagrees with the log.

---

## 6. Frontend — dashboard (`/bd`)

### 6.1 Layout

Sections come from `bd_sectors` (ordered by `sort_order`). **Inside each section, cards are laid out in a line, arranged A → B → C.**

```
┌───────────────────────────────────────────────────────────────────┐
│  Business Development           [Search] [Filters ▾] [+ New Client]│
├───────────────────────────────────────────────────────────────────┤
│  Total 48 │ 🅐 12 │ WIP 19 │ Onboarded 7 │ Follow-ups due 5 ⚠      │
├───────────────────────────────────────────────────────────────────┤
│ ▼ ☀ Solar                                             18 clients  │
│   ── A ─────────────────────────────────────────────────────────  │
│   ┌────────┐┌────────┐┌────────┐┌────────┐                        │
│   │ [LOGO] ││ [LOGO] ││ [LOGO] ││ [LOGO] │                         │
│   │ Adani  ││ Tata   ││ ReNew  ││ NTPC   │                         │
│   │🅐  WIP  ││🅐  WIP  ││🅐  TBI  ││🅐  WIP │                        │
│   │⏰ 2d    ││✓ 5 Aug ││⚠ due   ││⏰ 6d    │                        │
│   └────────┘└────────┘└────────┘└────────┘                        │
│   ── B ─────────────────────────────────────────────────────────  │
│   ┌────────┐┌────────┐┌────────┐                                  │
│   ── C ─────────────────────────────────────────────────────────  │
│   ┌────────┐┌────────┐                                            │
│ ▼ 🌬 Windmill                                          9 clients   │
│ ▼ ⚡ T&L                                                6 clients   │
│ ▼ 🏭 Chimney                                            4 clients   │
└───────────────────────────────────────────────────────────────────┘
```

**Ordering rules**
- Section order = `bd_sectors.sort_order`.
- Inside a section: `priority ASC (A,B,C)` → then `status` (WIP first, Cancelled last) → then `last_activity_at DESC`.
- **Sorting is server-side in the SQL `ORDER BY`.** Never re-sorted in React, or pagination scrambles the priority order.
- Thin `── A ──` divider rows make the grouping visible rather than merely implied.
- A client in two sectors appears in both, with the **same** priority (per your answer).
- Empty sectors collapse to one muted line, not a large blank block.
- Section open/closed state persists in `localStorage`.

### 6.2 Client card

| Element | Source |
|---|---|
| Logo | `GET /api/bd/clients/:id/logo`; `onError` → initials-in-a-circle fallback (same technique as user avatars) |
| Name | `bd_clients.name` |
| Priority chip | A / B / C — dedicated theme tokens `--bd-priority-a/b/c`, **not** reused error/warning colours (priority must never read as "broken") |
| Status badge | `<Badge>` — To Be Initiated (slate) · WIP (blue) · Onboarded (green) · Cancelled (red) |
| Follow-up indicator | `⚠ overdue` red · `⏰ in Nd` amber · `✓ contacted <date>` muted · `– never contacted` |
| Counts | "3 contacts · 5 touchpoints" (from the rollup columns — no N+1) |
| Hover actions | Log outreach · View · Edit |

All colours through the 5-theme CSS variables per `frontend/DESIGN_SYSTEM.md`. No hard-coded hex.

### 6.3 View toggle

**Board** (above) · **Table** (dense, sortable, every column, export) · **Follow-ups** (due-work queue across all clients, `due_at` ascending, overdue pinned to top).

---

## 7. Frontend — module structure

Following the existing `modules/library` convention:

```
frontend/src/modules/bd/
├── api/
│   └── bd.api.js                 # every BD axios call in one file
├── store/
│   └── bd.store.js               # Zustand — filters, view mode, section collapse
├── pages/
│   ├── BDDashboard.jsx           # /bd
│   ├── BDClientList.jsx          # /bd/clients
│   ├── BDClientForm.jsx          # /bd/clients/new · /bd/clients/:id/edit
│   ├── BDClientDetail.jsx        # /bd/clients/:id
│   ├── BDFollowUps.jsx           # /bd/followups
│   └── BDSettings.jsx            # /bd/settings
└── components/
    ├── ChannelLogTable.jsx       # ★ the reusable checkbox module (D3)
    ├── LogOutreachModal.jsx
    ├── LogResponseModal.jsx
    ├── ContactCard.jsx
    ├── ClientLogoUpload.jsx
    ├── BDFilterBar.jsx
    ├── BDClientCard.jsx
    ├── BDSectorSection.jsx
    ├── BDPriorityChip.jsx / BDStatusBadge.jsx
    └── BDTimeline.jsx
```

### 7.1 `BDClientForm` — the data-entry screen

One page, four anchored sections (not a wizard — admins re-edit constantly):

**1 · Client**
Name · Details (textarea) · Logo (drag-drop, ≤2 MB, png/jpg/svg/webp) · **BD Person** (user select, **pre-filled with the logged-in admin**) · **Priority** (A/B/C segmented control) · **Sectors** (multi-select chips from `bd_sectors`) · Website / City / State.

**2 · General Contact Details**
Two `<ChannelLogTable>` instances — **Emails** and **Phone Numbers** — both `owner_type='client'`. Add / remove rows, drag to reorder (that's your "email 1, 2, 3…").

**3 · Persons Involved**
Repeatable `<ContactCard>`: Name · Designation · **Department (dropdown)** · Decision-maker toggle — each containing its own nested `<ChannelLogTable>` for that person's **Email**, **Phone**, and **LinkedIn**.

**4 · Status**
Status select · reason (required for Cancelled) · internal notes.

Unsaved-changes guard reuses the existing `UnsavedChangesModal.jsx` + browser back-button trap already applied to the Project and Pipeline forms.

### 7.2 `<ChannelLogTable>` — the component you described

| Address | Label | Sent | Sent date | Reply | Response | Remark | ⋯ |
|---|---|---|---|---|---|---|---|
| a@client.in | Office | ☑ | 02 Aug 26 | ☑ | Positive — wants profile | Asked for rate card | ⋯ |
| b@client.in | Tender | ☑ | 04 Aug 26 | ☐ | *awaiting · 2d* | — | ⋯ |
| c@client.in | — | ☐ | — | — | — | — | ⋯ |

Behaviour:
- Ticking **Sent** opens `LogOutreachModal` (date defaults to now; subject/summary optional) → `POST /channels/:id/log`. It is not a dumb boolean — it creates a real touchpoint and schedules the follow-up.
- Ticking **Reply** opens `LogResponseModal` (response type, summary, remark, next step) → `PATCH /touchpoints/:id/response`, which closes the pending follow-up.
- Cells display the **rollup**; the `⋯` menu opens **View full history** — every touchpoint on that address, newest first.
- Un-ticking never deletes history — it opens a "correct this entry" flow that edits the touchpoint and writes an audit row.
- One component, three label maps: `phone` → Called / Call date / Answered; `linkedin` → Connected / Sent date / Replied.
- Below `md` breakpoint it renders as stacked cards — a 7-column table is unusable on a phone.

### 7.3 `BDClientDetail` — five tabs

**Overview** (logo, priority, status, sectors, owner, KPI strip) · **Contacts** · **Communication Log** (`<BDTimeline>`, filterable by channel / type / person / date) · **Follow-ups** (open + history) · **Activity** (`bd_activity_log` for this client — who changed what, when).

### 7.4 Wiring into the shell

- `utils/constants.js` → `BD: '/bd'`, `BD_CLIENTS: '/bd/clients'`, `BD_FOLLOWUPS: '/bd/followups'`, `BD_SETTINGS: '/bd/settings'`; plus `BD_PRIORITIES`, `BD_STATUSES`, `BD_INTERACTION_TYPES`.
- `routes/AppRoutes.jsx` → lazy imports inside the existing **Admin only** `<RoleRoute allowedRoles={[ROLES.ADMIN]}>` block.
- `Sidebar.jsx` → a **new "Business Development" group** (its own group, not folded into "Business" — it's a standalone module): Dashboard · Clients · Follow-ups · Settings, all `roles: [ROLES.ADMIN]`, icon `handshake`.
- `CommandPalette.jsx` → register BD pages + "New BD client".

---

## 8. Email — reminders and important info only (not a change-log)

Two rules, both from your feedback:

1. **No email ever leaves the system addressed to a prospect** — every mail BD sends goes to admins.
2. **Not every edit sends mail.** Renaming a client, editing details, adding a contact, reordering channels, tweaking a remark — all silent. Email fires **only** for the handful of things below. This is a deliberate allow-list, not a default-on log.

| Mail | Trigger | Content |
|---|---|---|
| **Follow-up reminder** (digest) | Daily sweep finds `bd_followups` due today | Grouped by priority A→B→C: client, contact, channel, what was sent, days silent, deep link to `/bd/clients/:id` |
| **Overdue escalation** | A follow-up's `reminder_count` hits `max_reminders` | Separate "Needs attention" block inside the same digest — nagged repeatedly, still no reply |
| **Weekly BD summary** (optional, off by default — toggle in Settings) | Monday 09:00 IST | New clients · status movements · still-awaiting count — a digest, not a per-action trail |

**Everything else is silent — no mail for:** creating/editing/deleting a client, contact, or channel; changing priority or status; logging a touchpoint or a response; correcting an entry. All of that is still fully recorded in `bd_activity_log` (§10) and visible on the client's **Activity** tab and the dashboard — it's just not emailed. Mail is reserved for "you need to act on this," not "something changed."

Templates live in `bd.reminders.service.js` — BD writes its own HTML, and only borrows `email.service.sendEmail()` as transport. Delivery goes through `addJob(emailQueue, …)` so it's async when Redis is up and synchronous when it isn't.

### 8.1 The reminder sweep

Registered in `core/utils/scheduler.js`, guarded by the existing `_claimRun()` DB lease so two processes can't double-send:

```
cron.schedule('30 3 * * *', () => runGuardedBdSweep())   // 09:00 IST
```

1. `SELECT` pending `bd_followups WHERE due_at <= NOW()`.
2. Group by `assigned_to` → fall back to `bd_owner_id` → fall back to all admins (plus `bd_settings.notify_user_ids`).
3. `digest_enabled` ? one mail per admin listing everything : one mail per follow-up.
4. Update rows → `status='sent'`, `reminder_count += 1`, `last_reminded_at=NOW()`, `due_at += escalation_days` — or `status='escalated'` at `max_reminders`.
5. Recompute `bd_clients.next_follow_up_at`.

Everything is DB-driven — restart-safe, Redis-optional, idempotent within a day.

### 8.2 Follow-up scheduling rules

| Trigger | Result |
|---|---|
| Outreach logged, `response_status='awaiting'` | follow-up at `occurred_at + default_followup_days` — or `priority_a_followup_days` for A clients |
| Explicit `next_follow_up_at` supplied | overrides the default |
| Response logged (anything ≠ `awaiting`) | linked follow-up → `completed` |
| Client → `closed_onboard` / `closed_cancelled` | all pending follow-ups → `cancelled` |
| `reminder_count` = `max_reminders` | → `escalated`, surfaced separately in the digest |

---

## 9. Filters — module-wide

### 9.1 The filter set

| Filter | Type |
|---|---|
| Search | text — client name, contact name, email, phone, remark, response summary |
| Sector | multi-select from `bd_sectors` |
| Priority | multi A/B/C |
| Status | multi TBI / WIP / Onboarded / Cancelled |
| BD Person | user multi-select |
| Follow-up state | Overdue · Due today · Due this week · None scheduled |
| Last contacted | date range · Never contacted · Stale > 30 days |
| Response state | Awaiting · Responded · No response · Bounced |
| Department | multi-select (contact-level) |
| Decision maker | boolean |
| Channel type | email / phone / linkedin |
| Created | date range |
| Data hygiene | Has logo · Missing logo · No contacts · No channels |

### 9.2 Implementation rules

- **One filter builder** — `buildFilters(query) → { where, values }` in `bd.clients.service.js`, used identically by list, dashboard, stats, and export. One place to fix; the four views can't drift.
- **All filtering server-side, fully parameterised** (`$1, $2, …`). `sort_by` / `sort_dir` whitelisted against a fixed column map — never interpolated.
- **URL is the state**: `?sector=solar&priority=A,B&followup=overdue`. Shareable, survives refresh and back-button, matches how Projects/Pipeline already behave.
- **Export honours active filters** — `/api/bd/export` takes the identical query string.
- One `<BDFilterBar>` across all four views; presets saved to `localStorage` in v1.

---

## 10. Logging — three layers

| Layer | Table | Answers |
|---|---|---|
| **Business log** | `bd_touchpoints` | "What did we send this client and when — and what did they say back?" |
| **System audit** | `bd_activity_log` | "Who edited this record, what changed, when?" |
| **Reminder trail** | `bd_followups` | "Were we reminded? How many times? Did we act?" |

Rules:
- Every mutation writes its audit row **inside the same transaction** as the data change — the log can never disagree with reality.
- `old_value` / `new_value` stored as JSONB diffs.
- Touchpoints are never hard-deleted; corrections are logged edits.
- The **Activity** tab on each client renders `bd_activity_log` filtered by `client_id` — admins self-serve "who dropped this to priority C?".

---

## 11. Build phases

| Phase | Deliverable | Depends on |
|---|---|---|
| **1 — Schema** | Migration 058: 9 tables + indexes + triggers + sector/department seeds. Dry-run on a DB copy first. | — |
| **2 — Core API** | Clients / contacts / channels CRUD + filter builder + `bd_activity_log` wiring. Postman-verified. | 1 |
| **3 — Touchpoints** | Touchpoint create/response + channel & client rollup recomputation + transaction correctness. | 2 |
| **4 — Reminder engine** | `bd_followups` scheduling + cron sweep + admin digest/escalation templates + BD settings. | 3 |
| **5 — Back office UI** | `BDClientList`, `BDClientForm`, `ChannelLogTable`, log modals, logo upload. | 2–4 |
| **6 — Client workspace** | `BDClientDetail` 5 tabs + `BDTimeline`. | 5 |
| **7 — Dashboard** | `/bd` sector sections, priority-line layout, KPI row, collapse state, theme tokens. | 2 |
| **8 — Filters & export** | `<BDFilterBar>` across all views, URL sync, Excel/CSV export. | 5–7 |
| **9 — Settings & polish** | `BDSettings` (sectors, departments, cadence), empty/loading/error states, mobile, 5-theme QA. | all |

Phases 1–4 are backend-only and independently testable. Phase 7 can run in parallel with 5–6 once Phase 2 lands. **There is no integration phase** — that's the point.

---

## 12. Cross-cutting requirements

- **Encoding** — any bulk file edits use explicit UTF-8 IO. The cp1252 default has corrupted this repo before.
- **Theming** — 5 themes, CSS variables only, per `frontend/DESIGN_SYSTEM.md`. Priority gets its own tokens.
- **Mobile** — dashboard sections → single-column cards; `ChannelLogTable` → stacked cards below `md`.
- **Validation** — email format; Indian phone normalisation (reuse `core/utils/phone.js`); LinkedIn URL shape; logo ≤2 MB and mime-checked.
- **Performance** — `/api/bd/dashboard` is one query using the rollup columns, not N+1. Logos stream from R2 with cache headers.
- **Soft delete** — every read filters `deleted_at IS NULL` (except `bd_touchpoints`, which has none by design).
- **Cascade safety** — deleting a client cascades contacts → channels → touchpoints → follow-ups. Soft-delete is the default path; hard delete is admin-only with a typed-name confirmation.

---

## 13. Effort estimate

| Phase | Rough size |
|---|---|
| 1 — Schema | 1 migration, ~400 lines SQL |
| 2–4 — Backend | ~11 files, ~2200 lines |
| 5–7 — Frontend | ~18 files, ~3200 lines |
| 8–9 — Filters, settings, polish | ~700 lines |

The backend is the load-bearing half. Get the schema and the log-outreach transaction right and the UI is mechanical.

---

## 14. Premium UI/UX design

BD is admin-only and used constantly — this should be the best-looking module in the app, not a bolted-on CRUD screen. Everything below **extends** `frontend/DESIGN_SYSTEM.md` — same tokens, same theme machinery, all 5 themes, nothing hardcoded. "Premium" here means restraint and precision, not extra decoration: generous spacing, purposeful motion, real data density where it earns its place, and zero dead states.

### 14.1 Design principles for this module

1. **Priority is a visual hierarchy, not just a chip.** A-priority clients should be unmistakably first — position, subtle emphasis, and a divider label do the work; not louder colors or bigger cards.
2. **Every number is alive.** Counts, KPI tiles, and follow-up badges animate on change (count-up, not a jump-cut) — this is a living pipeline, not a static report.
3. **The log is the product.** Since this whole module exists to make communication tracking *proper and accurate*, the timeline/log UI gets the most design attention of anything in the module — it's what the admin will stare at daily.
4. **No dead ends.** Every empty state, every zero-result filter, every first-run screen has an illustration-free, icon + one-line message + a primary action — matching `EmptyState.jsx`, never a blank div.
5. **Fast to scan, fast to act.** Inline actions (tick a box, bump priority, snooze a follow-up) never require a full page navigation. Modals are for data entry; everything glanceable is inline.

### 14.2 Dashboard (`/bd`) — the centerpiece screen

- **Hero KPI row**: 5 stat tiles (Total · A-priority · WIP · Onboarded · Follow-ups due) as a horizontally-scrollable row on mobile, fixed grid on desktop. Each tile: large number (`text-2xl font-bold`, count-up animation on load/refresh), label below, and a tiny trend indicator (▲/▼ vs. last week) where meaningful. `shadow-soft`, `bg-surface`, hover lifts to `shadow-card` — same elevation contract as the rest of the app.
- **Sector sections as accordions with weight.** Section header shows the sector icon (from `bd_sectors.icon`, Material Symbols, `FILL 1`), label, live count, and a mini priority breakdown (`4A · 9B · 5C` as small colored dots, not full chips — scannable at a glance before expanding). Chevron rotates on collapse/expand (`transition-transform`), state persisted per-admin in `localStorage`.
- **Priority divider rows** (`── A ──`) are a full-width thin rule with a small overline label (`text-[10px] font-bold uppercase tracking-widest text-slate-400`), not a heavy header — they organize without shouting.
- **Client cards**: `rounded-2xl`, `shadow-card`, logo top-left (44px circle, initials-avatar fallback with a deterministic color from the client name — same trick as user avatars elsewhere in the app), name truncated with `title` tooltip, priority as a small colored dot + letter (not a full badge — saves space at card density), status as `<Badge>`. Follow-up state is the single most important signal on the card: a colored left-border accent (2–3px) — red for overdue, amber for due soon, none for on-track — so the whole row of cards reads as a heat-map at a glance without needing to read text.
- **Hover state**: card lifts (`hover:shadow-pop`, `hover:-translate-y-0.5`, 150ms), reveals a quick-action bar (Log outreach · View · Edit) that fades in rather than pushing layout.
- **Skeleton loading**: sector sections render their skeleton shape immediately (reuse `Skeletons.jsx` patterns) — never a spinner-in-a-void.
- **Empty sector**: single muted row, "No clients yet in Chimney — Add one" as a text link, not a boxed empty state (keeps the page scannable when several sectors are thin).

### 14.3 The Communication Log / Timeline — highest design priority

This is what makes the log feel "proper" rather than a database dump:

- **Vertical timeline**, newest at top, each touchpoint as a connected node: a small icon per `interaction_type` (mail, phone, LinkedIn, WhatsApp, calendar for meetings) in a colored ring, connected by a thin vertical line — same visual grammar as a changelog/activity feed, not a table.
- **Two-state entries**: an outbound touchpoint renders as one card; if it has a linked response, the response renders as a nested sub-card directly beneath with a subtle indent and a "↳ replied" connector — so a glance shows which outreach got answered and which didn't, without reading dates.
- **Awaiting-response entries** get a pulsing/breathing dot (respecting `prefers-reduced-motion` — falls back to static) next to "Awaiting reply · 3 days" so open loops are visually distinct from closed ones.
- **Filter chips above the timeline** (channel type, direction, date range) — filtering re-animates the list with a stagger fade, not an instant swap.
- **Inline correction**: editing a past entry opens an inline expand (not a full modal) showing old → new with a "corrected" tag, so history stays visible even while being fixed.

### 14.4 `ChannelLogTable` — premium treatment of the checkbox grid

- Checkboxes are custom-styled (not raw browser checkboxes) — a small animated check-draw on tick, matching the toggle/switch motion already defined in the design system.
- "Sent" and "Reply" checkboxes are visually paired with a connecting micro-arrow between their columns when both are true, and greyed/disabled-look on "Reply" until "Sent" is true (can't reply before you sent).
- Row hover reveals the "⋯ view history" affordance instead of always showing it — keeps the grid calm at rest, informative on interaction.
- Adding a row animates in (`animate-slide-up`, ≤300ms per the motion rule); removing fades out rather than snapping.
- On mobile, each row becomes a compact card with the same information stacked — never a horizontally-scrolled table.

### 14.5 Forms (`BDClientForm`, contact/channel entry)

- **Anchored single-page sections** (§7.1) with a sticky mini-nav on the side (desktop) or a segmented control (mobile) that highlights the section currently in view on scroll — so a long form never feels like scrolling into the void.
- **Priority picker** as a 3-segment control with color fill (not a dropdown) — A/B/C should be a one-click, visually immediate choice since it's set "once by admin" per your spec and deserves to feel deliberate.
- **Sector picker** as removable chips with a searchable add — consistent with how multi-selects already look elsewhere (`ClientSelect.jsx` pattern).
- **Logo upload**: drag-and-drop zone with live preview crop-to-circle, matching the avatar upload pattern already in `user.service.js` / the profile page.
- Inline validation (on blur, not on every keystroke), errors as a small red caption under the field with an icon — no `alert()`, no toast-only errors that vanish before they're read.
- Save button shows a spinner (`Button isLoading`) and the form becomes read-only-feeling (dimmed, non-interactive) during submit — never a double-submit risk.

### 14.6 Follow-ups inbox (`/bd/followups`)

- Grouped by urgency, not flat: **Overdue** (red accent header) → **Due today** → **Due this week** → **Upcoming** — each a collapsible group with a count.
- Each row: client logo, name, what's being chased, days overdue/remaining as a colored pill, and inline actions (Complete · Snooze · View) — completing animates the row out with a satisfying checkmark-then-collapse (≤300ms), not an instant vanish.
- A "clear the queue" moment: when Overdue hits zero, a small celebratory state (icon + "You're all caught up" — text only, no confetti/emoji spam) reinforces that the admin did the work.

### 14.7 Motion & micro-interactions (all within the existing 300ms/reduced-motion rule)

| Interaction | Treatment |
|---|---|
| KPI numbers on load/refresh | count-up over ~400ms (slightly longer than the 300ms UI rule since it's a passive read, not a response to input) |
| Priority/status change | the chip briefly scales (1 → 1.08 → 1) to confirm the click landed |
| Card hover | lift + shadow escalation, 150ms |
| Section expand/collapse | height auto-animate + chevron rotate, 200ms |
| Row add/remove in `ChannelLogTable` | slide-up in / fade out |
| Follow-up completed | checkmark draw → row collapse |
| Toast confirmations | reuse the app's existing toast pattern — success green, brief, non-blocking |

### 14.8 Color use specific to BD

- **Priority tokens** `--bd-priority-a` (red-leaning, urgency), `--bd-priority-b` (amber, attention), `--bd-priority-c` (slate, neutral) — defined once per theme in `index.css` alongside the existing chart/status tokens, so they auto-adapt across all 5 themes via the same shade contract (§2 of the design system).
- **Status colors reuse existing semantic tokens** — To Be Initiated = slate/info, WIP = blue, Onboarded = emerald/success, Cancelled = red/danger — no new status palette invented.
- **Follow-up urgency** (card left-border, inbox pills) reuses `danger`/`warning`/`success` tokens — consistent meaning across the whole app (red always means "needs attention" everywhere in Niyamak, not just here).

### 14.9 Empty, loading, and zero-data states

Every list/board/table in the module gets a purpose-built empty state via the existing `EmptyState.jsx`:

| Screen | Empty state |
|---|---|
| Dashboard, first run | Icon + "No leads yet — start building your pipeline" + "Add your first client" primary button |
| Filtered to zero results | Icon + "No clients match these filters" + "Clear filters" link |
| Client detail, no contacts yet | Inline prompt inside the Contacts tab, not a separate page |
| Follow-ups inbox, nothing due | The "caught up" state from §14.6 |
| Timeline, no touchpoints logged | "No outreach logged yet — tick a channel above to start the log" |

### 14.10 Accessibility (non-negotiable, matches app-wide standard)

Full keyboard navigation through the dashboard cards and timeline (roving tabindex), visible `:focus-visible` rings using the theme accent, `aria-label`s on all icon-only buttons, modals as `role="dialog" aria-modal`, checkboxes as real `<input type="checkbox">` under custom styling (never `<div>`-as-checkbox), color never the *only* signal (priority pairs color with a letter, urgency pairs color with text/icon), and all animations respect `prefers-reduced-motion`.

### 14.11 What this adds to the build plan

Folded into the existing phases rather than a separate phase — premium polish is designed in from the start, not bolted on at the end:

| Phase (from §11) | Design addition |
|---|---|
| 5 — Back office UI | Custom checkbox component, form sticky-nav, inline validation pattern |
| 6 — Client workspace | Timeline component (§14.3) — budget extra time here, it's the highest-effort visual piece |
| 7 — Dashboard | KPI count-up, card heat-map borders, section accordion motion |
| 9 — Settings & polish | Priority color tokens across all 5 themes, empty-state pass, reduced-motion QA, keyboard-nav pass |

---

## 15. Remaining question

Only one thing is still genuinely open:

**Sector labels.** The seed uses `Solar · Windmill · T&L · Chimney · Tower · Pipeline · Volumetric · Other`. You said to take the names from the software — the software calls them *Solar PV*, *Wind*, *T&D Lines*. I've seeded your wording (Solar / Windmill / T&L) since the module is independent and you named them that way. Say the word if you'd rather match the software's labels exactly, or if there are more sectors to add — either way it's a seed-row change, and admin can edit them in BD Settings afterwards.

Everything else is decided and ready to build.
