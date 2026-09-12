const db     = require('../../../../core/config/db');
const audit  = require('../../../audit/audit.service');

// ── Python-based PDF extraction ──────────────────────────────────────────────
// Spawns pdf_extract.py which uses PyMuPDF + pdfplumber + pytesseract (OCR).
// Returns the full structured result (fields, items, raw_text, status, method).
const os   = require('os');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

const EXTRACT_SCRIPT = path.join(__dirname, 'pdf_extract.py');

// Interpreter: Windows ships `python`, Linux ships `python3`. In production set
// PYTHON_BIN to the venv interpreter that has PyMuPDF/pdfplumber/pytesseract.
const PYTHON_BIN = process.env.PYTHON_BIN ||
  (process.platform === 'win32' ? 'python' : 'python3');

// ── Filename fallback ─────────────────────────────────────────────────────────
// Generated invoice PDFs are usually named like
//   Invoice_VAI-13_Lesoko-Technologies-Private-Limited_28-04-2026.pdf
// so even when the PDF has no text layer (or Python isn't available) we can still
// auto-fill the three header fields from the filename. Pure JS, no dependencies.
function parseFilenameFields(originalName) {
  const out = {};
  if (!originalName || typeof originalName !== 'string') return out;
  const base = originalName.replace(/\.[A-Za-z0-9]+$/, '');
  const pad  = (n) => String(n).padStart(2, '0');

  // Date — yyyy-mm-dd or dd-mm-yyyy (separators - _ .)
  const ymd = base.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  const dmy = base.match(/(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})/);
  if (ymd)      out.invoice_date = `${ymd[1]}-${pad(ymd[2])}-${pad(ymd[3])}`;
  else if (dmy) out.invoice_date = `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;

  // Invoice number — 2–6 letters + optional separator + digits (VAI-13, INV2026…)
  const num = base.match(/\b([A-Za-z]{2,6})[-/ _]?(\d{1,6})\b/);
  if (num) out.invoice_number = `${num[1].toUpperCase()}-${num[2]}`;

  // Vendor — first underscore-separated alpha chunk that isn't "invoice",
  // the number, or a date.
  for (const t of base.split('_').map(s => s.trim()).filter(Boolean)) {
    if (/^invoice$/i.test(t)) continue;
    if (/^\d/.test(t)) continue;
    if (num && new RegExp(`^${num[1]}[-/ _]?${num[2]}$`, 'i').test(t)) continue;
    if (/[A-Za-z]{3,}/.test(t)) {
      out.vendor_name = t.replace(/[-]+/g, ' ').replace(/\s+/g, ' ').trim();
      break;
    }
  }
  return out;
}

// Merge Python result with the filename fallback. Python wins; the filename only
// fills header fields Python left blank, and provides everything if Python failed.
function finalize(result, originalName) {
  const fnFields = parseFilenameFields(originalName);
  if (!result) {
    const has = Object.keys(fnFields).length > 0;
    return {
      fields: fnFields,
      items: [],
      raw_text: null,
      extraction_status: has ? 'no_match' : 'error',
      extraction_method: has ? 'filename' : 'none',
    };
  }
  result.fields = result.fields || {};
  for (const k of ['invoice_number', 'vendor_name', 'invoice_date']) {
    if ((result.fields[k] == null || result.fields[k] === '') && fnFields[k]) {
      result.fields[k] = fnFields[k];
    }
  }
  return result;
}

function runPythonExtract(bufferOrPath, deletePath = true) {
  return new Promise((resolve) => {
    let pdfPath;
    let isTemp = false;

    if (typeof bufferOrPath === 'string') {
      // Already a file path (disk storage)
      pdfPath = bufferOrPath;
      isTemp  = false;
    } else {
      // Buffer — write to temp file
      pdfPath  = path.join(os.tmpdir(), `inv_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(pdfPath, bufferOrPath);
      isTemp   = true;
    }

    let stdout = '';
    let stderr = '';
    const py = spawn(PYTHON_BIN, [EXTRACT_SCRIPT, pdfPath], {
      timeout: 90_000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });

    py.stdout.on('data', d => { stdout += d.toString(); });
    py.stderr.on('data', d => { stderr += d.toString(); });

    const cleanup = () => { if (isTemp || deletePath) { try { fs.unlinkSync(pdfPath); } catch (_) {} } };

    py.on('close', () => {
      cleanup();
      if (stderr) console.log('[invoice extract] python stderr:', stderr.slice(0, 400));
      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) { console.error('[invoice extract] python error:', result.error); resolve(null); }
        else              { resolve(result); }
      } catch (_) {
        console.error('[invoice extract] python parse error. stdout:', stdout.slice(0, 200));
        resolve(null);
      }
    });

    py.on('error', (err) => {
      cleanup();
      console.error('[invoice extract] spawn error:', err.message);
      resolve(null);
    });
  });
}

// ── Service exports ─────────────────────────────────────────────────────────

// Called when multer used disk storage (req.file.path exists)
exports.extractFromPath = async (filePath, originalName) => {
  const result = await runPythonExtract(filePath, false); // false = don't delete, multer manages it
  return finalize(result, originalName);
};

// Called when multer used memory storage (req.file.buffer exists)
exports.extractFromBuffer = async (buffer, originalName) => {
  const result = await runPythonExtract(buffer, true); // true = delete temp file after
  return finalize(result, originalName);
};

exports.listInvoices = async (projectId) => {
  const r = await db.query(
    `SELECT i.*,
            (SELECT json_agg(it ORDER BY it.sort_order)
               FROM project_invoice_items it WHERE it.invoice_id = i.id) AS items
     FROM project_invoices i
     WHERE i.project_id = $1
     ORDER BY i.created_at DESC`,
    [projectId]
  );
  return r.rows;
};

exports.getInvoice = async (projectId, invoiceId) => {
  const r = await db.query(
    `SELECT i.*,
            (SELECT json_agg(it ORDER BY it.sort_order)
               FROM project_invoice_items it WHERE it.invoice_id = i.id) AS items
     FROM project_invoices i
     WHERE i.id = $1 AND i.project_id = $2`,
    [invoiceId, projectId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
  return r.rows[0];
};

exports.createInvoice = async (projectId, data, userId) => {
  const { items = [], ...fields } = data;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO project_invoices
         (project_id, invoice_number, invoice_date, vendor_name, vendor_gstin,
          buyer_name, buyer_gstin, subtotal, tax_amount, total_amount,
          file_key, file_name, status, extracted_raw, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [projectId, fields.invoice_number || null, fields.invoice_date || null,
       fields.vendor_name || null, fields.vendor_gstin || null,
       fields.buyer_name || null, fields.buyer_gstin || null,
       fields.subtotal || null, fields.tax_amount || null, fields.total_amount || null,
       fields.file_key || null, fields.file_name || null,
       fields.status || 'draft',
       fields.extracted_raw ? JSON.stringify(fields.extracted_raw) : null,
       fields.notes || null, userId]
    );
    const invoice = r.rows[0];
    if (items.length) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await client.query(
          `INSERT INTO project_invoice_items
             (invoice_id, description, qty, unit, rate, taxable_value, tax_percent, tax_amount, amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [invoice.id, it.description || '', it.qty || null, it.unit || null,
           it.rate || null, it.taxable_value || null, it.tax_percent || null,
           it.tax_amount || null, it.amount || null, i]
        );
      }
    }
    await client.query('COMMIT');
    await audit.log({ user_id: userId, action: 'CREATE_INVOICE', entity_type: 'project', entity_id: projectId, new_value: { invoice_id: invoice.id } });
    return exports.getInvoice(projectId, invoice.id);
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
};

exports.updateInvoice = async (projectId, invoiceId, data, userId) => {
  const { items, ...fields } = data;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE project_invoices SET
         invoice_number = COALESCE($1, invoice_number),
         invoice_date   = COALESCE($2, invoice_date),
         vendor_name    = COALESCE($3, vendor_name),
         vendor_gstin   = COALESCE($4, vendor_gstin),
         buyer_name     = COALESCE($5, buyer_name),
         buyer_gstin    = COALESCE($6, buyer_gstin),
         subtotal       = COALESCE($7, subtotal),
         tax_amount     = COALESCE($8, tax_amount),
         total_amount   = COALESCE($9, total_amount),
         status         = COALESCE($10, status),
         notes          = COALESCE($11, notes),
         updated_at     = NOW()
       WHERE id = $12 AND project_id = $13`,
      [fields.invoice_number, fields.invoice_date, fields.vendor_name,
       fields.vendor_gstin, fields.buyer_name, fields.buyer_gstin,
       fields.subtotal, fields.tax_amount, fields.total_amount,
       fields.status, fields.notes, invoiceId, projectId]
    );
    if (Array.isArray(items)) {
      await client.query('DELETE FROM project_invoice_items WHERE invoice_id = $1', [invoiceId]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await client.query(
          `INSERT INTO project_invoice_items
             (invoice_id, description, qty, unit, rate, taxable_value, tax_percent, tax_amount, amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [invoiceId, it.description || '', it.qty || null, it.unit || null,
           it.rate || null, it.taxable_value || null, it.tax_percent || null,
           it.tax_amount || null, it.amount || null, i]
        );
      }
    }
    await client.query('COMMIT');
    return exports.getInvoice(projectId, invoiceId);
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
};

exports.deleteInvoice = async (projectId, invoiceId) => {
  const r = await db.query('DELETE FROM project_invoices WHERE id=$1 AND project_id=$2 RETURNING id', [invoiceId, projectId]);
  if (!r.rows.length) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
};

exports.getDownloadUrl = async (projectId, invoiceId) => {
  const { getPresignedUrl } = require('../../../../core/utils/r2Download');
  const inv = await exports.getInvoice(projectId, invoiceId);
  if (!inv.file_key) throw Object.assign(new Error('No PDF attached to this invoice'), { statusCode: 404 });
  const url = await getPresignedUrl(inv.file_key, 3600, inv.file_name || `invoice-${inv.invoice_number || inv.id}.pdf`);
  return { url, file_name: inv.file_name };
};
