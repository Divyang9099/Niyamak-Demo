const path    = require('path');
const fs      = require('fs');
const db      = require('../../core/config/db');
const PDFDoc  = require('pdfkit');
const ExcelJS = require('exceljs');
const { formatDateIST } = require('../../core/utils/dateUtils');

// ─── Logo path ────────────────────────────────────────────────────────────────
const LOGO_PATH = path.resolve(__dirname, '../../../../frontend/public/logo.png');

// ─── Shared helpers ───────────────────────────────────────────────────────────
const fetchEstimationData = async (id) => {
  const estResult = await db.query('SELECT * FROM estimations WHERE id=$1', [id]);
  if (!estResult.rows.length)
    throw Object.assign(new Error('Estimation not found'), { statusCode: 404 });

  const estimation = estResult.rows[0];
  const itemsResult = await db.query(
    'SELECT * FROM estimation_items WHERE estimation_id=$1 ORDER BY created_at ASC', [id]
  );
  estimation.items = itemsResult.rows;

  if (typeof estimation.details === 'string') {
    try { estimation.details = JSON.parse(estimation.details); } catch { estimation.details = {}; }
  }
  return estimation;
};

const fmt  = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const pct  = (n) => `${Number(n || 0).toFixed(1)}%`;
const safe = (n) => Number(n || 0);

const buildBreakdown = (inputs, breakdown) => {
  const b = breakdown || {};
  const i = inputs    || {};
  return {
    pilotCost:         safe(b.pilotCost),
    droneCost:         safe(b.droneCost),
    pilotsCount:       safe(b.pilotsCount  ?? i.pilots_count  ?? 1),
    dronesCount:       safe(b.dronesCount  ?? i.drones_count  ?? 1),
    days:              safe(b.days         ?? i.days          ?? 0),
    mobilizationCost:  safe(b.mobilizationCost ?? b.travelCost ?? i.travel_cost ?? 0),
    accommodationCost: safe(b.accommodationCost ?? 0),
    perDiem:           safe(b.perDiem           ?? 0),
    teamSize:          safe(b.teamSize          ?? i.team_size ?? 1),
    softwareCost:      safe(b.softwareCost      ?? i.software_cost       ?? 0),
    deliverableCost:   safe(b.deliverableCost   ?? i.deliverable_cost    ?? 0),
    reportWritingCost: safe(b.reportWritingCost ?? i.report_writing_cost ?? 0),
    reportHours:       safe(b.reportWritingHours ?? i.report_writing_hours ?? 0),
    storageCost:       safe(b.storageCost        ?? i.storage_cost        ?? 0),
    processingCost:    safe(b.processingCost     ?? b.processing_cost     ?? i.processing_cost ?? 0),
    deliverableBreakdown: Array.isArray(b.deliverableBreakdown) ? b.deliverableBreakdown : [],
    directCost:        safe(b.directCosts      ?? b.directCost    ?? 0),
    overheadPercent:   safe(b.overheadPercent  ?? b.overhead_percent  ?? i.overhead_percent  ?? 0),
    overhead:          safe(b.overhead         ?? 0),
    contingencyPercent:safe(b.contingencyPercent ?? b.contingency_percent ?? i.contingency_percent ?? 0),
    contingency:       safe(b.contingency      ?? 0),
    marginPercent:     safe(b.marginPercent    ?? b.margin_percent    ?? i.margin_percent    ?? 0),
    margin:            safe(b.margin           ?? 0),
    taxPercent:        safe(b.taxPercent       ?? b.tax_percent       ?? i.tax_percent       ?? 18),
    tax:               safe(b.tax             ?? 0),
    // Pre-GST total (production + margin). Fallback to total − tax for legacy records.
    subtotal:          safe(b.subtotal         ?? (safe(b.total) - safe(b.tax))),
    total:             safe(b.total            ?? 0),
    unitRate:          b.unitRate != null ? safe(b.unitRate) : null,
    scopeUnit:         i.scope_unit || null,
  };
};

// Direct-cost components as labelled list — single source for charts and tables.
const directComponents = (bd) => {
  const out = [];
  const push = (label, value) => { if (value > 0) out.push({ label, value }); };
  push('Pilot Cost',            bd.pilotCost);
  push('Drone Cost',            bd.droneCost);
  push('Mobilization & Travel', bd.mobilizationCost);
  push('Accommodation',         bd.accommodationCost);
  push('Food',                  bd.perDiem);
  push('Software',              bd.softwareCost);
  if (bd.deliverableBreakdown.length > 0) {
    const dlTotal = bd.deliverableBreakdown.reduce((s, d) => s + safe(d.line_total), 0);
    push('Deliverables', dlTotal || bd.deliverableCost);
  } else push('Deliverables', bd.deliverableCost);
  push('Report Writing',  bd.reportWritingCost);
  push('Storage',         bd.storageCost);
  push('Post-Processing', bd.processingCost);
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT — premium consulting-grade proposal (renderer in export.pdf.js)
// All figures come from buildBreakdown/directComponents; the renderer is
// presentation-only and never recalculates anything.
// ─────────────────────────────────────────────────────────────────────────────
const { renderPremiumPDF } = require('./export.pdf');

exports.generatePDF = async (id) => {
  const est    = await fetchEstimationData(id);
  const inputs = est.details?.inputs || {};
  const bd     = buildBreakdown(inputs, est.details?.breakdown);
  return renderPremiumPDF({
    est, inputs, bd,
    comps: directComponents(bd),
    fmt, pct, safe,
    logoPath: LOGO_PATH,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL EXPORT — formula-live workbook + cost-distribution data bars
// ─────────────────────────────────────────────────────────────────────────────
exports.generateExcel = async (id) => {
  const est    = await fetchEstimationData(id);
  const inputs = est.details?.inputs    || {};
  const bd     = buildBreakdown(inputs, est.details?.breakdown);

  const wb   = new ExcelJS.Workbook();
  wb.creator = 'Niyamak';
  wb.created = new Date();

  const C = {
    navy:    'FF1E3A5F',
    accent:  'FF2563EB',
    gold:    'FFFBBF24',
    light:   'FFEFF6FF',
    gray:    'FFF8FAFC',
    white:   'FFFFFFFF',
    muted:   'FF64748B',
    text:    'FF1E293B',
  };

  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const border = (color = 'FFCBD5E1') => ({
    top: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  });
  const inrFmt = '"Rs. "#,##0';

  // ── SHEET 1: Summary ──────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Estimation Summary', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  });
  ws.columns = [{ key: 'A', width: 36 }, { key: 'B', width: 26 }, { key: 'C', width: 14 }];

  if (fs.existsSync(LOGO_PATH)) {
    const logoId = wb.addImage({ filename: LOGO_PATH, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 50 } });
  }

  ws.mergeCells('A1:C1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'VARUNA NEXUS — PROJECT COST ESTIMATION';
  titleCell.font  = { bold: true, size: 14, color: { argb: C.white }, name: 'Calibri' };
  titleCell.fill  = fill(C.navy);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 44;

  ws.mergeCells('A2:C2');
  const subCell = ws.getCell('A2');
  subCell.value = `Advanced Drone Operational Intelligence  |  Generated: ${formatDateIST(new Date())}`;
  subCell.font  = { size: 9, color: { argb: C.gold }, name: 'Calibri' };
  subCell.fill  = fill(C.navy);
  subCell.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 20;

  ws.mergeCells('A3:C3');
  ws.getCell('A3').fill = fill(C.gold);
  ws.getRow(3).height = 4;

  ws.addRow([]);

  const addSectionHeader = (text) => {
    ws.mergeCells(`A${ws.rowCount + 1}:C${ws.rowCount + 1}`);
    const r = ws.lastRow;
    const c = r.getCell('A');
    c.value = text;
    c.font  = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' };
    c.fill  = fill(C.accent);
    c.alignment = { vertical: 'middle', indent: 1 };
    r.height = 24;
  };

  let altRow = false;
  const addDataRow = (label, value, options = {}) => {
    const r = ws.addRow([label, value, options.third ?? '']);
    const bg = altRow ? C.light : C.white;
    altRow = !altRow;
    r.getCell(1).font  = { size: 10, bold: options.bold, color: { argb: options.bold ? C.navy : C.muted }, name: 'Calibri' };
    r.getCell(1).fill  = fill(options.fillLeft || bg);
    r.getCell(1).alignment = { indent: 2 };
    r.getCell(2).font  = { size: 10, bold: options.bold, color: { argb: options.bold ? C.navy : C.text }, name: 'Calibri' };
    r.getCell(2).fill  = fill(options.fillRight || bg);
    r.getCell(2).alignment = { horizontal: 'right' };
    r.getCell(3).font  = { size: 9, color: { argb: C.muted }, name: 'Calibri' };
    r.getCell(3).fill  = fill(bg);
    r.getCell(3).alignment = { horizontal: 'right' };
    if (options.numFmt) r.getCell(2).numFmt = options.numFmt;
    if (options.thirdFmt) r.getCell(3).numFmt = options.thirdFmt;
    [1, 2, 3].forEach(i => { r.getCell(i).border = border(); });
    r.height = 20;
    return r;
  };

  addSectionHeader('PROJECT INFORMATION');
  altRow = false;
  addDataRow('Estimation Reference', `EST-${est.id?.slice(0, 8).toUpperCase()}`);
  addDataRow('Client Name',          est.client_name  || '—');
  addDataRow('Project Type',         (est.project_type || '—').replace(/_/g, ' '));
  addDataRow('Date',                 formatDateIST(est.created_at));
  addDataRow('Flight Days',          safe(bd.days));
  addDataRow('Pilots',               safe(bd.pilotsCount));
  addDataRow('Drones',               safe(bd.dronesCount));
  addDataRow('Team Size',            safe(bd.teamSize));
  if (inputs.mw)         addDataRow('Capacity (MWp)',  safe(inputs.mw));
  if (inputs.km)         addDataRow('Distance (km)',   safe(inputs.km));
  if (inputs.turbines)   addDataRow('Turbines',        safe(inputs.turbines));
  if (inputs.towers)     addDataRow('Towers',          safe(inputs.towers));
  if (inputs.stockpiles) addDataRow('Stockpiles',      safe(inputs.stockpiles));
  ws.addRow([]);

  // Direct costs — live SUM formulas preserved (client-negotiation requirement)
  addSectionHeader('DIRECT COST BREAKDOWN');
  altRow = false;
  const costRows = [
    ['Pilot Cost',                bd.pilotCost],
    ['Drone Cost',                bd.droneCost],
    ['Mobilization & Travel',     bd.mobilizationCost],
    ['Accommodation',             bd.accommodationCost],
    ['Food Allowance',            bd.perDiem],
    ['Software Licenses',         bd.softwareCost],
  ];
  if (bd.deliverableBreakdown.length > 0) {
    bd.deliverableBreakdown.forEach(dl =>
      costRows.push([`Deliverable: ${dl.label || dl.key}  ×${dl.quantity}`, dl.line_total])
    );
  } else if (bd.deliverableCost > 0) {
    costRows.push(['Deliverables', bd.deliverableCost]);
  }
  if (bd.reportHours > 0) costRows.push([`Report Writing (${bd.reportHours}h)`, bd.reportWritingCost]);
  else if (bd.reportWritingCost > 0) costRows.push(['Report Writing', bd.reportWritingCost]);
  if (bd.storageCost   > 0) costRows.push(['Data Storage & Transfer', bd.storageCost]);
  if (bd.processingCost > 0) costRows.push(['Post-Processing',        bd.processingCost]);

  let firstCostRowNum = null, lastCostRowNum = null;
  costRows.forEach(([l, v]) => {
    if (v > 0) {
      const r = addDataRow(l, v, { numFmt: inrFmt });
      if (firstCostRowNum === null) firstCostRowNum = r.number;
      lastCostRowNum = r.number;
    }
  });

  ws.addRow([]);
  const dRow = ws.addRow(['Direct Cost Sub-Total',
    firstCostRowNum
      ? { formula: `SUM(B${firstCostRowNum}:B${lastCostRowNum})`, result: bd.directCost }
      : (bd.directCost || 0)]);
  dRow.getCell(1).font = { bold: true, size: 11, color: { argb: C.accent }, name: 'Calibri' };
  dRow.getCell(1).fill = fill(C.light);
  dRow.getCell(2).font = { bold: true, size: 11, color: { argb: C.accent }, name: 'Calibri' };
  dRow.getCell(2).fill = fill(C.light);
  dRow.getCell(2).numFmt = inrFmt;
  dRow.getCell(2).alignment = { horizontal: 'right' };
  dRow.eachCell(c => { c.border = border(C.accent); });
  dRow.height = 24;

  // % of Direct — live formula per line item, with visual data bars
  if (firstCostRowNum) {
    for (let rn = firstCostRowNum; rn <= lastCostRowNum; rn++) {
      const cell = ws.getCell(`C${rn}`);
      cell.value = { formula: `B${rn}/B${dRow.number}`, result: bd.directCost ? Number(ws.getCell(`B${rn}`).value?.result ?? ws.getCell(`B${rn}`).value ?? 0) / bd.directCost : 0 };
      cell.numFmt = '0.0%';
    }
    // Visual data bars on the amount column (Excel-native "chart in cell")
    ws.addConditionalFormatting({
      ref: `B${firstCostRowNum}:B${lastCostRowNum}`,
      rules: [{
        type: 'dataBar',
        cfvo: [{ type: 'min' }, { type: 'max' }],
        color: { argb: C.accent },
        gradient: true,
        priority: 1,
      }],
    });
  }
  ws.addRow([]);

  // Commercial — live formula chain
  addSectionHeader('COMMERCIAL PARAMETERS');
  altRow = false;
  const dRef = `B${dRow.number}`;
  let beforeContingency = dRef;
  if (bd.overhead > 0) {
    const oRow = addDataRow(`Overhead (${pct(bd.overheadPercent)})`,
      { formula: `${dRef}*${bd.overheadPercent / 100}`, result: bd.overhead }, { numFmt: inrFmt });
    beforeContingency = `${dRef}+B${oRow.number}`;
  }
  let production = beforeContingency;
  if (bd.contingency > 0) {
    const cRow = addDataRow(`Contingency (${pct(bd.contingencyPercent)})`,
      { formula: `(${beforeContingency})*${bd.contingencyPercent / 100}`, result: bd.contingency }, { numFmt: inrFmt });
    production = `(${beforeContingency})+B${cRow.number}`;
  }
  const mRow = addDataRow(`Margin (${pct(bd.marginPercent)})`,
    { formula: `(${production})*${bd.marginPercent / 100}`, result: bd.margin }, { numFmt: inrFmt });
  const subtotalExpr = `(${production})+B${mRow.number}`;
  // Pre-GST subtotal — shown explicitly before tax so the client sees value, then GST, then grand total.
  const subRow = addDataRow('Subtotal (excl. GST)',
    { formula: subtotalExpr, result: bd.subtotal }, { numFmt: inrFmt });
  subRow.getCell(1).font = { bold: true, size: 11, color: { argb: C.accent }, name: 'Calibri' };
  subRow.getCell(2).font = { bold: true, size: 11, color: { argb: C.accent }, name: 'Calibri' };
  const taxRow = addDataRow(`Tax / GST (${pct(bd.taxPercent)})`,
    { formula: `B${subRow.number}*${bd.taxPercent / 100}`, result: bd.tax }, { numFmt: inrFmt });
  ws.addRow([]);

  const gt = ws.addRow(['GRAND TOTAL (INR)',
    { formula: `(${subtotalExpr})+B${taxRow.number}`, result: bd.total }]);
  gt.getCell(1).font = { bold: true, size: 14, color: { argb: C.white }, name: 'Calibri' };
  gt.getCell(1).fill = fill(C.navy);
  gt.getCell(2).font = { bold: true, size: 14, color: { argb: C.gold  }, name: 'Calibri' };
  gt.getCell(2).fill = fill(C.navy);
  gt.getCell(2).numFmt = inrFmt;
  gt.getCell(2).alignment = { horizontal: 'right' };
  gt.getCell(3).fill = fill(C.navy);
  gt.eachCell(c => { c.border = border(C.gold); });
  gt.height = 36;

  if (bd.unitRate != null) {
    ws.addRow([]);
    addDataRow(`Unit Rate (per ${bd.scopeUnit || 'unit'})`, bd.unitRate, { numFmt: inrFmt });
  }

  ws.addRow([]);
  ws.mergeCells(`A${ws.rowCount + 1}:C${ws.rowCount + 1}`);
  const footerRow = ws.lastRow;
  footerRow.getCell('A').value = 'Niyamak — Advanced Drone Operational Intelligence  |  This document is confidential.';
  footerRow.getCell('A').font  = { size: 8, color: { argb: C.navy }, name: 'Calibri' };
  footerRow.getCell('A').fill  = fill(C.gold);
  footerRow.getCell('A').alignment = { horizontal: 'center' };
  footerRow.height = 18;

  // ── SHEET 2: Cost Distribution (table + data bars) ────────────────────────
  const comps = directComponents(bd);
  if (comps.length) {
    const ws3 = wb.addWorksheet('Cost Distribution');
    ws3.columns = [
      { header: 'Cost Component', key: 'label',  width: 34 },
      { header: 'Amount (INR)',   key: 'value',  width: 20 },
      { header: 'Share of Direct',key: 'share',  width: 18 },
    ];
    ws3.getRow(1).eachCell(c => {
      c.font = { bold: true, color: { argb: C.white }, size: 10 };
      c.fill = fill(C.navy);
      c.alignment = { horizontal: 'center' };
      c.border = border();
    });
    ws3.getRow(1).height = 26;

    const compTotal = comps.reduce((s, c) => s + c.value, 0) || 1;
    let alt3 = false;
    comps.sort((a, b) => b.value - a.value).forEach(cmp => {
      const r = ws3.addRow({ label: cmp.label, value: cmp.value, share: cmp.value / compTotal });
      const bg = alt3 ? C.light : C.white; alt3 = !alt3;
      r.eachCell(c => { c.fill = fill(bg); c.border = border(); c.font = { size: 10 }; });
      r.getCell('value').numFmt = inrFmt;
      r.getCell('share').numFmt = '0.0%';
      r.height = 20;
    });
    const tr = ws3.addRow({ label: 'DIRECT COST TOTAL', value: compTotal, share: 1 });
    tr.eachCell(c => { c.fill = fill(C.navy); c.font = { bold: true, color: { argb: C.white }, size: 11 }; c.border = border(C.gold); });
    tr.getCell('value').numFmt = inrFmt;
    tr.getCell('value').font = { bold: true, color: { argb: C.gold }, size: 11 };
    tr.getCell('share').numFmt = '0%';
    tr.height = 26;

    // Data bars = visual bar chart inside the Amount column
    ws3.addConditionalFormatting({
      ref: `B2:B${1 + comps.length}`,
      rules: [{
        type: 'dataBar',
        cfvo: [{ type: 'min' }, { type: 'max' }],
        color: { argb: C.accent },
        gradient: true,
        priority: 1,
      }],
    });
  }

  // ── SHEET 3: Deliverables (if any) ────────────────────────────────────────
  if (bd.deliverableBreakdown.length > 0) {
    const ws2 = wb.addWorksheet('Deliverables');
    ws2.columns = [
      { header: 'Deliverable',  key: 'label',      width: 36 },
      { header: 'Qty',          key: 'quantity',    width: 10 },
      { header: 'Unit Cost',    key: 'unit_cost',   width: 18 },
      { header: 'Prep Hours',   key: 'prep_hours',  width: 14 },
      { header: 'Line Total',   key: 'line_total',  width: 18 },
    ];
    ws2.getRow(1).eachCell(c => {
      c.font = { bold: true, color: { argb: C.white }, size: 10 };
      c.fill = fill(C.accent);
      c.alignment = { horizontal: 'center' };
      c.border = border();
    });
    ws2.getRow(1).height = 26;

    let dlAlt = false;
    bd.deliverableBreakdown.forEach(dl => {
      const r = ws2.addRow({
        label: dl.label || dl.key, quantity: dl.quantity,
        unit_cost: dl.unit_cost, prep_hours: dl.prep_hours, line_total: dl.line_total,
      });
      const bg = dlAlt ? C.light : C.white; dlAlt = !dlAlt;
      r.eachCell(c => { c.fill = fill(bg); c.border = border(); c.font = { size: 10 }; });
      r.getCell('unit_cost').numFmt  = inrFmt;
      r.getCell('line_total').numFmt = inrFmt;
      r.height = 20;
    });

    const sr = ws2.addRow({ label: 'TOTAL', quantity: '', unit_cost: '', prep_hours: '', line_total: bd.deliverableCost });
    sr.eachCell(c => { c.fill = fill(C.navy); c.font = { bold: true, color: { argb: C.white }, size: 11 }; c.border = border(C.gold); });
    sr.getCell('line_total').numFmt = inrFmt;
    sr.getCell('line_total').font = { bold: true, color: { argb: C.gold }, size: 11 };
    sr.height = 28;
  }

  // ── SHEET 4: Custom Line Items (if any) ───────────────────────────────────
  if (est.items?.length) {
    const ws4 = wb.addWorksheet('Line Items');
    ws4.columns = [
      { header: 'Category',    key: 'category',    width: 20 },
      { header: 'Description', key: 'description', width: 42 },
      { header: 'Qty',         key: 'quantity',    width: 10 },
      { header: 'Unit Cost',   key: 'unit_cost',   width: 18 },
      { header: 'Total',       key: 'total_cost',  width: 18 },
    ];
    ws4.getRow(1).eachCell(c => {
      c.font = { bold: true, color: { argb: C.white }, size: 10 };
      c.fill = fill(C.accent);
      c.alignment = { horizontal: 'center' };
      c.border = border();
    });
    ws4.getRow(1).height = 26;

    let itAlt = false;
    est.items.forEach(it => {
      const r = ws4.addRow({
        category: (it.category || '—').replace(/_/g, ' '),
        description: it.description || '—',
        quantity: safe(it.quantity) || 1,
        unit_cost: safe(it.unit_cost),
        total_cost: safe(it.total_cost),
      });
      const bg = itAlt ? C.light : C.white; itAlt = !itAlt;
      r.eachCell(c => { c.fill = fill(bg); c.border = border(); c.font = { size: 10 }; });
      r.getCell('unit_cost').numFmt  = inrFmt;
      r.getCell('total_cost').numFmt = inrFmt;
      r.height = 20;
    });

    const itTotal = est.items.reduce((s, it) => s + safe(it.total_cost), 0);
    const sr4 = ws4.addRow({ category: 'TOTAL', description: '', quantity: '', unit_cost: '', total_cost: itTotal });
    sr4.eachCell(c => { c.fill = fill(C.navy); c.font = { bold: true, color: { argb: C.white }, size: 11 }; c.border = border(C.gold); });
    sr4.getCell('total_cost').numFmt = inrFmt;
    sr4.getCell('total_cost').font = { bold: true, color: { argb: C.gold }, size: 11 };
    sr4.height = 26;
  }

  return wb.xlsx.writeBuffer();
};
