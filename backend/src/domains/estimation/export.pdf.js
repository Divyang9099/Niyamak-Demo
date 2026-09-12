/**
 * Premium PDF renderer for estimation exports.
 *
 * PRESENTATION LAYER ONLY — receives pre-computed figures from
 * export.service.js (buildBreakdown / directComponents) and draws them.
 * No cost logic, no formulas, no recalculation lives here.
 *
 * Design language: white consulting-grade pages, navy/amber brand system,
 * vector charts (donut, waterfall, horizontal bars), consistent chrome.
 */

const fs     = require('fs');
const PDFDoc = require('pdfkit');
const { formatDateIST } = require('../../core/utils/dateUtils');

// ── Brand system ──────────────────────────────────────────────────────────────
const NAVY   = '#0f2a4a';
const BLUE   = '#2563eb';
const SKY    = '#eff6ff';
const AMBER  = '#f59e0b';
const AMBERD = '#b45309';
const GREEN  = '#059669';
const VIOLET = '#7c3aed';
const RED    = '#dc2626';
const INK    = '#16233b';
const SLATE  = '#475569';
const MUTED  = '#94a3b8';
const LINE   = '#e2e8f0';
const FAINT  = '#f8fafc';
const WHITE  = '#ffffff';
const PALETTE = [BLUE, AMBER, GREEN, VIOLET, RED, '#0891b2', '#ea580c', '#64748b', '#65a30d', '#db2777'];

const COMPANY  = 'VARUNA NEXUS';
const TAGLINE  = 'Advanced Drone Operational Intelligence';
const WEBSITE  = 'varuna-nexus.com';
const EMAIL    = 'operations@varuna-nexus.com';

const SERVICES = [
  { name: 'Solar PV Inspection',        desc: 'Thermal & RGB module-level defect detection for utility-scale plants.' },
  { name: 'Wind Turbine Inspection',    desc: 'Blade-surface imaging and structural assessment without shutdowns.' },
  { name: 'Transmission Line Survey',   desc: 'Corridor mapping, tower audits and right-of-way encroachment review.' },
  { name: 'Pipeline Inspection',        desc: 'Linear-asset patrol, leak indication and corridor change detection.' },
  { name: 'Volumetric Survey',          desc: 'Stockpile volumetrics with survey-grade point clouds and DEMs.' },
  { name: 'Asset Mapping & Analytics',  desc: 'Digital-twin ready orthomosaics, GIS layers and AI-driven analytics.' },
];

const DELIVERABLE_DEFAULTS = {
  solar_pv:   ['Thermal Orthomosaic', 'RGB Orthomosaic', 'Module Defect Analytics', 'Asset Mapping (GIS)', 'Inspection Report', 'Raw Flight Data'],
  wind:       ['Blade RGB Imagery', 'Thermal Imagery', 'Defect Analytics', 'Per-Turbine Report', 'Inspection Summary', 'Raw Flight Data'],
  td_lines:   ['Corridor Orthomosaic', 'Point Cloud (LiDAR)', 'Tower Inspection Imagery', 'Encroachment Analytics', 'Inspection Report', 'Raw Flight Data'],
  tower:      ['RGB Imagery', 'Point Cloud', 'Structural Defect Analytics', 'Asset Condition Report', 'Inspection Report', 'Raw Flight Data'],
  pipeline:   ['Corridor Mapping', 'RGB Imagery', 'Encroachment Analytics', 'Anomaly Register', 'Inspection Report', 'Raw Flight Data'],
  volumetric: ['Survey-Grade Point Cloud', 'DEM / DSM', 'Volumetric Computation', 'Orthomosaic', 'Survey Report', 'Raw Flight Data'],
};

const ASSUMPTIONS = [
  'Flight operations are subject to favourable weather conditions (wind < 10 m/s, no precipitation, adequate visibility).',
  'Client will provide unhindered site access, local liaison and any plant-specific safety inductions required.',
  'All required DGCA permissions and airspace clearances will be processed prior to mobilization.',
  'Site is ready for survey — panels/assets energised or accessible as required by the inspection methodology.',
  'Stable power supply (or generator access) is available at site for battery charging operations.',
  'Mobile network or client-provided connectivity is available for daily data synchronisation where applicable.',
  'Quoted effort is based on the scope parameters stated in this document; material scope changes are re-estimated.',
];

const CLIENT_SCOPE = [
  'Site access permissions, gate passes and escort arrangements (where mandated).',
  'Plant shutdown windows, if required by the inspection methodology.',
  'Local statutory or land-owner permissions specific to the site.',
  'A single point of contact for field coordination during the deployment window.',
];

const TERMS = [
  { t: 'Validity',        d: 'This estimation is valid for 30 days from the date of issue. Pricing thereafter is subject to reconfirmation.' },
  { t: 'Mobilization',    d: 'Deployment requires a minimum of 7 days’ written notice following commercial confirmation.' },
  { t: 'Site Access',     d: 'Client shall ensure necessary permissions, access and safe working conditions for drone operations.' },
  { t: 'Data Delivery',   d: 'Final deliverables are published to the Niyamak portal within 5–7 business days of flight completion.' },
  { t: 'Payment',         d: '50% advance with purchase order; balance due on delivery of final data and reports.' },
  { t: 'Weather & Force Majeure', d: 'Flight schedules are subject to weather and regulatory windows; standby days beyond control are mutually settled.' },
  { t: 'Regulatory Compliance',   d: 'All operations are conducted under current DGCA UAS Rules with certified pilots and type-approved equipment.' },
  { t: 'Confidentiality', d: 'All site data, imagery and analytics remain confidential and are shared only with authorised client personnel.' },
];

const TIMELINE = [
  { label: 'Mobilization',     sub: 'Team & equipment to site' },
  { label: 'Field Operations', sub: null }, // sub filled with actual flight days
  { label: 'Data Processing',  sub: 'Photogrammetry & analytics' },
  { label: 'QA Review',        sub: 'Internal quality gates' },
  { label: 'Report Generation',sub: 'Findings & documentation' },
  { label: 'Client Delivery',  sub: 'Portal publish & handover' },
];

// ── Renderer ──────────────────────────────────────────────────────────────────
/**
 * @param {object} p
 * @param {object} p.est       estimation row (client_name, project_type, id, created_at, items)
 * @param {object} p.inputs    details.inputs
 * @param {object} p.bd        result of buildBreakdown() — figures only, never recomputed here
 * @param {Array}  p.comps     result of directComponents(bd)
 * @param {Function} p.fmt     INR formatter
 * @param {Function} p.pct     percent formatter
 * @param {Function} p.safe    number coercion
 * @param {string}  p.logoPath
 * @returns {Promise<Buffer>}
 */
exports.renderPremiumPDF = ({ est, inputs, bd, comps, fmt, pct, safe, logoPath }) => {
  const REF     = `EST-${(est.id || '').slice(0, 8).toUpperCase()}`;
  const SERVICE = (est.project_type || 'General').replace(/_/g, ' ').toUpperCase();
  const CLIENT  = est.client_name || 'Valued Client';
  const DATE    = formatDateIST(est.created_at);

  const scopeLine = () => {
    const parts = [];
    if (inputs.mw)         parts.push(`${inputs.mw} MWp`);
    if (inputs.km)         parts.push(`${inputs.km} km`);
    if (inputs.turbines)   parts.push(`${inputs.turbines} turbine(s)`);
    if (inputs.towers)     parts.push(`${inputs.towers} tower(s)`);
    if (inputs.stockpiles) parts.push(`${inputs.stockpiles} stockpile(s)`);
    return parts.join('  ·  ') || '—';
  };

  const deliverables = bd.deliverableBreakdown.length > 0
    ? bd.deliverableBreakdown.map(d => ({ label: d.label || d.key, qty: d.quantity }))
    : (DELIVERABLE_DEFAULTS[est.project_type] || DELIVERABLE_DEFAULTS.solar_pv).map(label => ({ label, qty: null }));

  return new Promise((resolve, reject) => {
    const doc = new PDFDoc({
      size: 'A4', margin: 0, bufferPages: true,
      info: { Title: `Project Cost Estimation — ${CLIENT}`, Author: COMPANY, Subject: REF },
    });
    const chunks = [];
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width, H = doc.page.height;
    const M  = 52;
    const CW = W - M * 2;
    const logoExists = logoPath && fs.existsSync(logoPath);

    // ── primitives ───────────────────────────────────────────────────────────
    const hr = (y, x1 = M, x2 = W - M, color = LINE, w = 0.7) => {
      doc.moveTo(x1, y).lineTo(x2, y).lineWidth(w).strokeColor(color).stroke();
    };

    const label = (txt, x, y, opts = {}) => {
      doc.font('Helvetica-Bold').fontSize(opts.size || 6.5).fillColor(opts.color || MUTED)
         .text(String(txt).toUpperCase(), x, y, { characterSpacing: 1.1, ...opts.text });
    };

    // Content-page chrome. Returns the y where content starts.
    const chrome = (section) => {
      doc.rect(0, 0, W, 4).fill(NAVY);
      if (logoExists) doc.image(logoPath, M, 17, { width: 24, height: 24 });
      const tx = logoExists ? M + 32 : M;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(COMPANY, tx, 19);
      doc.font('Helvetica').fontSize(6).fillColor(MUTED)
         .text(TAGLINE.toUpperCase(), tx, 31, { characterSpacing: 0.8 });
      doc.font('Helvetica-Bold').fontSize(7).fillColor(SLATE)
         .text(section.toUpperCase(), M, 24, { width: CW, align: 'right', characterSpacing: 1.2 });
      hr(50);
      return 70;
    };

    const sectionTitle = (title, y, sub) => {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text(title, M, y);
      doc.rect(M, y + 22, 30, 2.5).fill(AMBER);
      if (sub) {
        doc.font('Helvetica').fontSize(8.5).fillColor(SLATE).text(sub, M, y + 32, { width: CW });
        return y + 50;
      }
      return y + 38;
    };

    const subTitle = (title, y) => {
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(title, M, y);
      hr(y + 15, M, W - M, LINE, 0.7);
      return y + 24;
    };

    // KPI card with colored top accent
    const kpiCard = (x, y, w, h, accent, lbl, value, sub) => {
      doc.roundedRect(x, y, w, h, 5).fill(WHITE);
      doc.roundedRect(x, y, w, h, 5).lineWidth(0.8).strokeColor(LINE).stroke();
      doc.rect(x, y, w, 3).fill(accent);
      label(lbl, x + 10, y + 12);
      doc.font('Helvetica-Bold').fontSize(12.5).fillColor(INK)
         .text(value, x + 10, y + 24, { width: w - 20, lineBreak: false });
      if (sub) doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
         .text(sub, x + 10, y + 41, { width: w - 20, lineBreak: false });
    };

    const polar = (cx, cy, r, angDeg) => {
      const a = (angDeg - 90) * Math.PI / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const donutSlice = (cx, cy, R, r, a0, a1, color) => {
      const sweep = a1 - a0;
      if (sweep <= 0.2) return;
      if (sweep >= 359.8) {
        donutSlice(cx, cy, R, r, a0, a0 + 180, color);
        donutSlice(cx, cy, R, r, a0 + 180, a0 + 360, color);
        return;
      }
      const large = sweep > 180 ? 1 : 0;
      const [x1, y1] = polar(cx, cy, R, a0);
      const [x2, y2] = polar(cx, cy, R, a1);
      const [x3, y3] = polar(cx, cy, r, a1);
      const [x4, y4] = polar(cx, cy, r, a0);
      doc.path(`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`).fill(color);
    };

    // Subtle background motif — concentric rings, very low opacity
    const motif = (cx, cy, n = 4, base = 40) => {
      doc.save().opacity(0.05);
      for (let i = 1; i <= n; i++) doc.circle(cx, cy, base * i).lineWidth(1.2).strokeColor(NAVY).stroke();
      doc.restore();
    };

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 1 — COVER (white, premium)
    // ════════════════════════════════════════════════════════════════════════
    doc.rect(0, 0, W, 6).fill(NAVY);
    doc.rect(0, 6, W, 1.5).fill(AMBER);
    motif(W - 60, 130, 5, 34);
    motif(40, H - 150, 4, 30);

    if (logoExists) doc.image(logoPath, M, 46, { width: 40, height: 40 });
    const cx0 = logoExists ? M + 52 : M;
    doc.font('Helvetica-Bold').fontSize(17).fillColor(NAVY).text(COMPANY, cx0, 52);
    doc.font('Helvetica').fontSize(7.5).fillColor(SLATE)
       .text(TAGLINE.toUpperCase(), cx0, 72, { characterSpacing: 1.2 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(AMBERD)
       .text('COMMERCIAL PROPOSAL', M, 60, { width: CW, align: 'right', characterSpacing: 1.6 });
    hr(108);

    label('Drone Survey & Mapping Services', M, 168, { color: AMBERD, size: 8, text: { characterSpacing: 2 } });
    doc.font('Helvetica-Bold').fontSize(38).fillColor(NAVY).text('Project Cost', M, 186);
    doc.font('Helvetica-Bold').fontSize(38).fillColor(BLUE).text('Estimation', M, 228);
    doc.font('Helvetica').fontSize(10.5).fillColor(SLATE)
       .text('A comprehensive commercial estimate for enterprise drone data acquisition,', M, 282)
       .text('processing and analytics — prepared exclusively for the client below.', M, 296);

    // Prepared-for panel
    doc.roundedRect(M, 336, CW, 64, 6).fill(FAINT);
    doc.roundedRect(M, 336, CW, 64, 6).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.rect(M, 336, 3, 64).fill(AMBER);
    label('Prepared For', M + 18, 350);
    doc.font('Helvetica-Bold').fontSize(17).fillColor(NAVY)
       .text(CLIENT.toUpperCase(), M + 18, 364, { width: CW - 36, lineBreak: false });

    // Meta grid 3 × 2
    const meta = [
      ['Reference',    REF],
      ['Date of Issue', DATE],
      ['Service Line', SERVICE],
      ['Scope',        scopeLine()],
      ['Validity',     '30 days'],
      ['Prepared By',  'Estimation Desk, ' + COMPANY.charAt(0) + COMPANY.slice(1).toLowerCase()],
    ];
    const gY = 424, colW = CW / 3, rowH = 52;
    meta.forEach((mRow, i) => {
      const x = M + (i % 3) * colW;
      const y = gY + Math.floor(i / 3) * rowH;
      label(mRow[0], x, y);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
         .text(mRow[1], x, y + 12, { width: colW - 16, lineBreak: false });
    });
    hr(gY - 12); hr(gY + rowH * 2 - 6);

    // Value band
    const vY = 560;
    doc.roundedRect(M, vY, CW, 78, 8).fill(NAVY);
    doc.rect(M + 0.5, vY + 0.5, 3, 77).fill(AMBER);
    label('Estimated Project Value  ·  Inclusive of GST', M + 22, vY + 16, { color: '#9fb3cc' });
    doc.font('Helvetica-Bold').fontSize(26).fillColor(WHITE)
       .text(fmt(bd.total), M + 22, vY + 32, { lineBreak: false });
    if (bd.unitRate != null) {
      label('Unit Rate', W - M - 150, vY + 16, { color: '#9fb3cc' });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(AMBER)
         .text(`${fmt(bd.unitRate)} / ${bd.scopeUnit || 'unit'}`, W - M - 150, vY + 30, { width: 130, lineBreak: false });
    }

    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
       .text('CONFIDENTIAL — This document and its contents are intended solely for the addressed party.', M, H - 80, { width: CW, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(SLATE)
       .text(`${WEBSITE}   ·   ${EMAIL}`, M, H - 66, { width: CW, align: 'center', lineBreak: false });
    doc.rect(0, H - 6, W, 6).fill(NAVY);

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2 — EXECUTIVE SUMMARY
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage({ size: 'A4', margin: 0 });
    let y = chrome('Executive Summary');
    y = sectionTitle('Executive Summary', y,
      `Commercial and operational snapshot of the proposed ${SERVICE.toLowerCase()} engagement for ${CLIENT}.`);

    // KPI cards row
    const kpis = [
      { l: 'Project Value', v: fmt(bd.total),      a: NAVY,   s: 'Incl. GST' },
      { l: 'Direct Cost',   v: fmt(bd.directCost), a: BLUE,   s: pct((bd.directCost / (bd.total || 1)) * 100) + ' of value' },
      { l: 'Margin',        v: fmt(bd.margin),     a: GREEN,  s: pct(bd.marginPercent) + ' applied' },
      { l: 'GST',           v: fmt(bd.tax),        a: VIOLET, s: pct(bd.taxPercent) },
      { l: 'Flight Days',   v: String(bd.days),    a: AMBER,  s: 'On-site acquisition' },
    ];
    const kw = (CW - 4 * 10) / 5;
    kpis.forEach((k, i) => kpiCard(M + i * (kw + 10), y, kw, 54, k.a, k.l, k.v, k.s));
    y += 74;

    // Project overview rows
    y = subTitle('Project Overview', y);
    const overview = [
      ['Client',            CLIENT],
      ['Service Type',      SERVICE],
      ['Scope',             scopeLine()],
      ['Project Reference', REF],
      ['Flight Days',       `${bd.days} day(s) of on-site acquisition`],
      ['Pilots Deployed',   `${bd.pilotsCount} certified pilot(s)`],
      ['Drones Deployed',   `${bd.dronesCount} type-approved UAS`],
      ['Field Team',        `${bd.teamSize} person(s)`],
      ['Deliverables',      `${deliverables.length} item(s) — see Deliverables section`],
      ['Date of Issue',     DATE],
    ];
    overview.forEach((row, i) => {
      const ry = y + i * 21;
      if (i % 2 === 0) doc.rect(M, ry - 4, CW, 21).fill(FAINT);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(SLATE).text(row[0], M + 8, ry, { width: 150, lineBreak: false });
      doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(row[1], M + 170, ry, { width: CW - 180, lineBreak: false });
    });
    y += overview.length * 21 + 18;

    // Engagement snapshot
    y = subTitle('Engagement Snapshot', y);
    const snapshot = [
      ['Acquisition',  `${bd.pilotsCount} pilot(s) operating ${bd.dronesCount} drone(s) across ${bd.days} flight day(s).`],
      ['Processing',   'Dedicated photogrammetry and analytics pipeline with internal QA gates before release.'],
      ['Delivery',     'All outputs published to the Niyamak portal with structured handover documentation.'],
      ['Compliance',   'Operations under current DGCA UAS Rules; certified crew and insured, type-approved equipment.'],
    ];
    snapshot.forEach((s, i) => {
      const ry = y + i * 30;
      doc.circle(M + 5, ry + 5, 2.5).fill(AMBER);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(s[0], M + 16, ry, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(SLATE).text(s[1], M + 16, ry + 11, { width: CW - 24, lineBreak: false });
    });

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 3 — COST SUMMARY (cards + waterfall)
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage({ size: 'A4', margin: 0 });
    y = chrome('Cost Summary');
    y = sectionTitle('Cost Summary', y, 'Commercial build-up from direct cost to the final contract value.');

    const sumCards = [
      { l: 'Direct Cost',  v: fmt(bd.directCost),  a: BLUE,   s: 'Field + processing + deliverables' },
      { l: `Overhead (${pct(bd.overheadPercent)})`,    v: fmt(bd.overhead),    a: '#0891b2', s: 'Operations & administration' },
      { l: `Contingency (${pct(bd.contingencyPercent)})`, v: fmt(bd.contingency), a: AMBER, s: 'Risk buffer' },
      { l: `Margin (${pct(bd.marginPercent)})`,     v: fmt(bd.margin),      a: GREEN,  s: 'Commercial margin' },
      { l: `GST (${pct(bd.taxPercent)})`,           v: fmt(bd.tax),         a: VIOLET, s: 'Statutory tax' },
    ];
    const sw = (CW - 2 * 12) / 3;
    sumCards.forEach((c, i) => {
      const x = M + (i % 3) * (sw + 12);
      const cy2 = y + Math.floor(i / 3) * 72;
      kpiCard(x, cy2, sw, 58, c.a, c.l, c.v, c.s);
    });
    // Grand total card (filled)
    const gtX = M + 2 * (sw + 12), gtY = y + 72;
    doc.roundedRect(gtX, gtY, sw, 58, 5).fill(NAVY);
    doc.rect(gtX, gtY, sw, 3).fill(AMBER);
    label('Grand Total', gtX + 10, gtY + 12, { color: '#9fb3cc' });
    doc.font('Helvetica-Bold').fontSize(13.5).fillColor(AMBER).text(fmt(bd.total), gtX + 10, gtY + 24, { width: sw - 20, lineBreak: false });
    doc.font('Helvetica').fontSize(6.5).fillColor('#9fb3cc').text('Inclusive of GST', gtX + 10, gtY + 41, { lineBreak: false });
    y += 72 * 2 + 16;

    // Waterfall — price build-up
    y = subTitle('Price Build-Up (Waterfall)', y);
    const steps = [
      { l: 'Direct',      v: bd.directCost,  c: BLUE },
      { l: 'Overhead',    v: bd.overhead,    c: '#0891b2' },
      { l: 'Contingency', v: bd.contingency, c: AMBER },
      { l: 'Margin',      v: bd.margin,      c: GREEN },
      { l: 'GST',         v: bd.tax,         c: VIOLET },
    ].filter(s => s.v > 0);
    const chartH = 170, chartY = y + 14, baseY = chartY + chartH;
    const total  = bd.total || 1;
    const nCols  = steps.length + 1;
    const gap    = 18;
    const colW2  = (CW - gap * (nCols - 1)) / nCols;
    let cum = 0;
    doc.font('Helvetica').fontSize(6.5);
    // gridlines
    for (let i = 0; i <= 4; i++) {
      const gy = baseY - (chartH * i) / 4;
      hr(gy, M, W - M, i === 0 ? '#cbd5e1' : '#eef2f7', i === 0 ? 1 : 0.6);
    }
    steps.forEach((s, i) => {
      const x = M + i * (colW2 + gap);
      const hPix  = Math.max(2, (s.v / total) * chartH);
      const yBot  = baseY - (cum / total) * chartH;
      const yTop  = yBot - hPix;
      doc.rect(x, yTop, colW2, hPix).fill(s.c);
      // connector to next column
      const nx = x + colW2 + gap;
      doc.moveTo(x + colW2, yTop).lineTo(nx, yTop).lineWidth(0.7).strokeColor('#b6c2d4').dash(2, { space: 2 }).stroke().undash();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(INK)
         .text(fmt(s.v), x - 6, yTop - 11, { width: colW2 + 12, align: 'center', lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(7).fillColor(SLATE)
         .text(s.l.toUpperCase(), x - 6, baseY + 6, { width: colW2 + 12, align: 'center', lineBreak: false });
      cum += s.v;
    });
    // total column
    const tX = M + steps.length * (colW2 + gap);
    doc.rect(tX, baseY - chartH, colW2, chartH).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(NAVY)
       .text(fmt(bd.total), tX - 8, baseY - chartH - 11, { width: colW2 + 16, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(7).fillColor(NAVY)
       .text('TOTAL', tX - 6, baseY + 6, { width: colW2 + 12, align: 'center', lineBreak: false });
    y = baseY + 28;

    if (bd.unitRate != null) {
      doc.font('Helvetica').fontSize(8.5).fillColor(SLATE)
         .text(`Effective unit rate: `, M, y, { continued: true, lineBreak: false })
         .font('Helvetica-Bold').fillColor(NAVY)
         .text(`${fmt(bd.unitRate)} per ${bd.scopeUnit || 'unit'}`, { lineBreak: false });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 4 — VISUAL COST ANALYSIS
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage({ size: 'A4', margin: 0 });
    y = chrome('Visual Cost Analysis');
    y = sectionTitle('Visual Cost Analysis', y, 'Composition of direct cost and relative weight of each component.');

    const compTotal = comps.reduce((s, c) => s + c.value, 0) || 1;

    // Donut
    y = subTitle('Direct Cost Composition', y);
    const dcx = M + 92, dcy = y + 96, R = 74, rIn = 46;
    let ang = 0;
    comps.forEach((c, i) => {
      const sweep = (c.value / compTotal) * 360;
      donutSlice(dcx, dcy, R, rIn, ang, ang + sweep, PALETTE[i % PALETTE.length]);
      ang += sweep;
    });
    doc.circle(dcx, dcy, rIn - 1).fill(WHITE);
    label('Direct Cost', dcx - rIn + 4, dcy - 13, { text: { width: (rIn - 4) * 2, align: 'center' } });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY)
       .text(compTotal >= 100000 ? `Rs. ${(compTotal / 100000).toFixed(1)} L` : fmt(compTotal),
             dcx - rIn + 4, dcy - 2, { width: (rIn - 4) * 2, align: 'center', lineBreak: false });

    // Legend
    let ly = y + 10;
    const lx = dcx + R + 40;
    comps.forEach((c, i) => {
      doc.roundedRect(lx, ly, 9, 9, 2).fill(PALETTE[i % PALETTE.length]);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(c.label, lx + 15, ly, { width: 160, lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(SLATE)
         .text(`${fmt(c.value)}   ·   ${pct((c.value / compTotal) * 100)}`, lx + 15, ly + 10, { lineBreak: false });
      ly += 25;
    });
    y = Math.max(dcy + R + 26, ly + 10);

    // Horizontal comparison bars
    y = subTitle('Component Comparison', y);
    const sorted = [...comps].sort((a, b) => b.value - a.value);
    const maxVal = sorted[0]?.value || 1;
    const labW = 130, amtW = 90;
    const barMax = CW - labW - amtW - 16;
    sorted.forEach((c) => {
      const bw = Math.max(3, (c.value / maxVal) * barMax);
      doc.font('Helvetica').fontSize(8).fillColor(INK).text(c.label, M, y + 2, { width: labW - 8, lineBreak: false });
      doc.roundedRect(M + labW, y, barMax, 11, 3).fill('#f1f5f9');
      doc.roundedRect(M + labW, y, bw, 11, 3).fill(PALETTE[comps.indexOf(c) % PALETTE.length]);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(SLATE)
         .text(fmt(c.value), M + labW + barMax + 8, y + 2, { lineBreak: false });
      y += 19;
    });
    y += 14;

    // Margin analysis strip
    y = subTitle('Commercial Structure', y);
    const stats = [
      { l: 'Direct Cost Share', v: pct((bd.directCost / (bd.total || 1)) * 100), a: BLUE,   s: 'of contract value' },
      { l: 'Margin Share',      v: pct((bd.margin    / (bd.total || 1)) * 100),  a: GREEN,  s: 'of contract value' },
      { l: 'Risk Buffer',       v: pct((bd.contingency / (bd.total || 1)) * 100), a: AMBER, s: 'contingency share' },
      { l: 'Tax Component',     v: pct((bd.tax       / (bd.total || 1)) * 100),  a: VIOLET, s: 'GST share' },
    ];
    const stW = (CW - 3 * 10) / 4;
    stats.forEach((s, i) => kpiCard(M + i * (stW + 10), y, stW, 52, s.a, s.l, s.v, s.s));

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 5+ — DETAILED COST BREAKDOWN (flowing tables)
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage({ size: 'A4', margin: 0 });
    y = chrome('Detailed Cost Breakdown');
    y = sectionTitle('Detailed Cost Breakdown', y, 'Line-level transparency across parameters, direct costs and commercial terms.');

    const PAGE_LIMIT = H - 64;
    const ensure = (needed) => {
      if (y + needed > PAGE_LIMIT) {
        doc.addPage({ size: 'A4', margin: 0 });
        y = chrome('Detailed Cost Breakdown (Continued)');
      }
    };

    const drawTable = (title, cols, rows, footRow = null) => {
      ensure(64);
      y = subTitle(title, y);
      const rowH2 = 19;
      const cell = (cells, opts = {}) => {
        ensure(rowH2 + 2);
        if (opts.bg) doc.rect(M, y, CW, rowH2).fill(opts.bg);
        let x = M;
        cols.forEach((col, ci) => {
          doc.fillColor(opts.fg || INK)
             .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
             .text(String(cells[ci] ?? ''), x + 6, y + 5.5, {
               width: col.width - 12, align: col.align || 'left', lineBreak: false,
             });
          x += col.width;
        });
        hr(y + rowH2, M, W - M, '#eef2f7', 0.6);
        y += rowH2;
      };
      cell(cols.map(c => c.label.toUpperCase()), { bold: true, bg: NAVY, fg: WHITE });
      rows.forEach((r, i) => cell(r, { bg: i % 2 ? FAINT : WHITE }));
      if (footRow) cell(footRow, { bold: true, bg: SKY, fg: NAVY });
      y += 14;
    };

    // 1 — parameters
    const paramRows = [
      ['Service Line', SERVICE],
      ['Flight Days', String(bd.days)],
      ['Pilots × Drones', `${bd.pilotsCount} pilot(s) × ${bd.dronesCount} drone(s)`],
      ['Team Size', `${bd.teamSize} person(s)`],
    ];
    if (inputs.mw)         paramRows.push(['Capacity', `${inputs.mw} MWp`]);
    if (inputs.km)         paramRows.push(['Distance', `${inputs.km} km`]);
    if (inputs.turbines)   paramRows.push(['Turbines', String(inputs.turbines)]);
    if (inputs.towers)     paramRows.push(['Towers', String(inputs.towers)]);
    if (inputs.stockpiles) paramRows.push(['Stockpiles', String(inputs.stockpiles)]);
    drawTable('1. Project Parameters',
      [{ label: 'Parameter', width: CW * 0.45 }, { label: 'Value', width: CW * 0.55 }],
      paramRows);

    // 2 — direct cost
    const dcCols = [
      { label: '#',            width: CW * 0.07, align: 'center' },
      { label: 'Description',  width: CW * 0.48 },
      { label: 'Amount (INR)', width: CW * 0.25, align: 'right' },
      { label: '% of Direct',  width: CW * 0.20, align: 'right' },
    ];
    const dcRows = [];
    let idx = 1;
    const addDc = (lbl, v) => { if (v > 0) dcRows.push([String(idx++), lbl, fmt(v), pct((v / (bd.directCost || compTotal || 1)) * 100)]); };
    addDc('Pilot Cost', bd.pilotCost);
    addDc('Drone Cost', bd.droneCost);
    addDc('Mobilization & Travel', bd.mobilizationCost);
    addDc('Accommodation', bd.accommodationCost);
    addDc('Food Allowance', bd.perDiem);
    addDc('Software Licenses', bd.softwareCost);
    if (bd.deliverableBreakdown.length > 0) {
      bd.deliverableBreakdown.forEach(dl => addDc(`Deliverable: ${dl.label || dl.key}`, safe(dl.line_total)));
    } else addDc('Deliverables', bd.deliverableCost);
    if (bd.reportHours > 0) addDc(`Report Writing (${bd.reportHours}h)`, bd.reportWritingCost);
    else addDc('Report Writing', bd.reportWritingCost);
    addDc('Data Storage & Transfer', bd.storageCost);
    addDc('Post-Processing', bd.processingCost);
    drawTable('2. Direct Cost Breakdown', dcCols, dcRows,
      ['', 'DIRECT COST SUB-TOTAL', fmt(bd.directCost), '100%']);

    // 3 — custom items
    if (est.items?.length) {
      const itCols = [
        { label: 'Category',    width: CW * 0.18 },
        { label: 'Description', width: CW * 0.37 },
        { label: 'Qty',         width: CW * 0.10, align: 'center' },
        { label: 'Unit Cost',   width: CW * 0.17, align: 'right' },
        { label: 'Total',       width: CW * 0.18, align: 'right' },
      ];
      const itRows = est.items.map(it => [
        (it.category || '—').replace(/_/g, ' '),
        it.description || '—',
        String(safe(it.quantity) || 1),
        fmt(it.unit_cost),
        fmt(it.total_cost),
      ]);
      const itTotal = est.items.reduce((s, it) => s + safe(it.total_cost), 0);
      drawTable('3. Custom Line Items', itCols, itRows, ['', 'ITEMS TOTAL', '', '', fmt(itTotal)]);
    }

    // 4 — commercial parameters
    const cmCols = [
      { label: 'Component',    width: CW * 0.40 },
      { label: 'Basis',        width: CW * 0.30 },
      { label: 'Amount (INR)', width: CW * 0.30, align: 'right' },
    ];
    const cmRows = [];
    if (bd.overhead > 0)    cmRows.push(['Overhead',    `${pct(bd.overheadPercent)} of direct cost`, fmt(bd.overhead)]);
    if (bd.contingency > 0) cmRows.push(['Contingency', `${pct(bd.contingencyPercent)} of production cost`, fmt(bd.contingency)]);
    cmRows.push(['Margin',    pct(bd.marginPercent), fmt(bd.margin)]);
    cmRows.push(['Subtotal (excl. GST)', 'Value before tax', fmt(bd.subtotal)]);
    cmRows.push(['Tax / GST', pct(bd.taxPercent),    fmt(bd.tax)]);
    drawTable(`${est.items?.length ? 4 : 3}. Commercial Parameters`, cmCols, cmRows);

    // grand total band
    ensure(60);
    doc.roundedRect(M, y, CW, 40, 6).fill(NAVY);
    doc.rect(M + 0.5, y + 0.5, 3, 39).fill(AMBER);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(WHITE).text('GRAND TOTAL (INR)', M + 18, y + 13, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(15).fillColor(AMBER)
       .text(fmt(bd.total), W / 2, y + 11, { align: 'right', width: W / 2 - M - 16, lineBreak: false });
    y += 52;
    if (bd.unitRate != null) {
      doc.font('Helvetica').fontSize(8.5).fillColor(SLATE)
         .text(`Unit rate: ${fmt(bd.unitRate)} per ${bd.scopeUnit || 'unit'}`, M + 4, y, { lineBreak: false });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE — RESOURCE PLAN
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage({ size: 'A4', margin: 0 });
    y = chrome('Resource Plan');
    y = sectionTitle('Resource Plan', y, 'Crew, equipment and effort allocated to deliver this engagement.');

    const resCards = [
      { l: 'Certified Pilots', v: String(bd.pilotsCount), a: BLUE,   s: 'DGCA-certified crew' },
      { l: 'Drones (UAS)',     v: String(bd.dronesCount), a: AMBER,  s: 'Type-approved platforms' },
      { l: 'Flight Days',      v: String(bd.days),        a: GREEN,  s: 'On-site acquisition' },
      { l: 'Field Team',       v: String(bd.teamSize),    a: VIOLET, s: 'Total deployed personnel' },
    ];
    const rw = (CW - 3 * 10) / 4;
    resCards.forEach((c, i) => kpiCard(M + i * (rw + 10), y, rw, 58, c.a, c.l, c.v, c.s));
    y += 80;

    // Two panels — field ops vs processing
    y = subTitle('Operating Model', y);
    const panelW = (CW - 14) / 2, panelH = 132;
    const panel = (x, title, accent, lines) => {
      doc.roundedRect(x, y, panelW, panelH, 6).fill(FAINT);
      doc.roundedRect(x, y, panelW, panelH, 6).lineWidth(0.8).strokeColor(LINE).stroke();
      doc.rect(x, y, panelW, 3).fill(accent);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY).text(title, x + 14, y + 14, { lineBreak: false });
      let py = y + 34;
      lines.forEach(ln => {
        doc.circle(x + 18, py + 4, 2).fill(accent);
        doc.font('Helvetica').fontSize(7.8).fillColor(SLATE)
           .text(ln, x + 28, py, { width: panelW - 42 });
        py = doc.y + 6;
      });
    };
    panel(M, 'Field Operations', BLUE, [
      `${bd.pilotsCount} pilot(s) × ${bd.dronesCount} drone(s) deployed for ${bd.days} flight day(s).`,
      `Coverage scope: ${scopeLine()}.`,
      'Daily flight logs, battery cycling and on-site data backup discipline.',
      'Site HSE compliance and client liaison throughout the deployment window.',
    ]);
    panel(M + panelW + 14, 'Processing & Reporting', GREEN, [
      'Dedicated photogrammetry pipeline for orthomosaics, point clouds and analytics.',
      bd.reportHours > 0 ? `${bd.reportHours} hour(s) of structured report writing.` : 'Structured report writing with reviewed findings.',
      'Internal QA gates on every dataset before client release.',
      'Secure cloud storage with controlled access and audit trail.',
    ]);
    y += panelH + 26;

    // ════════════════════════════════════════════════════════════════════════
    // SAME PAGE — DELIVERABLES
    // ════════════════════════════════════════════════════════════════════════
    y = subTitle('Project Deliverables', y);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
       .text(bd.deliverableBreakdown.length > 0
          ? 'Commercially quoted deliverables for this engagement:'
          : 'Indicative deliverables for this service line:', M, y, { lineBreak: false });
    y += 16;
    const dCols = 2, dW = (CW - 14) / dCols, dH = 30;
    deliverables.slice(0, 10).forEach((d, i) => {
      const x = M + (i % dCols) * (dW + 14);
      const ry = y + Math.floor(i / dCols) * (dH + 8);
      doc.roundedRect(x, ry, dW, dH, 5).fill(WHITE);
      doc.roundedRect(x, ry, dW, dH, 5).lineWidth(0.8).strokeColor(LINE).stroke();
      doc.circle(x + 16, ry + dH / 2, 4).fill(PALETTE[i % PALETTE.length]);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK)
         .text(d.label, x + 30, ry + (d.qty ? 6 : 10), { width: dW - 40, lineBreak: false });
      if (d.qty) doc.font('Helvetica').fontSize(7).fillColor(MUTED)
         .text(`Quantity: ${d.qty}`, x + 30, ry + 17, { lineBreak: false });
    });

    // ════════════════════════════════════════════════════════════════════════
    // PAGE — TIMELINE + ASSUMPTIONS
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage({ size: 'A4', margin: 0 });
    y = chrome('Timeline & Assumptions');
    y = sectionTitle('Project Timeline', y, 'Indicative execution flow from mobilization to final handover.');

    // Horizontal stepper
    const tlY = y + 26;
    const stepW = CW / TIMELINE.length;
    hr(tlY, M + stepW / 2, W - M - stepW / 2, '#cbd5e1', 1.4);
    TIMELINE.forEach((st, i) => {
      const cx2 = M + stepW * i + stepW / 2;
      doc.circle(cx2, tlY, 11).fill(i === 1 ? AMBER : NAVY);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(WHITE)
         .text(String(i + 1), cx2 - 8, tlY - 4.5, { width: 16, align: 'center', lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY)
         .text(st.label.toUpperCase(), cx2 - stepW / 2 + 4, tlY + 18, { width: stepW - 8, align: 'center' });
      const sub = i === 1 ? `${bd.days} flight day(s)` : st.sub;
      if (sub) doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
         .text(sub, cx2 - stepW / 2 + 2, doc.y + 1, { width: stepW - 4, align: 'center' });
    });
    y = tlY + 74;

    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
       .text('Data delivery within 5–7 business days of flight completion. Mobilization requires 7 days’ notice post-confirmation.', M, y, { width: CW, lineBreak: false });
    y += 28;

    // Assumptions — two columns
    y = sectionTitle('Assumptions', y, 'This estimate is prepared on the basis of the following conditions.');
    const colWA = (CW - 20) / 2;
    let yL = y, yR = y;
    ASSUMPTIONS.forEach((a, i) => {
      const left = i % 2 === 0;
      const x = left ? M : M + colWA + 20;
      let yy = left ? yL : yR;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(AMBERD).text(String(i + 1).padStart(2, '0'), x, yy, { lineBreak: false });
      doc.font('Helvetica').fontSize(7.8).fillColor(SLATE).text(a, x + 18, yy, { width: colWA - 18, lineGap: 1.5 });
      const used = doc.y - yy + 10;
      if (left) yL = yy + used; else yR = yy + used;
    });
    y = Math.max(yL, yR) + 8;

    y = subTitle('In Client’s Scope', y);
    CLIENT_SCOPE.forEach((c) => {
      doc.circle(M + 5, y + 4, 2).fill(BLUE);
      doc.font('Helvetica').fontSize(7.8).fillColor(SLATE).text(c, M + 16, y, { width: CW - 20 });
      y = doc.y + 7;
    });

    // ════════════════════════════════════════════════════════════════════════
    // PAGE — TERMS & CONDITIONS (two-column)
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage({ size: 'A4', margin: 0 });
    y = chrome('Terms & Conditions');
    y = sectionTitle('Terms & Conditions', y, 'Commercial terms governing this estimation and any resulting engagement.');

    const tColW = (CW - 24) / 2;
    let tL = y, tR = y;
    TERMS.forEach((term, i) => {
      const left = i % 2 === 0;
      const x = left ? M : M + tColW + 24;
      let yy = left ? tL : tR;
      doc.rect(x, yy + 1, 14, 2).fill(AMBER);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(term.t, x + 20, yy - 3, { lineBreak: false });
      doc.font('Helvetica').fontSize(7.8).fillColor(SLATE)
         .text(term.d, x, yy + 12, { width: tColW, lineGap: 1.6 });
      const used = doc.y - yy + 20;
      if (left) tL = yy + used; else tR = yy + used;
    });
    y = Math.max(tL, tR) + 10;

    doc.roundedRect(M, y, CW, 34, 5).fill(SKY);
    doc.font('Helvetica').fontSize(7.8).fillColor(NAVY)
       .text('Any engagement arising from this estimation is governed by a mutually executed work order / agreement. In case of conflict, the executed agreement prevails over this document.',
             M + 14, y + 9, { width: CW - 28, lineGap: 1.5 });

    // ════════════════════════════════════════════════════════════════════════
    // PAGE — COMPANY PROFILE + ACCEPTANCE
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage({ size: 'A4', margin: 0 });
    y = chrome('Company Profile');
    y = sectionTitle('About Niyamak', y);
    doc.font('Helvetica').fontSize(8.5).fillColor(SLATE)
       .text('Niyamak is an enterprise drone-operations platform delivering inspection, survey and analytics services for the energy and infrastructure sector. Our certified pilots, type-approved UAS fleet and in-house processing pipeline convert flight data into decision-ready insight — delivered through a single, secure operations portal.',
             M, y, { width: CW, lineGap: 2.2 });
    y = doc.y + 18;

    y = subTitle('Core Services', y);
    const svW = (CW - 2 * 12) / 3, svH = 64;
    SERVICES.forEach((s, i) => {
      const x = M + (i % 3) * (svW + 12);
      const ry = y + Math.floor(i / 3) * (svH + 12);
      doc.roundedRect(x, ry, svW, svH, 6).fill(FAINT);
      doc.roundedRect(x, ry, svW, svH, 6).lineWidth(0.8).strokeColor(LINE).stroke();
      doc.circle(x + 16, ry + 17, 5).fill(PALETTE[i % PALETTE.length]);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text(s.name, x + 28, ry + 12, { width: svW - 36, lineBreak: false });
      doc.font('Helvetica').fontSize(6.8).fillColor(SLATE).text(s.desc, x + 12, ry + 30, { width: svW - 24, lineGap: 1 });
    });
    y += 2 * (svH + 12) + 14;

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(SLATE)
       .text('DGCA-COMPLIANT OPERATIONS   ·   CERTIFIED PILOTS   ·   INSURED EQUIPMENT   ·   SECURE DATA HANDLING',
             M, y, { width: CW, align: 'center', characterSpacing: 0.8, lineBreak: false });
    y += 30;

    // Acceptance
    y = sectionTitle('Client Acceptance', y,
      `Acceptance of estimation ${REF} dated ${DATE} for a total value of ${fmt(bd.total)} (incl. GST).`);

    const accW = (CW - 24) / 2, accH = 128;
    const accPanel = (x, title, rows, seal) => {
      doc.roundedRect(x, y, accW, accH, 6).fill(WHITE);
      doc.roundedRect(x, y, accW, accH, 6).lineWidth(0.8).strokeColor(LINE).stroke();
      doc.rect(x, y, accW, 3).fill(NAVY);
      label(title, x + 14, y + 12, { color: NAVY, size: 7 });
      let py = y + 44;
      rows.forEach(rl => {
        hr(py, x + 14, x + accW - (seal ? 84 : 14), '#cbd5e1', 0.8);
        doc.font('Helvetica').fontSize(6.5).fillColor(MUTED).text(rl, x + 14, py + 4, { lineBreak: false });
        py += 28;
      });
      if (seal) {
        doc.save().dash(3, { space: 2 });
        doc.circle(x + accW - 46, y + 78, 26).lineWidth(0.8).strokeColor(MUTED).stroke();
        doc.restore().undash();
        doc.font('Helvetica').fontSize(5.5).fillColor(MUTED)
           .text('COMPANY SEAL', x + accW - 70, y + 75, { width: 48, align: 'center', lineBreak: false });
      }
    };
    accPanel(M, 'For Niyamak', ['Authorized Signatory', 'Name & Designation', 'Date'], false);
    accPanel(M + accW + 24, `For ${CLIENT}`, ['Authorized Signatory', 'Name & Designation', 'Date'], true);

    // ── Footer pass (skip cover) ─────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      if (i === 0) continue; // cover has its own footer
      hr(H - 34, M, W - M, LINE, 0.6);
      doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
         .text(`${COMPANY}  ·  ${WEBSITE}  ·  ${EMAIL}`, M, H - 26, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(SLATE)
         .text(`${REF}   |   Page ${i + 1} of ${range.count}`, M, H - 26, { width: CW, align: 'right', lineBreak: false });
    }

    doc.end();
  });
};
