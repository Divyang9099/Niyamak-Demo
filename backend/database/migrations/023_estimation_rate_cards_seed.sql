-- Migration 023: Estimation rate-card seeding (PRD §10.3) + cost-engine config defaults.
-- Extends company_config with default GST and per-diem amount, seeds the
-- estimation_rate_cards table with PRD-aligned default rows.

-- 1) company_config additions ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_config' AND column_name='default_tax_percent') THEN
    ALTER TABLE company_config ADD COLUMN default_tax_percent NUMERIC(5,2) DEFAULT 18
      CHECK (default_tax_percent >= 0 AND default_tax_percent <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_config' AND column_name='default_per_diem_amount') THEN
    ALTER TABLE company_config ADD COLUMN default_per_diem_amount NUMERIC(10,2) DEFAULT 1500
      CHECK (default_per_diem_amount >= 0);
  END IF;
END $$;

-- 2) Add a description column to rate cards so the UI can render context ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estimation_rate_cards' AND column_name='description') THEN
    ALTER TABLE estimation_rate_cards ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estimation_rate_cards' AND column_name='sort_order') THEN
    ALTER TABLE estimation_rate_cards ADD COLUMN sort_order INTEGER DEFAULT 0;
  END IF;
END $$;

-- 3) Unique constraint on (category, item_name) so seeds are idempotent
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimation_rate_cards_cat_item_unique') THEN
    -- Dedupe first
    DELETE FROM estimation_rate_cards a
      USING estimation_rate_cards b
     WHERE a.category = b.category AND a.item_name = b.item_name AND a.id > b.id;
    ALTER TABLE estimation_rate_cards
      ADD CONSTRAINT estimation_rate_cards_cat_item_unique UNIQUE (category, item_name);
  END IF;
END $$;

-- 4) Seed PRD-aligned defaults (idempotent via ON CONFLICT) ─────────────────
INSERT INTO estimation_rate_cards (category, item_name, unit, rate, description, sort_order) VALUES
    -- Travel modes (per km)
    ('travel', 'road',  'km',   12,    'Surface road travel rate per km',   10),
    ('travel', 'rail',  'km',   8,     'Rail travel rate per km per person', 20),
    ('travel', 'air',   'trip', 8500,  'Air travel rate per round trip per person', 30),

    -- Accommodation (per night)
    ('accommodation', 'tier_1_metro', 'night', 4500, 'Tier-1 metro (Mumbai, Delhi, Bangalore, Chennai, Kolkata, Hyderabad)', 10),
    ('accommodation', 'tier_2_city',  'night', 3000, 'Tier-2 city (state capitals, large cities)',                          20),
    ('accommodation', 'tier_3_town',  'night', 2000, 'Tier-3 town / remote site lodging',                                    30),

    -- Per-diem rates by city tier (per person per day)
    ('per_diem', 'tier_1_metro', 'day', 2000, 'Tier-1 metro per-diem per person per day', 10),
    ('per_diem', 'tier_2_city',  'day', 1500, 'Tier-2 city per-diem per person per day',  20),
    ('per_diem', 'tier_3_town',  'day', 1000, 'Tier-3 town per-diem per person per day',  30),

    -- Software licenses (per project)
    ('software', 'pix4d_mapper',     'project', 12000, 'Pix4Dmapper photogrammetry processing license cost amortised per project', 10),
    ('software', 'agisoft_metashape','project', 10000, 'Agisoft Metashape processing license cost amortised per project',          20),
    ('software', 'dronedeploy',      'project', 8000,  'DroneDeploy cloud processing per project',                                  30),
    ('software', 'reality_capture',  'project', 9000,  'Reality Capture point-cloud processing per project',                        40),

    -- Deliverable preparation (per item, includes prep hours)
    ('deliverable', 'orthomosaic',           'item', 3000, 'Orthomosaic generation and QC per AOI',  10),
    ('deliverable', 'point_cloud',           'item', 4500, 'Point cloud cleanup and export per AOI', 20),
    ('deliverable', 'thermal_report',        'item', 2500, 'Thermal inspection report with anomaly tagging', 30),
    ('deliverable', 'inspection_report_pdf', 'item', 3500, 'Full inspection report PDF (50–100 pages)', 40),
    ('deliverable', 'raw_images',            'item',  500, 'Raw image package preparation and delivery', 50),
    ('deliverable', 'processed_video',       'item', 2000, 'Processed inspection video edit', 60),
    ('deliverable', 'volume_report',         'item', 4000, 'Stockpile volume calculation report per stockpile', 70),
    ('deliverable', '3d_model',              'item', 5500, 'Textured 3D model export', 80),
    ('deliverable', 'kml_output',            'item',  800, 'KML/KMZ boundary or route export', 90),

    -- Report writing (hourly)
    ('report_writing', 'standard_hour', 'hour', 1200, 'Standard report writing hourly rate', 10),
    ('report_writing', 'senior_hour',   'hour', 2000, 'Senior analyst report writing hourly rate', 20),

    -- Data storage & transfer
    ('storage', 'small_under_50gb',  'project',  500,  'Storage + transfer fee for projects under 50 GB',  10),
    ('storage', 'medium_50_to_200gb','project', 1500, 'Storage + transfer fee for 50–200 GB projects',     20),
    ('storage', 'large_over_200gb',  'project', 4000, 'Storage + transfer fee for >200 GB projects',       30)
ON CONFLICT (category, item_name) DO UPDATE SET
    unit        = EXCLUDED.unit,
    rate        = EXCLUDED.rate,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order;

-- 5) Index for fast lookup by category
CREATE INDEX IF NOT EXISTS idx_estimation_rate_cards_category_active
    ON estimation_rate_cards(category, is_active);
