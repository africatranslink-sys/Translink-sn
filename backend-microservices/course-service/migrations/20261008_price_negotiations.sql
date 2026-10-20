ALTER TYPE demande_status ADD VALUE IF NOT EXISTS 'ANNULEE';

CREATE TABLE IF NOT EXISTS negotiation_conversations (
    id SERIAL PRIMARY KEY,
    demande_id INTEGER NOT NULL REFERENCES demandes_transport(id) ON DELETE CASCADE,
    camion_id INTEGER NOT NULL REFERENCES camions(id) ON DELETE CASCADE,
    transporteur_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chauffeur_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    statut VARCHAR(20) NOT NULL DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE', 'ACCEPTEE', 'ANNULEE')),
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (demande_id, camion_id)
);

CREATE TABLE IF NOT EXISTS negotiation_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES negotiation_conversations(id) ON DELETE CASCADE,
    expediteur_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contenu TEXT NOT NULL CHECK (length(trim(contenu)) BETWEEN 1 AND 2000),
    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS negotiation_price_proposals (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES negotiation_conversations(id) ON DELETE CASCADE,
    proposant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    montant NUMERIC(15, 2) NOT NULL CHECK (montant > 0),
    statut VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE')),
    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date_reponse TIMESTAMP
);

CREATE INDEX IF NOT EXISTS negotiation_messages_conversation_idx
    ON negotiation_messages (conversation_id, date_creation, id);
CREATE INDEX IF NOT EXISTS negotiation_proposals_conversation_idx
    ON negotiation_price_proposals (conversation_id, date_creation, id);
