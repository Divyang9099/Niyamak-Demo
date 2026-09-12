-- ============================================================================
-- 038_project_invoices.sql
--
-- Project Invoices module — stores uploaded invoice PDFs with extracted/manual
-- line-item data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_invoices (
  id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id     UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invoice_number TEXT,
  invoice_date   DATE,
  vendor_name    TEXT,
  vendor_gstin   TEXT,
  buyer_name     TEXT,
  buyer_gstin    TEXT,
  subtotal       NUMERIC(14,2),
  tax_amount     NUMERIC(14,2),
  total_amount   NUMERIC(14,2),
  file_key       TEXT,
  file_name      TEXT,
  status         TEXT         NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','confirmed')),
  extracted_raw  JSONB,
  notes          TEXT,
  created_by     UUID         REFERENCES users(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_invoice_items (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id    UUID         NOT NULL REFERENCES project_invoices(id) ON DELETE CASCADE,
  description   TEXT         NOT NULL DEFAULT '',
  qty           NUMERIC(10,3),
  unit          TEXT,
  rate          NUMERIC(14,2),
  taxable_value NUMERIC(14,2),
  tax_percent   NUMERIC(6,3),
  tax_amount    NUMERIC(14,2),
  amount        NUMERIC(14,2),
  sort_order    INT          NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS project_invoices_project_id_idx ON project_invoices(project_id);
CREATE INDEX IF NOT EXISTS project_invoice_items_invoice_id_idx ON project_invoice_items(invoice_id);
