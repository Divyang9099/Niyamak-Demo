-- Migration: 062_pipeline_sales_executive
-- Purpose: Records which sales executive owns a pipeline opportunity.
--
-- Stored as free text, not a users FK: sales executives are not Niyamak
-- account holders, so there is no user row to point at.

ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS sales_executive TEXT;

-- The board searches and sorts by owner; only named rows are worth indexing.
CREATE INDEX IF NOT EXISTS idx_pipeline_sales_executive
  ON pipeline (sales_executive) WHERE sales_executive IS NOT NULL;
