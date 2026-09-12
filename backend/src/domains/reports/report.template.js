/**
 * report.template.js — Niyamak branded weekly operations report email.
 * Pure HTML with all styles inlined. Table-based layout for email client
 * compatibility. CSS bar charts rendered as colored <td> elements.
 * No JavaScript, no external resources.
 */

const C = {
  bg:        '#f1f5f9',
  card:      '#ffffff',
  header:    '#0f172a',
  headerBg:  '#0f172a',
  accent:    '#6366f1',
  accentMid: '#818cf8',
  text:      '#0f172a',
  sub:       '#64748b',
  border:    '#e2e8f0',
  success:   '#10b981',
  warning:   '#f59e0b',
  danger:    '#ef4444',
  info:      '#3b82f6',
  purple:    '#8b5cf6',
  muted:     '#94a3b8',
};

const statusColor = (s) => ({
  initiate:        C.muted,
  planned:         C.info,
  on_going:        C.warning,
  executed:        C.purple,
  post_processing: '#a855f7',
  complete:        C.success,
  cancelled:       C.danger,
}[s] || C.muted);

// HTML-escape any DB-sourced string before it is interpolated into the report.
// Project/client/pipeline names etc. are attacker-controllable by lower-priv users
// (e.g. a pilot can create a project) and this report is rendered as text/html to
// an admin (preview endpoint), so unescaped values are a stored-XSS vector.
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const badge = (text, color) =>
  `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;background:${color}22;color:${color};font-family:Arial,sans-serif">${esc(text)}</span>`;

const kpiBox = (label, value, sub, color) =>
  `<td width="25%" style="padding:6px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};border-radius:12px">
      <tr><td style="padding:18px 16px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.sub};font-family:Arial,sans-serif;margin-bottom:6px">${label}</div>
        <div style="font-size:28px;font-weight:900;color:${color || C.text};font-family:Arial,sans-serif;line-height:1">${value}</div>
        ${sub ? `<div style="font-size:11px;color:${C.sub};font-family:Arial,sans-serif;margin-top:4px">${sub}</div>` : ''}
      </td></tr>
    </table>
  </td>`;

const barRow = (label, count, pct, color) =>
  `<tr>
    <td style="font-size:12px;color:${C.sub};font-family:Arial,sans-serif;padding:5px 0;width:130px;white-space:nowrap">${label}</td>
    <td style="padding:5px 8px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:${Math.max(pct, 2)}%;background:${color};height:12px;border-radius:6px;transition:width 0.3s"></td>
          <td></td>
        </tr>
      </table>
    </td>
    <td style="font-size:12px;font-weight:700;color:${C.text};font-family:Arial,sans-serif;padding:5px 0;text-align:right;width:30px">${count}</td>
  </tr>`;

const sectionHeader = (icon, title) =>
  `<tr><td style="padding:28px 32px 12px">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:18px;padding-right:8px">${icon}</td>
        <td style="font-size:13px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:${C.text};font-family:Arial,sans-serif">${title}</td>
      </tr>
    </table>
    <div style="height:2px;background:${C.accent};width:40px;margin-top:8px;border-radius:1px"></div>
  </td></tr>`;

const dividerRow = () =>
  `<tr><td style="padding:0 32px"><div style="height:1px;background:${C.border}"></div></td></tr>`;

const noData = (msg) =>
  `<tr><td style="padding:12px 32px 24px;font-size:12px;color:${C.muted};font-family:Arial,sans-serif;font-style:italic">${msg}</td></tr>`;

exports.build = (data, frontendUrl = 'https://varunaat.in') => {
  const {
    generatedAt, weekRange, kpis,
    projectBars, pipelineBars,
    fleet, pilots,
    upcomingDeadlines, recentlyCompleted,
    maintenanceDue, licenseExpiring,
    topPipeline, projectCompleted, needsAttention,
  } = data;

  // ── Upcoming deadlines table rows ──────────────────────────────────────────
  const deadlineRows = upcomingDeadlines.length
    ? upcomingDeadlines.map(r => {
        const urgentColor = r.daysLeft <= 3 ? C.danger : r.daysLeft <= 7 ? C.warning : C.sub;
        return `<tr style="border-bottom:1px solid ${C.border}">
          <td style="padding:10px 16px 10px 0;font-size:12px;font-weight:700;color:${C.text};font-family:Arial,sans-serif;max-width:180px">${esc(r.name)}</td>
          <td style="padding:10px 16px 10px 0;font-size:12px;color:${C.sub};font-family:Arial,sans-serif">${esc(r.client)}</td>
          <td style="padding:10px 16px 10px 0;font-size:12px;color:${C.sub};font-family:Arial,sans-serif">${esc(r.state)}</td>
          <td style="padding:10px 16px 10px 0">${badge(String(r.status).replace(/_/g,' '), statusColor(r.status))}</td>
          <td style="padding:10px 0;font-size:12px;font-weight:700;color:${urgentColor};font-family:Arial,sans-serif;white-space:nowrap">${esc(r.endDate)} <span style="font-weight:400;font-size:11px">(${r.daysLeft}d)</span></td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" style="padding:12px 0;font-size:12px;color:#94a3b8;font-style:italic;font-family:Arial,sans-serif">No deadlines in the next 14 days</td></tr>';

  // ── Recently completed rows ──────────────────────────────────────────────
  const completedRows = recentlyCompleted.length
    ? recentlyCompleted.map(r =>
        `<tr style="border-bottom:1px solid ${C.border}">
          <td style="padding:10px 16px 10px 0;font-size:12px;font-weight:700;color:${C.text};font-family:Arial,sans-serif">${esc(r.name)}</td>
          <td style="padding:10px 16px 10px 0;font-size:12px;color:${C.sub};font-family:Arial,sans-serif">${esc(r.client)}</td>
          <td style="padding:10px 16px 10px 0;font-size:12px;color:${C.sub};font-family:Arial,sans-serif">${esc(r.state)}</td>
          <td style="padding:10px 0;font-size:12px;font-weight:700;color:${C.success};font-family:Arial,sans-serif">${esc(r.value)}</td>
        </tr>`
      ).join('')
    : '<tr><td colspan="4" style="padding:12px 0;font-size:12px;color:#94a3b8;font-style:italic;font-family:Arial,sans-serif">No projects completed this week</td></tr>';

  // ── Maintenance due rows ──────────────────────────────────────────────────
  const maintRows = maintenanceDue.length
    ? maintenanceDue.map(r => {
        const urgentColor = r.days <= 3 ? C.danger : r.days <= 7 ? C.warning : C.sub;
        return `<tr style="border-bottom:1px solid ${C.border}">
          <td style="padding:10px 16px 10px 0;font-size:12px;font-weight:700;color:${C.text};font-family:Arial,sans-serif">${esc(r.name)}</td>
          <td style="padding:10px 16px 10px 0;font-size:12px;color:${C.sub};font-family:Arial,sans-serif">${esc(r.model)}</td>
          <td style="padding:10px 16px 10px 0;font-size:12px;font-weight:700;color:${urgentColor};font-family:Arial,sans-serif;white-space:nowrap">${esc(r.date)} <span style="font-weight:400;font-size:11px">(${r.days}d)</span></td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="3" style="padding:12px 0;font-size:12px;color:#94a3b8;font-style:italic;font-family:Arial,sans-serif">No drone maintenance due in the next 30 days ✓</td></tr>';

  // ── License expiry rows ───────────────────────────────────────────────────
  const licenseRows = licenseExpiring.length
    ? licenseExpiring.map(r => {
        const urgentColor = r.days <= 7 ? C.danger : r.days <= 14 ? C.warning : C.sub;
        return `<tr style="border-bottom:1px solid ${C.border}">
          <td style="padding:10px 16px 10px 0;font-size:12px;font-weight:700;color:${C.text};font-family:Arial,sans-serif">${esc(r.name)}</td>
          <td style="padding:10px 0;font-size:12px;font-weight:700;color:${urgentColor};font-family:Arial,sans-serif;white-space:nowrap">${esc(r.date)} <span style="font-weight:400;font-size:11px">(${r.days}d)</span></td>
        </tr>`;
      }).join('')
    : null;

  // ── Top pipeline rows ─────────────────────────────────────────────────────
  const pipelineRows = topPipeline.length
    ? topPipeline.map(r =>
        `<tr style="border-bottom:1px solid ${C.border}">
          <td style="padding:10px 16px 10px 0;font-size:12px;font-weight:700;color:${C.text};font-family:Arial,sans-serif">${esc(r.name)}</td>
          <td style="padding:10px 16px 10px 0;font-size:12px;color:${C.sub};font-family:Arial,sans-serif">${esc(r.client)}</td>
          <td style="padding:10px 16px 10px 0">${badge(r.stage, C.accent)}</td>
          <td style="padding:10px 16px 10px 0;font-size:12px;font-weight:700;color:${C.accent};font-family:Arial,sans-serif">${esc(r.value)}</td>
          <td style="padding:10px 0;font-size:12px;color:${C.sub};font-family:Arial,sans-serif">${esc(r.probability)}</td>
        </tr>`
      ).join('')
    : '<tr><td colspan="5" style="padding:12px 0;font-size:12px;color:#94a3b8;font-style:italic;font-family:Arial,sans-serif">No open pipeline opportunities</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Niyamak — Weekly Operations Report</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
<tr><td align="center" style="padding:24px 16px">

  <!-- ═══ OUTER CARD ════════════════════════════════════════════════════════ -->
  <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%">

    <!-- ── HEADER ─────────────────────────────────────────────────────────── -->
    <tr><td style="background:${C.headerBg};border-radius:16px 16px 0 0;padding:32px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.03em;font-family:Arial,sans-serif">
              ◈ NIYAMAK
            </div>
            <div style="font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#94a3b8;margin-top:2px;font-family:Arial,sans-serif">
              Drone Operations Platform
            </div>
          </td>
          <td align="right">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6366f1;font-family:Arial,sans-serif">Weekly Report</div>
            <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin-top:2px;font-family:Arial,sans-serif">${weekRange}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;font-family:Arial,sans-serif">Generated ${generatedAt}</div>
          </td>
        </tr>
      </table>

      <!-- Sub-headline -->
      <div style="margin-top:20px;padding-top:20px;border-top:1px solid #1e293b">
        <div style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.02em;font-family:Arial,sans-serif">Weekly Operations Summary</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:4px;font-family:Arial,sans-serif">
          Your platform-wide operations digest — projects, pipeline, fleet, and compliance at a glance.
        </div>
      </div>
    </td></tr>

    <!-- ── ALERT STRIP (overdue / needs attention) ──────────────────────── -->
    ${(kpis.overdueProjects > 0 || needsAttention > 0) ? `
    <tr><td style="background:#fef2f2;border-left:4px solid ${C.danger};padding:12px 20px">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:18px;padding-right:8px">⚠️</td>
          <td style="font-size:12px;color:#991b1b;font-family:Arial,sans-serif">
            ${kpis.overdueProjects > 0 ? `<strong>${kpis.overdueProjects} project${kpis.overdueProjects>1?'s':''} overdue</strong> — past their end date and not yet completed.` : ''}
            ${kpis.overdueProjects > 0 && needsAttention > 0 ? ' · ' : ''}
            ${needsAttention > 0 ? `<strong>${needsAttention} project${needsAttention>1?'s':''} need attention</strong> — converted from pipeline but missing core details.` : ''}
          </td>
        </tr>
      </table>
    </td></tr>` : ''}

    <!-- ── MAIN CONTENT CARD ────────────────────────────────────────────── -->
    <tr><td style="background:${C.card};border-radius:0 0 16px 16px;overflow:hidden">

      <!-- KPI Strip -->
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 24px 12px">
        <tr>
          ${kpiBox('Active Projects', kpis.activeProjects, `${kpis.overdueProjects > 0 ? `⚠ ${kpis.overdueProjects} overdue` : 'All on track'}`, kpis.overdueProjects > 0 ? C.danger : C.success)}
          ${kpiBox('Pipeline Open', kpis.pipelineOpen, kpis.pipelineValue, C.accent)}
          ${kpiBox('Drone Fleet', kpis.activeDrones + ' active', `of ${fleet.total} total`, C.info)}
          ${kpiBox('Pilots', kpis.activePilots + ' active', `of ${pilots.total} total`, C.success)}
        </tr>
      </table>

      <!-- Revenue strip -->
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 32px 8px">
        <tr>
          <td style="background:#f8fafc;border:1px solid ${C.border};border-radius:10px;padding:14px 20px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.sub};font-family:Arial,sans-serif">Active Project Value</div>
                  <div style="font-size:22px;font-weight:900;color:${C.text};font-family:Arial,sans-serif;margin-top:2px">${kpis.activeValue}</div>
                </td>
                <td width="1" style="background:${C.border};margin:0 20px">&nbsp;</td>
                <td style="padding-left:24px">
                  <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.sub};font-family:Arial,sans-serif">Open Pipeline Value</div>
                  <div style="font-size:22px;font-weight:900;color:${C.accent};font-family:Arial,sans-serif;margin-top:2px">${kpis.pipelineValue}</div>
                </td>
                <td width="1" style="background:${C.border}">&nbsp;</td>
                <td style="padding-left:24px">
                  <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.sub};font-family:Arial,sans-serif">Won (Last 30 Days)</div>
                  <div style="font-size:22px;font-weight:900;color:${C.success};font-family:Arial,sans-serif;margin-top:2px">${kpis.wonValue30d}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${dividerRow()}

      <!-- Project Status Breakdown -->
      ${sectionHeader('📊', 'Project Status Breakdown')}
      <tr><td style="padding:0 32px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${projectBars.map(b => barRow(b.label, b.count, b.pct, b.color)).join('')}
          <tr>
            <td style="font-size:12px;color:${C.sub};font-family:Arial,sans-serif;padding:5px 0">Completed</td>
            <td style="padding:5px 8px">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="width:${Math.round((projectCompleted / Math.max(1,projectCompleted + kpis.activeProjects))*100)}%;background:${C.success};height:12px;border-radius:6px"></td>
                <td></td>
              </tr></table>
            </td>
            <td style="font-size:12px;font-weight:700;color:${C.text};font-family:Arial,sans-serif;text-align:right;width:30px">${projectCompleted}</td>
          </tr>
        </table>
      </td></tr>

      ${dividerRow()}

      <!-- Pipeline Funnel -->
      ${sectionHeader('🔭', 'Pipeline Funnel')}
      <tr><td style="padding:0 32px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${pipelineBars.map(b => barRow(b.label, b.count, b.pct, b.color)).join('')}
        </table>
      </td></tr>

      ${dividerRow()}

      <!-- Upcoming Deadlines -->
      ${sectionHeader('📅', 'Upcoming Deadlines (Next 14 Days)')}
      <tr><td style="padding:0 32px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="border-bottom:1px solid ${C.border}">
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Project</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Client</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">State</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Status</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Deadline</td>
          </tr>
          ${deadlineRows}
        </table>
      </td></tr>

      ${dividerRow()}

      <!-- Recently Completed -->
      ${sectionHeader('✅', 'Completed This Week')}
      <tr><td style="padding:0 32px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="border-bottom:1px solid ${C.border}">
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Project</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Client</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">State</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Value</td>
          </tr>
          ${completedRows}
        </table>
      </td></tr>

      ${dividerRow()}

      <!-- Drone Maintenance -->
      ${sectionHeader('🔧', 'Drone Maintenance Due (Next 30 Days)')}
      <tr><td style="padding:0 32px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="border-bottom:1px solid ${C.border}">
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Drone</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Model</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Due Date</td>
          </tr>
          ${maintRows}
        </table>
      </td></tr>

      <!-- Pilot Licenses (only if any expiring) -->
      ${licenseExpiring.length > 0 ? `
      ${dividerRow()}
      ${sectionHeader('🪪', 'Pilot Licenses Expiring (Next 30 Days)')}
      <tr><td style="padding:0 32px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="border-bottom:1px solid ${C.border}">
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Pilot</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Expiry Date</td>
          </tr>
          ${licenseRows}
        </table>
      </td></tr>` : ''}

      ${dividerRow()}

      <!-- Top Pipeline Opportunities -->
      ${sectionHeader('💼', 'Top Pipeline Opportunities')}
      <tr><td style="padding:0 32px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="border-bottom:1px solid ${C.border}">
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Opportunity</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Client</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Stage</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Value</td>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};font-family:Arial,sans-serif;padding-bottom:8px">Win%</td>
          </tr>
          ${pipelineRows}
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="padding:8px 32px 32px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid ${C.border};border-radius:12px;padding:20px">
          <tr>
            <td style="font-size:12px;color:${C.sub};font-family:Arial,sans-serif">
              View the full dashboard for interactive charts, project details, and real-time updates.
            </td>
            <td align="right" style="white-space:nowrap;padding-left:16px">
              <a href="${frontendUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:10px 20px;border-radius:8px;font-family:Arial,sans-serif;letter-spacing:0.03em">
                Open Dashboard →
              </a>
            </td>
          </tr>
        </table>
      </td></tr>

    </td></tr>
    <!-- END MAIN CARD -->

    <!-- ── FOOTER ──────────────────────────────────────────────────────────── -->
    <tr><td style="padding:20px 0;text-align:center">
      <div style="font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;line-height:1.8">
        <strong style="color:#64748b">Niyamak — Drone Operations Platform</strong><br/>
        This report was automatically generated on ${generatedAt}.<br/>
        <a href="${frontendUrl}/admin/reports" style="color:#6366f1;text-decoration:none">Manage report settings</a>
        &nbsp;·&nbsp;
        <a href="${frontendUrl}/admin/reports" style="color:#6366f1;text-decoration:none">Unsubscribe</a>
      </div>
    </td></tr>

  </table>
  <!-- END OUTER CARD -->

</td></tr>
</table>
</body>
</html>`;
};

/** Plain-text fallback for email clients that don't render HTML */
exports.buildText = (data) => {
  const { weekRange, kpis, upcomingDeadlines, recentlyCompleted, maintenanceDue } = data;
  const lines = [
    'NIYAMAK — Weekly Operations Report',
    `Week: ${weekRange}`,
    '='.repeat(50),
    '',
    'KEY METRICS',
    `  Active Projects : ${kpis.activeProjects}  (${kpis.overdueProjects} overdue)`,
    `  Pipeline Open   : ${kpis.pipelineOpen}  (${kpis.pipelineValue})`,
    `  Active Drones   : ${kpis.activeDrones}`,
    `  Active Pilots   : ${kpis.activePilots}`,
    '',
    'UPCOMING DEADLINES (next 14 days)',
    ...upcomingDeadlines.map(r => `  ${r.endDate} (${r.daysLeft}d) — ${r.name} · ${r.client} · ${r.status}`),
    upcomingDeadlines.length === 0 ? '  None' : '',
    '',
    'COMPLETED THIS WEEK',
    ...recentlyCompleted.map(r => `  ${r.name} · ${r.client} · ${r.value}`),
    recentlyCompleted.length === 0 ? '  None' : '',
    '',
    'DRONE MAINTENANCE DUE (next 30 days)',
    ...maintenanceDue.map(r => `  ${r.date} (${r.days}d) — ${r.name} · ${r.model}`),
    maintenanceDue.length === 0 ? '  None' : '',
    '',
    '─'.repeat(50),
    `Report generated ${data.generatedAt} · Niyamak`,
  ];
  return lines.join('\n');
};
