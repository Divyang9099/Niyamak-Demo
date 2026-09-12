-- Migration: 011_company_config_defaults
-- Adds estimation default rates to company_config

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS default_overhead_percent      DECIMAL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS default_margin_percent        DECIMAL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS default_contingency_percent   DECIMAL DEFAULT 5;
