/**
 * report.data.js — gathers all metrics needed for the weekly report email.
 * All queries use a single DB pool call; returns a structured data object
 * that the template can render without any additional async work.
 */
const db = require('../../core/config/db');

const fmtINR = (n) => {
  const num = Number(n || 0);
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(1)}Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(1)}L`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysFromNow = (d) => {
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / 86400000);
};

exports.gather = async () => {
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
  const weekEnd   = now;

  const [
    projectStats,
    pipelineStats,
    upcomingDeadlines,
    recentlyCompleted,
    maintenanceDue,
    licenseExpiring,
    fleetStats,
    pilotStats,
    topPipeline,
  ] = await Promise.all([
    // 1. Project status breakdown
    db.query(`
      SELECT
        COUNT(*)                                                    AS total,
        COUNT(*) FILTER (WHERE status='initiate')                  AS initiate,
        COUNT(*) FILTER (WHERE status='planned')                   AS planned,
        COUNT(*) FILTER (WHERE status='on_going')                  AS on_going,
        COUNT(*) FILTER (WHERE status='executed')                  AS executed,
        COUNT(*) FILTER (WHERE status='post_processing')           AS post_processing,
        COUNT(*) FILTER (WHERE status='complete')                  AS complete,
        COUNT(*) FILTER (WHERE status='cancelled')                 AS cancelled,
        COUNT(*) FILTER (WHERE end_date < CURRENT_DATE
          AND status NOT IN ('complete','cancelled'))              AS overdue,
        COUNT(*) FILTER (WHERE needs_attention=TRUE
          AND status NOT IN ('complete','cancelled'))              AS needs_attention,
        COALESCE(SUM(project_value) FILTER (
          WHERE status NOT IN ('complete','cancelled')), 0)        AS active_value,
        COALESCE(SUM(project_value) FILTER (
          WHERE status='complete'
          AND updated_at >= NOW() - INTERVAL '30 days'), 0)       AS completed_value_30d
      FROM projects
      WHERE deleted_at IS NULL
    `),

    // 2. Pipeline stage breakdown
    db.query(`
      SELECT
        COUNT(*)                                                    AS total,
        COUNT(*) FILTER (WHERE stage='inquiry')                    AS inquiry,
        COUNT(*) FILTER (WHERE stage='site_visit')                 AS site_visit,
        COUNT(*) FILTER (WHERE stage='proposal')                   AS proposal,
        COUNT(*) FILTER (WHERE stage='negotiation')                AS negotiation,
        COUNT(*) FILTER (WHERE stage='won')                        AS won,
        COUNT(*) FILTER (WHERE stage='lost')                       AS lost,
        COALESCE(SUM(estimated_value) FILTER (
          WHERE stage NOT IN ('won','lost')), 0)                   AS active_pipeline_value,
        COALESCE(SUM(estimated_value) FILTER (
          WHERE stage='won'
          AND updated_at >= NOW() - INTERVAL '30 days'), 0)       AS won_value_30d
      FROM pipeline
      WHERE converted_project_id IS NULL AND stage != 'cancelled'
    `),

    // 3. Projects ending in next 14 days (non-terminal)
    db.query(`
      SELECT p.id, p.name, p.status, p.end_date, p.client_name, p.state
      FROM projects p
      WHERE p.deleted_at IS NULL
        AND p.status NOT IN ('complete','cancelled')
        AND p.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
      ORDER BY p.end_date ASC
      LIMIT 10
    `),

    // 4. Projects completed in the last 7 days
    db.query(`
      SELECT p.name, p.client_name, p.end_date, p.project_value, p.state
      FROM projects p
      WHERE p.deleted_at IS NULL
        AND p.status = 'complete'
        AND p.updated_at >= NOW() - INTERVAL '7 days'
      ORDER BY p.updated_at DESC
      LIMIT 5
    `),

    // 5. Drone maintenance due in next 30 days
    db.query(`
      SELECT name, serial_number, model, next_maintenance, status
      FROM drones
      WHERE deleted_at IS NULL
        AND next_maintenance IS NOT NULL
        AND next_maintenance <= NOW() + INTERVAL '30 days'
        AND next_maintenance >= CURRENT_DATE
      ORDER BY next_maintenance ASC
      LIMIT 8
    `),

    // 6. Pilot licenses expiring in next 30 days
    db.query(`
      SELECT u.name, p.license_expiry, p.status
      FROM pilots p
      JOIN users u ON p.user_id = u.id
      WHERE p.deleted_at IS NULL
        AND p.license_expiry IS NOT NULL
        AND p.license_expiry <= NOW() + INTERVAL '30 days'
        AND p.license_expiry >= CURRENT_DATE
      ORDER BY p.license_expiry ASC
      LIMIT 8
    `),

    // 7. Fleet stats
    db.query(`
      SELECT
        COUNT(*)                                                AS total,
        COUNT(*) FILTER (WHERE status='active')                AS active,
        COUNT(*) FILTER (WHERE status='maintenance')           AS in_maintenance,
        COUNT(*) FILTER (WHERE status='offline')               AS offline
      FROM drones WHERE deleted_at IS NULL
    `),

    // 8. Pilot stats
    db.query(`
      SELECT
        COUNT(*)                                                AS total,
        COUNT(*) FILTER (WHERE status='active')                AS active,
        COUNT(*) FILTER (WHERE status='inactive')              AS inactive
      FROM pilots WHERE deleted_at IS NULL
    `),

    // 9. Top 5 pipeline opportunities by estimated value
    db.query(`
      SELECT name, client_name, stage, estimated_value, win_probability, state
      FROM pipeline
      WHERE converted_project_id IS NULL
        AND stage NOT IN ('won','lost','cancelled')
        AND estimated_value IS NOT NULL
      ORDER BY estimated_value DESC
      LIMIT 5
    `),
  ]);

  const ps  = projectStats.rows[0];
  const pip = pipelineStats.rows[0];
  const fl  = fleetStats.rows[0];
  const pi  = pilotStats.rows[0];

  // Build bar-chart data for project statuses
  const activeStatuses = [
    { label: 'On Going',        key: 'on_going',        color: '#f59e0b' },
    { label: 'Executed',        key: 'executed',        color: '#6366f1' },
    { label: 'Post Processing', key: 'post_processing', color: '#8b5cf6' },
    { label: 'Planned',         key: 'planned',         color: '#3b82f6' },
    { label: 'Initiate',        key: 'initiate',        color: '#94a3b8' },
  ];
  const maxActiveCount = Math.max(1, ...activeStatuses.map(s => Number(ps[s.key] || 0)));

  // Pipeline funnel
  const pipelineStages = [
    { label: 'Inquiry',     key: 'inquiry',     color: '#94a3b8' },
    { label: 'Site Visit',  key: 'site_visit',  color: '#60a5fa' },
    { label: 'Proposal',    key: 'proposal',    color: '#6366f1' },
    { label: 'Negotiation', key: 'negotiation', color: '#f59e0b' },
  ];
  const maxPipelineCount = Math.max(1, ...pipelineStages.map(s => Number(pip[s.key] || 0)));

  return {
    generatedAt: fmtDate(now),
    weekRange: `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`,

    // KPIs
    kpis: {
      activeProjects:   Number(ps.total) - Number(ps.complete) - Number(ps.cancelled),
      overdueProjects:  Number(ps.overdue),
      pipelineOpen:     Number(pip.total),
      activeDrones:     Number(fl.active),
      activePilots:     Number(pi.active),
      activeValue:      fmtINR(ps.active_value),
      pipelineValue:    fmtINR(pip.active_pipeline_value),
      wonValue30d:      fmtINR(pip.won_value_30d),
    },

    // Project status bars
    projectBars: activeStatuses.map(s => ({
      label: s.label,
      color: s.color,
      count: Number(ps[s.key] || 0),
      pct:   Math.round((Number(ps[s.key] || 0) / maxActiveCount) * 100),
    })),
    projectCompleted: Number(ps.complete),
    needsAttention:   Number(ps.needs_attention),

    // Pipeline funnel bars
    pipelineBars: pipelineStages.map(s => ({
      label: s.label,
      color: s.color,
      count: Number(pip[s.key] || 0),
      pct:   Math.round((Number(pip[s.key] || 0) / maxPipelineCount) * 100),
    })),

    // Fleet
    fleet: {
      total:         Number(fl.total),
      active:        Number(fl.active),
      inMaintenance: Number(fl.in_maintenance),
      offline:       Number(fl.offline),
    },
    pilots: {
      total:    Number(pi.total),
      active:   Number(pi.active),
      inactive: Number(pi.inactive),
    },

    // Lists
    upcomingDeadlines: upcomingDeadlines.rows.map(r => ({
      name:       r.name,
      client:     r.client_name || '—',
      status:     r.status,
      endDate:    fmtDate(r.end_date),
      daysLeft:   daysFromNow(r.end_date),
      state:      r.state || '—',
    })),
    recentlyCompleted: recentlyCompleted.rows.map(r => ({
      name:   r.name,
      client: r.client_name || '—',
      date:   fmtDate(r.end_date),
      value:  fmtINR(r.project_value),
      state:  r.state || '—',
    })),
    maintenanceDue: maintenanceDue.rows.map(r => ({
      name:   r.name || r.serial_number,
      model:  r.model || '—',
      date:   fmtDate(r.next_maintenance),
      days:   daysFromNow(r.next_maintenance),
      status: r.status,
    })),
    licenseExpiring: licenseExpiring.rows.map(r => ({
      name:  r.name,
      date:  fmtDate(r.license_expiry),
      days:  daysFromNow(r.license_expiry),
    })),
    topPipeline: topPipeline.rows.map(r => ({
      name:        r.name,
      client:      r.client_name || '—',
      stage:       (r.stage || '').replace(/_/g, ' '),
      value:       fmtINR(r.estimated_value),
      probability: r.win_probability ? `${r.win_probability}%` : '—',
    })),
  };
};
