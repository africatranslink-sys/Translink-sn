ALTER TABLE demandes_transport
  ADD COLUMN IF NOT EXISTS heure_chargement TIME,
  ADD COLUMN IF NOT EXISTS exigences_particulieres TEXT;
