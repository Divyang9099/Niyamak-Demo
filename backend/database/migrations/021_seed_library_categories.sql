-- Migration 021: Seed the 7 PRD top-level library categories (§8.2).
-- Idempotent — uses NOT EXISTS so re-running is safe and won't duplicate.
-- Also widens the table with optional description + sort order columns.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='library_categories' AND column_name='description') THEN
    ALTER TABLE library_categories ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='library_categories' AND column_name='sort_order') THEN
    ALTER TABLE library_categories ADD COLUMN sort_order INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='library_categories' AND column_name='icon') THEN
    ALTER TABLE library_categories ADD COLUMN icon TEXT;
  END IF;
END $$;

-- Dedupe before applying unique constraint:
-- keep the oldest row per name, repoint any documents on duplicates, then drop the dupes.
DO $$
DECLARE
  dup_rec RECORD;
  keep_id UUID;
BEGIN
  FOR dup_rec IN
    SELECT name FROM library_categories GROUP BY name HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keep_id FROM library_categories
      WHERE name = dup_rec.name ORDER BY id LIMIT 1;
    -- Repoint documents on duplicates to the keeper
    UPDATE library_documents SET category_id = keep_id
      WHERE category_id IN (
        SELECT id FROM library_categories WHERE name = dup_rec.name AND id <> keep_id
      );
    -- Delete the duplicates
    DELETE FROM library_categories WHERE name = dup_rec.name AND id <> keep_id;
  END LOOP;
END $$;

-- Unique constraint on name (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_categories_name_unique'
  ) THEN
    ALTER TABLE library_categories
      ADD CONSTRAINT library_categories_name_unique UNIQUE (name);
  END IF;
END $$;

-- Seed the 7 PRD categories (idempotent via ON CONFLICT)
INSERT INTO library_categories (name, description, sort_order, icon) VALUES
    ('Branding',                  'Company logos (various formats), brand guidelines, letterheads, email signatures, presentation templates',                            10, 'palette'),
    ('Marketing',                 'Company profile, capability decks, brochures, case studies, sector-specific one-pagers, testimonial documents',                       20, 'campaign'),
    ('Templates',                 'Project proposal templates, work order templates, quotation formats, NDA templates, client onboarding forms',                         30, 'description'),
    ('Operation Formats',         'Pre-flight checklists, post-flight reports, equipment maintenance logs, pilot field report formats, incident report templates',       40, 'checklist'),
    ('Compliance & Certifications','DGCA approvals, drone registration certificates, pilot licenses, insurance documents, operator certifications',                       50, 'verified'),
    ('Technical Manuals',         'Drone equipment user manuals, sensor specifications, software user guides, data processing SOPs',                                     60, 'menu_book'),
    ('HR & Admin',                'Offer letter templates, expense claim formats, travel request forms, company policies',                                                70, 'badge')
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order,
    icon        = EXCLUDED.icon;
