-- Outbound WhatsApp message log (lead-generation messaging).
-- Records every send attempt for traceability and delivery debugging.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id     UUID REFERENCES pipeline(id) ON DELETE SET NULL,
    to_number       TEXT NOT NULL,
    body            TEXT,                 -- text body (null when a template is used)
    template        TEXT,                 -- template name (null for plain text)
    provider_msg_id TEXT,                 -- Meta message id (wamid.*) on success
    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','failed','skipped')),
    error           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_pipeline ON whatsapp_messages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status   ON whatsapp_messages(status);
