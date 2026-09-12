-- 1. FOLDERS
CREATE TABLE IF NOT EXISTS library_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES library_folders(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TAGS
CREATE TABLE IF NOT EXISTS library_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);

-- 3. Update library_documents
ALTER TABLE library_documents 
ADD COLUMN folder_id UUID REFERENCES library_folders(id) ON DELETE SET NULL,
ADD COLUMN file_size BIGINT,
ADD COLUMN file_type TEXT;

-- 4. FILE TAGS MAPPING
CREATE TABLE IF NOT EXISTS library_file_tags (
    document_id UUID REFERENCES library_documents(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES library_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);
