ALTER TABLE demandes_transport
  ADD COLUMN IF NOT EXISTS expiration_notifiee_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS suppression_prevue_le TIMESTAMP;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS action_label VARCHAR(100);
