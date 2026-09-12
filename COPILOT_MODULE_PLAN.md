# Co-Pilot Role — Master End-to-End Implementation Plan (DB + Backend + Frontend + UI)

> **Status:** Single Unified Master Plan — Combines Database, Backend, Frontend, and UI Layouts.  
> **Migration File:** `backend/database/migrations/061_copilot_role.sql`  
> **Core Concept:** A Co-Pilot is a full operational crew member with **no software login** and **no email credentials**. They can be allocated to projects alongside Pilots and Drones, checked for scheduling conflicts, tracked in project teams/members, and managed from a dedicated Co-Pilots roster.

---

# SECTION 1: UI VISUAL DESIGNS & LAYOUTS

### 1.1 Project Detail — Resources Tab (`ProjectDetail.jsx`)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  FORMAL ALLOCATIONS                                                 [+ Allocate Resources]       │
│                                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 01 SEP 2026 → 05 SEP 2026  [PRIMARY]                                         [Edit] [Delete]│  │
│  │ ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐         │  │
│  │ │ 👤 Hari Prasad         │  │ 👥 Rahul Sharma        │  │ ✈️ 4T V1                │         │  │
│  │ │    PILOT (Blue badge)  │  │    CO-PILOT (Violet)   │  │    DRONE (Amber badge)  │         │  │
│  │ │ License: PL-123456     │  │ License: CP-987654     │  │ Model: Matrice 4T       │         │  │
│  │ │ Status:  active (green)│  │ Status:  active (green)│  │ Status: active (green)  │         │  │
│  │ │ Expiry:  25 Dec 2033   │  │ Expiry:  14 Aug 2030   │  │ Maint: 10 Oct 2026      │         │  │
│  │ └────────────────────────┘  └────────────────────────┘  └────────────────────────┘         │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                  │
│  TEAM PILOTS — project members, no date window                                       [+ Add Pilot]│
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐                              │
│  │ 👤 Hari Prasad (PL-123456)   │  │ 👤 Karan Mehta (PL-554433)   │                              │
│  │    Active                    │  │    Active                    │                              │
│  └──────────────────────────────┘  └──────────────────────────────┘                              │
│                                                                                                  │
│  TEAM CO-PILOTS — project crew, no date window                                    [+ Add Co-Pilot]│
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐                              │
│  │ 👥 Rahul Sharma (CP-987654)  │  │ 👥 Amit Verma (CP-112233)    │                              │
│  │    Active                    │  │    Active                    │                              │
│  └──────────────────────────────┘  └──────────────────────────────┘                              │
│                                                                                                  │
│  TEAM DRONES — project equipment, no date window                                     [+ Add Drone]│
│  ┌──────────────────────────────┐                                                                │
│  │ ✈️ 4T V1 (Matrice 4T)        │                                                                │
│  │    Active                    │                                                                │
│  └──────────────────────────────┘                                                                │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.2 "Allocate Resources" & "Edit Allocation" Modal

```
┌───────────────────────────────────────────────────────────┐
│ Allocate Resources                                    [X] │
├───────────────────────────────────────────────────────────┤
│ Pilot (optional)                                          │
│ [ 👤 Hari Prasad (Active) — PL-123456                  ▼ ]│
│                                                           │
│ Co-Pilot (optional)                                       │
│ [ 👥 Rahul Sharma (Active) — CP-987654                 ▼ ]│
│ ℹ️ Co-Pilot is available for selected dates              │
│                                                           │
│ Drone / Equipment (optional)                              │
│ [ ✈️ 4T V1 (Active) — Matrice 4T                       ▼ ]│
│                                                           │
│ Start Date                  End Date                      │
│ [ 2026-09-01             ]  [ 2026-09-05               ]  │
│                                                           │
│ Allocation Type                                           │
│ [  PRIMARY (Active)  ]   [  SECONDARY                  ]  │
│                                                           │
│                                    [ Cancel ] [ Allocate ]│
└───────────────────────────────────────────────────────────┘
```

---

### 1.3 Conflict Detection & Override Modal (Works for Co-Pilots, Pilots & Drones)

```
┌───────────────────────────────────────────────────────────┐
│ ⚠️ Resource Conflict Detected                         [X] │
├───────────────────────────────────────────────────────────┤
│ The following conflicts were detected for this window:    │
│                                                           │
│ • Co-Pilot Rahul Sharma: Already allocated to project     │
│   "Solar Survey Phase 2" (02 Sep 2026 → 06 Sep 2026)      │
│                                                           │
│ Override Reason (Required)                                │
│ [ Co-pilot is sharing standby duty across both sites... ] │
│                                                           │
│                      [ Cancel ] [ Override & Allocate ]   │
└───────────────────────────────────────────────────────────┘
```

---

### 1.4 Admin Users Page — Create User Modal (`Users.jsx`)

```
┌───────────────────────────────────────────────────────────┐
│ Grant New Access                                      [X] │
├───────────────────────────────────────────────────────────┤
│ Full Name *                 Email Address *               │
│ [ Rahul Sharma           ]  [ rahul.sharma@example.com ]  │
│                                                           │
│ System Role *               Phone Number                  │
│ [ Co-Pilot             ▼ ]  [ +91 9876543210           ]  │
│                                                           │
│ ┌── Co-Pilot Details ───────────────────────────────────┐ │
│ │ License Number            License Expiry              │ │
│ │ [ CP-987654            ]  [ 2030-08-14             ]  │ │
│ │                                                       │ │
│ │ Employee ID               Base Location               │ │
│ │ [ EMP-CP-042           ]  [ Ahmedabad              ]  │ │
│ │                                                       │ │
│ │ Per Day Rate (₹)          Contact Number              │ │
│ │ [ 4500                 ]  [ +91 9876543210         ]  │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ ℹ️ Co-pilot records have no login. No email will be sent. │
│                                                           │
│                                      [ Cancel ] [ Create ]│
└───────────────────────────────────────────────────────────┘
```

---

### 1.5 Sidebar Navigation (`Sidebar.jsx`)

```
OPERATIONS
  📂 Projects
  📊 Pipeline
  👥 Clients
  📅 Calendar

RESOURCES
  📍 Pilots
  👥 Co-Pilots        <-- NEW Navigation item (/resources/copilots)
  ✈️ Drones
  📆 Allocations
  📦 Assets
```

---

# SECTION 2: DATABASE SCHEMA & MIGRATION

### File: `backend/database/migrations/061_copilot_role.sql`

```sql
-- Migration: 061_copilot_role
-- Adds 'co_pilot' role, crew_role distinction, and copilot_id to allocations.

-- 1. Extend users.role check constraint to include 'co_pilot'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['admin', 'project_manager', 'pilot', 'super_admin', 'co_pilot']));

-- 2. Add crew_role to pilots table ('pilot' vs 'co_pilot')
-- Reusing the pilots table ensures full compatibility with profiles, documents, tracking & attendance
ALTER TABLE pilots ADD COLUMN IF NOT EXISTS crew_role TEXT
  CHECK (crew_role IN ('pilot', 'co_pilot')) DEFAULT 'pilot';

UPDATE pilots SET crew_role = 'pilot' WHERE crew_role IS NULL;
CREATE INDEX IF NOT EXISTS idx_pilots_crew_role ON pilots(crew_role);

-- 3. Add copilot_id to allocations table
-- Links to pilots table where crew_role = 'co_pilot'
ALTER TABLE allocations
  ADD COLUMN IF NOT EXISTS copilot_id UUID REFERENCES pilots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_copilot ON allocations(copilot_id);
```

---

# SECTION 3: BACKEND IMPLEMENTATION

### 3.1 App Constants (`backend/src/core/utils/constants.js`)
```javascript
ROLES: ['admin', 'project_manager', 'pilot', 'co_pilot'],
RESOURCE_TYPES: ['pilot', 'copilot', 'drone', 'all'],
```

### 3.2 Registration & Auth Lockout
1. **`src/domains/user/auth.validation.js`**:
   - `password` is not required when `role === 'co_pilot'`.
   - Bypasses password length/complexity validation for co-pilots.
2. **`src/domains/user/auth.service.js`**:
   - `register()`: When `role === 'co_pilot'` and no password provided, generates an unusable random 32-byte hash.
   - `login()`: Blocks co-pilots immediately before password check:
     ```javascript
     if (user.role === 'co_pilot') {
       throw Object.assign(
         new Error('This is a co-pilot crew record and does not have software access.'),
         { statusCode: 403 }
       );
     }
     ```
3. **`src/domains/user/auth.controller.js`**:
   - In `register()`, if `user.role === 'co_pilot'`, creates `pilots` row with `crew_role = 'co_pilot'` and immediately returns `201`, skipping `user_notification_prefs` seeding and `emailTriggers.onUserWelcome()`.
4. **`src/core/utils/sessionGuard.js`**:
   - Invalidate/reject live requests if user role in DB is `co_pilot`.
5. **`src/domains/user/password.service.js`**:
   - Rejects `forgotPassword()` for `co_pilot` with `"This email is not registered in our software"`.

### 3.3 Allocation & Conflict Engine (`src/domains/project/submodules/resources/allocation.service.js`)
1. **`createAllocation` & `updateAllocation`**:
   - Accepts `copilot_id` (`data.copilot_id || null`).
   - Acquires advisory locks: `_acquireResourceLocks(client, pilot_id, copilot_id, drone_id)`.
   - Validates at least one of (Pilot, Co-Pilot, Drone) is present.
   - Runs conflict check `_checkPilot(client, copilot_id, start_date, end_date, ...)` for Co-Pilot:
     - Overlapping allocation in other projects → `type: 'copilot'` conflict.
     - Calendar leave or training events → `type: 'copilot_leave'` / `'copilot_training'` conflict.
     - License expiry warnings.
   - Supports `force: true` and `override_reason` for Co-Pilot conflicts.
   - Saves `copilot_id` in `allocations`.
   - Auto-inserts allocated Co-Pilot to `project_members` for team tracking.
   - Skips email and in-app notifications for Co-Pilots.
2. **`getAllocations(projectId)`**:
   - Enriches formal allocations with Co-Pilot details:
     `cu.name AS copilot_name`, `cp.license_number AS copilot_license_number`, `cp.license_expiry AS copilot_license_expiry`, `cp.status AS copilot_status`.
   - Returns separate team co-pilots list for display in the Team Co-Pilots section.

### 3.4 Pilot Service (`src/domains/resource/pilot.service.js`)
- `createPilot()`: Accepts `crew_role` (`'pilot'` or `'co_pilot'`). Skips email if `crew_role === 'co_pilot'`.
- `getPilots({ crew_role, ... })`: Adds optional `crew_role` query filter.
- `getPilotById()`: Selects `crew_role`.
- `getAvailability()`: Checks availability for both Pilots and Co-Pilots.

---

# SECTION 4: FRONTEND IMPLEMENTATION

### 4.1 Constants & Routes (`frontend/src/utils/constants.js` & `AppRoutes.jsx`)
- **`ROLES`**: `ADMIN: 'admin'`, `PROJECT_MANAGER: 'project_manager'`, `PILOT: 'pilot'`, `CO_PILOT: 'co_pilot'`
- **`ROLE_LABELS`**: `co_pilot: 'Co-Pilot'`
- **`ROUTES`**: `COPILOTS: '/resources/copilots'`
- **`AppRoutes.jsx`**:
  - Adds `/resources/copilots` → `CoPilots.jsx`
  - Adds `/resources/copilots/:id` → `CoPilotDetail.jsx`

### 4.2 Sidebar Navigation (`frontend/src/components/layout/Sidebar.jsx`)
- Adds `Co-Pilots` link under the `Resources` group.

### 4.3 Project Details — Resources Tab (`frontend/src/pages/projects/ProjectDetail.jsx`)
1. **Formal Allocations Grid**:
   - 3-tile layout per card: **Pilot (Blue)** | **Co-Pilot (Violet)** | **Drone (Amber)**.
   - Empty placeholder if any is not assigned ("No Co-Pilot", "No Drone").
2. **Allocate / Edit Modal**:
   - Adds **Co-Pilot** dropdown with live availability check indicator (`PILOT_AVAIL`).
   - Supports saving `copilot_id`.
3. **Team Co-Pilots Section**:
   - Placed between *Team Pilots* and *Team Drones*.
   - Includes "+ Add Co-Pilot" modal to assign co-pilots to the project team.

### 4.4 Admin User Management (`frontend/src/pages/admin/Users.jsx`)
- Add `Co-Pilot` to role selector.
- Hides password input when `Co-Pilot` is selected.
- Shows notice: *"Co-pilot records have no login. No email will be sent."*
- Violet badge for `Co-Pilot` in users table.

### 4.5 Dedicated Co-Pilots Roster (`frontend/src/pages/resources/CoPilots.jsx` & `CoPilotDetail.jsx`)
- Dedicated roster page at `/resources/copilots` showing all Co-Pilots with search, status filters, and Add/Edit modal.
- Detail page showing Co-Pilot profile, license information, and project deployment history.
- `Pilots.jsx` filtered to show `crew_role === 'pilot'` only.

---

# SECTION 5: STEP-BY-STEP BUILD ORDER

| # | Step | Files Modified / Created | Verification |
|---|---|---|---|
| **1** | Database Migration | `backend/database/migrations/061_copilot_role.sql` | `\d pilots` shows `crew_role`; `\d allocations` shows `copilot_id` |
| **2** | Backend Auth & Security | `constants.js`, `auth.validation.js`, `auth.service.js`, `auth.controller.js`, `sessionGuard.js`, `password.service.js` | Create co-pilot (no email sent); login as co-pilot returns 403 |
| **3** | Allocation & Conflict Engine | `allocation.service.js`, `pilot.service.js`, `pilot.controller.js` | Allocate co-pilot with dates; conflict warning on double-booking |
| **4** | Frontend Constants & Routes | `constants.js`, `AppRoutes.jsx`, `Sidebar.jsx` | "Co-Pilots" in sidebar; routes working |
| **5** | ProjectDetail Resources UI | `ProjectDetail.jsx` | 3-tile formal cards, Co-Pilot select in modals, Team Co-Pilots section |
| **6** | Co-Pilots Roster & User Mgmt | `CoPilots.jsx`, `CoPilotDetail.jsx`, `Users.jsx`, `Pilots.jsx` | Dedicated Co-Pilots page and admin user creation tested end-to-end |

---

# SECTION 6: TEST & VERIFICATION CHECKLIST

- [ ] **Creation:** Register a Co-Pilot via Admin Users page → No welcome email sent, `pilots` row created with `crew_role = 'co_pilot'`.
- [ ] **Login Lockout:** Attempt login with Co-Pilot email → 403 Forbidden.
- [ ] **Password Reset Lockout:** Request forgot password for Co-Pilot → Rejected.
- [ ] **Formal Allocation:** Allocate Pilot + Co-Pilot + Drone together → 3-tile card appears on project resources tab.
- [ ] **Conflict Detection:** Attempt to allocate the same Co-Pilot to overlapping project dates → Conflict warning shown; override reason allows saving.
- [ ] **Team Co-Pilots:** Add Co-Pilot to project team without dates → Appears in Team Co-Pilots section.
- [ ] **Roster & Navigation:** Co-Pilots page accessible from Sidebar, displays co-pilot list and deployment history.
- [ ] **Pilots Roster Isolation:** Pilots page displays regular pilots only.
