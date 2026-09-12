const path    = require('path');
const fs      = require('fs');
const ExcelJS = require('exceljs');
const clientsService = require('./bd.clients.service');
const { formatDateIST } = require('../../core/utils/dateUtils');

// Mirrors frontend/src/utils/constants.js BD_STATUSES — kept local since the
// backend's own bd.validation.js only holds the valid value list, not labels.
const STATUS_LABEL = {
  to_be_initiated:  'To Be Initiated',
  wip:               'WIP',
  closed_onboard:    'Onboarded',
  closed_cancelled:  'Cancelled',
};

const LOGO_PATH = path.resolve(__dirname, '../../../../frontend/public/logo.png');

// Same brand palette as the estimation module's premium export
// (export.service.js) — kept identical so every Niyamak document looks like
// one family, not a patchwork of one-off exports.
const C = {
  navy:   'FF1E3A5F',
  accent: 'FF2563EB',
  gold:   'FFFBBF24',
  light:  'FFEFF6FF',
  gray:   'FFF8FAFC',
  white:  'FFFFFFFF',
  muted:  'FF64748B',
  text:   'FF1E293B',
  red:    'FFFEE2E2',
  redTxt: 'FFB91C1C',
  amber:  'FFFFFBEB',
  amberTxt: 'FFB45309',
};

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const border = (color = 'FFCBD5E1') => ({
  top: { style: 'thin', color: { argb: color } },
  bottom: { style: 'thin', color: { argb: color } },
  left: { style: 'thin', color: { argb: color } },
  right: { style: 'thin', color: { argb: color } },
});

const statusLabel = (v) => STATUS_LABEL[v] || v;
const yn = (v) => v ? 'Yes' : 'No';

// ── Sheet 1: the star of the show — one collapsible block per company ────────
const buildDirectorySheet = (wb, clients, contactsByClient) => {
  const ws = wb.addWorksheet('Client Directory', { views: [{ showGridLines: false }] });
  const COLS = ['Contact Name', 'Designation', 'Department', 'Decision Maker', 'Primary', 'Email', 'Phone', 'WhatsApp', 'LinkedIn'];
  ws.columns = [22, 20, 16, 14, 10, 26, 16, 16, 26].map((width, i) => ({ key: `c${i}`, width }));
  const lastCol = String.fromCharCode(64 + COLS.length); // 'I'

  // ── Letterhead ──
  if (fs.existsSync(LOGO_PATH)) {
    const logoId = wb.addImage({ filename: LOGO_PATH, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 50 } });
  }
  ws.mergeCells(`A1:${lastCol}1`);
  const title = ws.getCell('A1');
  title.value = 'NIYAMAK — BUSINESS DEVELOPMENT CLIENT DIRECTORY';
  title.font = { bold: true, size: 14, color: { argb: C.white }, name: 'Calibri' };
  title.fill = fill(C.navy);
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 44;

  ws.mergeCells(`A2:${lastCol}2`);
  const sub = ws.getCell('A2');
  sub.value = `${clients.length} client${clients.length === 1 ? '' : 's'}  |  Generated: ${formatDateIST(new Date())}`;
  sub.font = { size: 9, color: { argb: C.gold }, name: 'Calibri' };
  sub.fill = fill(C.navy);
  sub.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 20;

  ws.mergeCells(`A3:${lastCol}3`);
  ws.getCell('A3').fill = fill(C.gold);
  ws.getRow(3).height = 4;
  ws.addRow([]);

  const PRIORITY_TINT = { A: C.red, B: C.amber, C: C.gray };
  const PRIORITY_TXT  = { A: C.redTxt, B: C.amberTxt, C: C.muted };

  clients.forEach(client => {
    // Company banner — row 1: name.
    ws.mergeCells(`A${ws.rowCount + 1}:${lastCol}${ws.rowCount + 1}`);
    let r = ws.lastRow;
    r.getCell(1).value = client.name;
    r.getCell(1).font = { bold: true, size: 12, color: { argb: C.white }, name: 'Calibri' };
    r.getCell(1).fill = fill(C.navy);
    r.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    r.height = 26;

    // Company banner — row 2: metadata strip, tinted by priority.
    const meta = [
      `Priority ${client.priority}`,
      statusLabel(client.status),
      client.primary_sector_label || null,
      client.bd_owner_name ? `BD Owner: ${client.bd_owner_name}` : null,
      [client.city, client.state].filter(Boolean).join(', ') || null,
      client.website || null,
    ].filter(Boolean).join('   •   ');
    ws.mergeCells(`A${ws.rowCount + 1}:${lastCol}${ws.rowCount + 1}`);
    r = ws.lastRow;
    r.getCell(1).value = meta;
    r.getCell(1).font = { size: 9, bold: true, color: { argb: PRIORITY_TXT[client.priority] || C.muted }, name: 'Calibri' };
    r.getCell(1).fill = fill(PRIORITY_TINT[client.priority] || C.gray);
    r.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    r.height = 18;

    // Contact sub-table header.
    const hdr = ws.addRow(COLS);
    hdr.eachCell(c => {
      c.font = { bold: true, size: 9, color: { argb: C.text }, name: 'Calibri' };
      c.fill = fill(C.gray);
      c.border = border();
      c.alignment = { vertical: 'middle' };
    });
    hdr.height = 18;

    const contacts = contactsByClient.get(client.id) || [];
    if (!contacts.length) {
      ws.mergeCells(`A${ws.rowCount + 1}:${lastCol}${ws.rowCount + 1}`);
      const er = ws.lastRow;
      er.getCell(1).value = 'No contacts recorded for this client.';
      er.getCell(1).font = { italic: true, size: 9.5, color: { argb: C.muted }, name: 'Calibri' };
      er.getCell(1).alignment = { indent: 1 };
      er.outlineLevel = 1;
    } else {
      let alt = false;
      contacts.forEach(ct => {
        const row = ws.addRow([
          ct.name, ct.designation || '—', ct.department_label || '—',
          yn(ct.is_decision_maker), yn(ct.is_primary),
          ct.email || '—', ct.phone || '—', ct.whatsapp || '—', ct.linkedin || '—',
        ]);
        const bg = alt ? C.light : C.white; alt = !alt;
        row.eachCell(c => { c.fill = fill(bg); c.border = border(); c.font = { size: 9.5, name: 'Calibri' }; });
        row.outlineLevel = 1; // collapsible under the company banner
        row.height = 18;
      });
    }

    ws.addRow([]); // spacer between companies
  });
};

// ── Sheets 2 & 3: flat, filterable tables for pivoting/analysis ──────────────
const buildFlatSheet = (wb, name, columns, rows) => {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width || 18 }));
  ws.getRow(1).eachCell(c => {
    c.font = { bold: true, color: { argb: C.white }, size: 10, name: 'Calibri' };
    c.fill = fill(C.navy);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = border();
  });
  ws.getRow(1).height = 26;
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };

  let alt = false;
  rows.forEach(row => {
    const r = ws.addRow(columns.reduce((o, c) => ({ ...o, [c.key]: c.format ? c.format(row) : (row[c.key] ?? '') }), {}));
    const bg = alt ? C.light : C.white; alt = !alt;
    r.eachCell(c => { c.fill = fill(bg); c.border = border(); c.font = { size: 9.5, name: 'Calibri' }; });
    r.height = 18;
  });
};

// ── Entry point ────────────────────────────────────────────────────────────
exports.generateClientsWorkbook = async (query = {}) => {
  const { clients, contacts } = await clientsService.exportClients(query);

  const contactsByClient = new Map();
  contacts.forEach(ct => {
    if (!contactsByClient.has(ct.client_id)) contactsByClient.set(ct.client_id, []);
    contactsByClient.get(ct.client_id).push(ct);
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Niyamak';
  wb.created = new Date();

  buildDirectorySheet(wb, clients, contactsByClient);

  buildFlatSheet(wb, 'Clients', [
    { header: 'Client Name',    key: 'name', width: 26 },
    { header: 'Priority',       key: 'priority', width: 10, format: (r) => `Priority ${r.priority}` },
    { header: 'Stage',          key: 'status', width: 16, format: (r) => statusLabel(r.status) },
    { header: 'Primary Sector', key: 'primary_sector_label', width: 16 },
    { header: 'All Sectors',    key: 'sectors_label', width: 26 },
    { header: 'BD Owner',       key: 'bd_owner_name', width: 18 },
    { header: 'City',           key: 'city', width: 16 },
    { header: 'State',          key: 'state', width: 16 },
    { header: 'Address',        key: 'address', width: 26 },
    { header: 'Website',        key: 'website', width: 24 },
    { header: 'Contacts',       key: 'contact_count', width: 11 },
    { header: 'Touchpoints',    key: 'touchpoint_count', width: 12 },
    { header: 'Next Follow-up', key: 'next_follow_up_at', width: 16, format: (r) => formatDateIST(r.next_follow_up_at) },
    { header: 'Last Activity',  key: 'last_activity_at', width: 16, format: (r) => formatDateIST(r.last_activity_at) },
    { header: 'Description',    key: 'details', width: 34 },
    { header: 'Notes',          key: 'notes', width: 34 },
    { header: 'Added On',       key: 'created_at', width: 16, format: (r) => formatDateIST(r.created_at) },
  ], clients);

  buildFlatSheet(wb, 'Contacts', [
    { header: 'Client Name',     key: 'client_name', width: 26 },
    { header: 'Contact Name',    key: 'name', width: 22 },
    { header: 'Designation',     key: 'designation', width: 20 },
    { header: 'Department',      key: 'department_label', width: 18 },
    { header: 'Decision Maker',  key: 'is_decision_maker', width: 14, format: (r) => yn(r.is_decision_maker) },
    { header: 'Primary Contact', key: 'is_primary', width: 14, format: (r) => yn(r.is_primary) },
    { header: 'Email',           key: 'email', width: 26 },
    { header: 'Phone',           key: 'phone', width: 16 },
    { header: 'WhatsApp',        key: 'whatsapp', width: 16 },
    { header: 'LinkedIn',        key: 'linkedin', width: 26 },
    { header: 'Notes',           key: 'notes', width: 30 },
  ], contacts);

  return wb.xlsx.writeBuffer();
};
