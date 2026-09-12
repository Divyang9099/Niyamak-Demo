-- Migration: 019_add_drones_created_at
-- Description: Add created_at column to drones table.
--   drone.service.js queries `created_at` in SELECTs but the column never existed,
--   causing GET /resources/drones to fail with 500.

ALTER TABLE drones ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
