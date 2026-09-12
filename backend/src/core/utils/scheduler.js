const cron   = require('node-cron');
const db     = require('../config/db');
const env    = require('../config/env');
const emailTriggers = require('../../domains/notification/emailTriggers.service');
const notif  = require('../../domains/notification/notification.service');
const dashboard = require('../../domains/dashboard/dashboard.service');
const socket = require('../socket/socket.gateway');
const EVENTS = require('../socket/socket.events');
const { formatDateIST } = require('./dateUtils');

// Lazy-load the report service to avoid circular deps at require-time
let _reportService = null;
const reportService = () => {
  if (!_reportService) _reportService = require('../../domains/reports/report.service');
  return _reportService;
};

// Weekly report cron task — replaced when admin changes settings
let _weeklyReportTask = null;

// DB-based startup guard — prevents the expiry check (and its emails) from
// re-running on every nodemon restart. Works without Redis. The check claims a
// 1-hour lease atomically: it only runs the startup check if the last recorded
// run was more than an hour ago.
const STARTUP_COOLDOWN_MIN = 60;

const _ensureStateTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS scheduler_state (
      key       TEXT PRIMARY KEY,
      last_run  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

/**
 * Atomically claim the startup run. Returns true only if no run happened within
 * the cooldown window. Uses an INSERT … ON CONFLICT … WHERE so two simultaneous
 * starts can't both win.
 */
const _claimRun = async (cooldownMin, key = 'expiry_check') => {
  try {
    await _ensureStateTable();
    const res = await db.query(
      `INSERT INTO scheduler_state (key, last_run)
       VALUES ($2, NOW())
       ON CONFLICT (key) DO UPDATE SET last_run = NOW()
       WHERE scheduler_state.last_run < NOW() - ($1 || ' minutes')::INTERVAL
       RETURNING key`,
      [String(cooldownMin), key]
    );
    return res.rows.length > 0; // a row returned ⇒ we won the lease
  } catch (e) {
    console.error('[Scheduler] Lease check failed, running anyway:', e.message);
    return true; // on error, fall back to running
  }
};

/**
 * Scans the database for upcoming expiry events and fires notifications/emails.
 */
const runExpiryChecks = async () => {
    console.log('[Scheduler] Running expiry and maintenance checks...');
    
    try {
        // 1. Drone Maintenance Alerts (Due in 7 days or less)
        const drones = await db.query(
            "SELECT id, name, serial_number, next_maintenance FROM drones WHERE deleted_at IS NULL AND next_maintenance <= NOW() + INTERVAL '7 days' AND status = 'active'"
        );
        
        if (drones.rows.length > 0) {
            const admins = await db.query("SELECT id FROM users WHERE role = 'admin'");
            for (const drone of drones.rows) {
                // In-app notification for all admins (deduped over 24h)
                for (const admin of admins.rows) {
                    await notif.createNotification({
                        user_id:     admin.id,
                        category:    'expiry',
                        title:       'Drone Maintenance Due',
                        message:     `Drone ${drone.serial_number} (${drone.name || 'Unit'}) is due for maintenance on ${formatDateIST(drone.next_maintenance)}.`,
                        dedupeHours: 24,
                        entity_type: 'drone',
                        entity_id:   drone.id,
                    });
                }
                // PRD §11.2 trigger #5 — email admins via queue (pref-aware)
                emailTriggers.onDroneMaintenanceDue({
                    droneId:         drone.id,
                    droneName:       drone.name,
                    serialNumber:    drone.serial_number,
                    maintenanceDate: formatDateIST(drone.next_maintenance),
                });
            }
        }

        // 2. Pilot License Expiry Alerts (Expiring in 30 days or less)
        const pilots = await db.query(`
            SELECT p.id, p.user_id, p.license_expiry, u.name, u.email 
            FROM pilots p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.deleted_at IS NULL 
            AND p.license_expiry <= NOW() + INTERVAL '30 days' 
            AND p.status = 'active'
        `);
        
        // Fetch admins once for license expiry in-app alerts
        const adminsList = await db.query("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL");

        for (const pilot of pilots.rows) {
            // In-app notification for the pilot (deduped over 24h)
            await notif.createNotification({
                user_id:     pilot.user_id,
                category:    'expiry',
                title:       'License Expiring Soon',
                message:     `Your drone pilot license expires on ${formatDateIST(pilot.license_expiry)}. Please ensure renewal documents are submitted.`,
                dedupeHours: 24,
                entity_type: 'pilot',
                entity_id:   pilot.id,
            });
            // In-app notification for ALL admins (deduped over 24h)
            for (const admin of adminsList.rows) {
                await notif.createNotification({
                    user_id:     admin.id,
                    category:    'expiry',
                    title:       'Pilot License Expiry Alert',
                    message:     `Pilot ${pilot.name}'s license expires on ${formatDateIST(pilot.license_expiry)}.`,
                    dedupeHours: 24,
                    entity_type: 'pilot',
                    entity_id:   pilot.id,
                });
            }
            // PRD §11.2 trigger #6 — email pilot + admins via queue (pref-aware)
            emailTriggers.onPilotLicenseExpiring({
                pilotUserId: pilot.user_id,
                pilotName:   pilot.name,
                pilotEmail:  pilot.email,
                expiryDate:  formatDateIST(pilot.license_expiry),
            });
        }
        
        console.log(`[Scheduler] Check complete. Drones: ${drones.rows.length}, Pilots: ${pilots.rows.length}`);

        // Broadcast scheduler alerts to all admin sockets
        if (drones.rows.length > 0) {
            try { socket.emitToRole('admin', EVENTS.SCHEDULER_ALERT, { type: 'drone_maintenance', count: drones.rows.length }); } catch (_) {}
        }
        if (pilots.rows.length > 0) {
            try { socket.emitToRole('admin', EVENTS.SCHEDULER_ALERT, { type: 'license_expiry', count: pilots.rows.length }); } catch (_) {}
        }

        // 3. Overdue project notifications (all users, deduped inside)
        await dashboard.triggerOverdueNotifications(null);
    } catch (err) {
        console.error('[Scheduler] Critical error during expiry checks:', err);
    }
};

/**
 * Run the expiry/maintenance sweep, but only if this process wins the shared
 * DB lease. This makes execution safe when MULTIPLE processes (API + worker)
 * both schedule the cron / fire the startup check — only one actually runs,
 * regardless of deployment topology. Restarts within the cooldown also skip.
 */
const runGuardedChecks = async (label) => {
    const won = await _claimRun(STARTUP_COOLDOWN_MIN);
    if (won) {
        console.log(`[Scheduler] ${label} — lease acquired, running checks...`);
        await runExpiryChecks();
    } else {
        console.log(`[Scheduler] ${label} — skipped (another run happened within ${STARTUP_COOLDOWN_MIN} min).`);
    }
};

/**
 * (Re)start the weekly report cron based on current DB settings.
 * Called at startup and whenever admin saves new report settings.
 * send_day: 0=Sun,1=Mon,...,6=Sat  send_hour_ist: 0-23 IST
 * IST = UTC+5:30, so UTC hour = (ist_hour + 18) % 24, minute = 30
 */
const scheduleWeeklyReport = async () => {
  try {
    const settings = await reportService().getSettings();
    if (_weeklyReportTask) { _weeklyReportTask.stop(); _weeklyReportTask = null; }
    if (!settings || !settings.enabled) {
      console.log('[Scheduler] Weekly report disabled.');
      return;
    }

    const istHour  = Number(settings.send_hour_ist);
    const utcHour  = (istHour + 18) % 24;     // IST = UTC+5:30, so -5:30 = +18:30 mod 24
    const utcMin   = 30;                        // always :30 to account for the :30 offset
    const dow      = Number(settings.send_day); // 0=Sun … 6=Sat (cron-compatible)

    const expr = `${utcMin} ${utcHour} * * ${dow}`;
    _weeklyReportTask = cron.schedule(expr, async () => {
      console.log('[Scheduler] Weekly report cron fired.');
      try { await reportService().sendReport(); }
      catch (e) { console.error('[Scheduler] Weekly report send error:', e.message); }
    });
    console.log(`[Scheduler] Weekly report scheduled: IST ${istHour}:30 every day-of-week ${dow} (cron: ${expr})`);
  } catch (e) {
    console.error('[Scheduler] Failed to schedule weekly report:', e.message);
  }
};

/**
 * Sends a weekly Saturday email reminder to all admin/super_admin users to fill attendance.
 */
const sendSaturdayAttendanceReminder = async () => {
  console.log('[Scheduler] Running Saturday attendance reminder to admins...');
  try {
    const adminsRes = await db.query(
      "SELECT email, name FROM users WHERE role IN ('admin', 'super_admin') AND deleted_at IS NULL"
    );
    const emailService = require('../../domains/notification/email.service');
    for (const admin of adminsRes.rows) {
      if (admin.email) {
        await emailService.sendEmail({
          to: admin.email,
          subject: 'Weekly Reminder: Fill Pilot Attendance',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #3b82f6; margin-top: 0;">Hello ${admin.name || 'Admin'},</h2>
              <p>This is a weekly reminder to update and fill the attendance records for the pilots in the Niyamak portal.</p>
              <p>Please ensure all logs for this week are complete and up to date by visiting the <strong>Pilot Attendance</strong> module.</p>
              <div style="margin: 25px 0;">
                <a href="${env.appUrl}/admin/attendance" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Go to Attendance Module</a>
              </div>
              <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">Thank you,<br/>Varuna Ops Team</p>
            </div>
          `
        });
      }
    }
    console.log(`[Scheduler] Sent attendance reminders to ${adminsRes.rows.length} administrators.`);
  } catch (err) {
    console.error('[Scheduler] Failed to send Saturday attendance reminder:', err);
  }
};

/**
 * BD module reminder sweep — its own lease key so it runs independently of
 * the expiry-check lease. Lazy-required to avoid a circular/startup-order
 * dependency (BD domain doesn't need to exist for the rest of the app to boot).
 */
const BD_SWEEP_COOLDOWN_MIN = 60;
let _bdReminders = null;
const bdReminders = () => {
  if (!_bdReminders) _bdReminders = require('../../domains/bd/bd.reminders.service');
  return _bdReminders;
};

const runGuardedBdSweep = async (label) => {
  const won = await _claimRun(BD_SWEEP_COOLDOWN_MIN, 'bd_reminder_sweep');
  if (won) {
    console.log(`[Scheduler] ${label} — lease acquired, running BD follow-up sweep...`);
    try { await bdReminders().runSweep(); }
    catch (e) { console.error('[Scheduler] BD sweep error:', e.message); }
  } else {
    console.log(`[Scheduler] ${label} — skipped (already ran within ${BD_SWEEP_COOLDOWN_MIN} min).`);
  }
};

const runGuardedBdWeeklySummary = async (label) => {
  const won = await _claimRun(BD_SWEEP_COOLDOWN_MIN, 'bd_weekly_summary');
  if (won) {
    console.log(`[Scheduler] ${label} — lease acquired, running BD weekly summary...`);
    try { await bdReminders().runWeeklySummary(); }
    catch (e) { console.error('[Scheduler] BD weekly summary error:', e.message); }
  } else {
    console.log(`[Scheduler] ${label} — skipped (already ran within ${BD_SWEEP_COOLDOWN_MIN} min).`);
  }
};

/**
 * Initializes the cron scheduler.
 *
 * Set DISABLE_SCHEDULER=true on a process that should NOT run the scheduler
 * (e.g. the API server when a dedicated worker process owns it). Even without
 * that flag, the shared DB lease prevents duplicate daily runs across processes.
 */
const init = () => {
    if (String(process.env.DISABLE_SCHEDULER).toLowerCase() === 'true') {
        console.log('[Scheduler] Disabled on this process (DISABLE_SCHEDULER=true).');
        return;
    }

    // Daily at 00:00 IST = 18:30 UTC. Guarded by the lease so two processes
    // firing the same minute cannot double-run.
    cron.schedule('30 18 * * *', () => runGuardedChecks('Daily cron'));

    // Saturday at 09:00 IST = 03:30 UTC (dow = 6)
    cron.schedule('30 3 * * 6', () => sendSaturdayAttendanceReminder());

    // BD follow-up digest — daily at 09:00 IST = 03:30 UTC (BD_MODULE_PLAN.md §8.1).
    cron.schedule('30 3 * * *', () => runGuardedBdSweep('BD reminder sweep'));

    // BD weekly summary — Monday 09:00 IST = 03:30 UTC (dow = 1), off by default via bd_settings.
    cron.schedule('30 3 * * 1', () => runGuardedBdWeeklySummary('BD weekly summary'));

    // Startup check — runs in all environments; same lease prevents re-firing
    // on nodemon restarts (dev) and rapid rolling deploys (prod). No Redis.
    db.whenReady
      .then(() => runGuardedChecks('Startup check'))
      .then(() => scheduleWeeklyReport())
      .catch(() => {});

    console.log('[Scheduler] Cron system initialized (Daily 00:00 IST / 18:30 UTC, Sat 09:00 IST, BD sweep 09:00 IST, BD summary Mon 09:00 IST).');
};

module.exports = { init, runExpiryChecks, scheduleWeeklyReport, sendSaturdayAttendanceReminder, runGuardedBdSweep, runGuardedBdWeeklySummary };
