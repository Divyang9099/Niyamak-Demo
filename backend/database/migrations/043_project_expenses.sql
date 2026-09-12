-- 043 — Project Expenses Table
-- Renumbered from the original unprefixed create_project_expenses.sql so the
-- migration runner applies it in correct lexical order on a fresh database.
-- Fully idempotent (IF NOT EXISTS throughout) — safe to re-run.

CREATE TABLE IF NOT EXISTS project_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  added_by      UUID NOT NULL REFERENCES users(id),
  member_id     UUID REFERENCES users(id),           -- which project member this expense is attributed to
  method        VARCHAR(30) NOT NULL DEFAULT 'cash', -- cash | online | card | cheque | upi
  bank_name     VARCHAR(120),                        -- optional
  category      VARCHAR(60) NOT NULL DEFAULT 'general', -- fuel | accommodation | equipment | labour | misc | general
  description   TEXT,
  expense_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_expenses_project   ON project_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_date      ON project_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_project_expenses_category  ON project_expenses(category);
CREATE INDEX IF NOT EXISTS idx_project_expenses_member    ON project_expenses(member_id);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_project_expenses_updated_at ON project_expenses;
CREATE TRIGGER trg_project_expenses_updated_at
  BEFORE UPDATE ON project_expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
