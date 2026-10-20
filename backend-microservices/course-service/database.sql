-- Translink-Africa Logistics Database Schema

CREATE TYPE user_role AS ENUM ('CHAUFFEUR', 'ENTREPRISE', 'CHARGEUR', 'ADMIN');
CREATE TYPE user_status AS ENUM ('EN_ATTENTE', 'VALIDE', 'REFUSE', 'SUSPENDU');
CREATE TYPE document_type AS ENUM ('CARTE_GRISE', 'PERMIS', 'REGISTRE_COMMERCE', 'NINEA', 'LICENCE_TRANSPORT', 'PHOTO_CAMION');
CREATE TYPE camion_status AS ENUM ('DISPONIBLE', 'EN_MISSION', 'INDISPONIBLE');
CREATE TYPE demande_status AS ENUM ('PUBLIEE', 'CAMION_TROUVE', 'CHARGEMENT', 'LIVRAISON', 'SOLDE_REGLE');
CREATE TYPE paiement_status AS ENUM ('EN_ATTENTE', 'VALIDE', 'LITIGE');
CREATE TYPE paiement_moyen AS ENUM ('WAVE', 'ORANGE_MONEY');

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'TRANSPORTEUR';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_GRISE_RECTO';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_GRISE_VERSO';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_IDENTITE';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_IDENTITE_RECTO';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_IDENTITE_VERSO';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'ASSURANCE';
ALTER TYPE demande_status ADD VALUE IF NOT EXISTS 'LIVREE';
ALTER TYPE demande_status ADD VALUE IF NOT EXISTS 'ANNULEE';
ALTER TYPE demande_status ADD VALUE IF NOT EXISTS 'TERMINEE';
ALTER TYPE paiement_moyen ADD VALUE IF NOT EXISTS 'BANQUE';
ALTER TYPE paiement_moyen ADD VALUE IF NOT EXISTS 'PAYPAL';
ALTER TYPE paiement_moyen ADD VALUE IF NOT EXISTS 'KKIAPAY';

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    telephone_whatsapp VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    mot_de_passe VARCHAR(255) NOT NULL,
    ville VARCHAR(100) NOT NULL,
    role user_role NOT NULL,
    statut_verification user_status DEFAULT 'EN_ATTENTE',
    abonnement_actif BOOLEAN DEFAULT FALSE,
    documents_submitted_at TIMESTAMP,
    avatar_url VARCHAR(500),
    invitation_token_hash VARCHAR(128),
    invitation_expires_at TIMESTAMP,
    newsletter_consent_at TIMESTAMP,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS newsletter_consent_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_debut_essai TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_fin_essai TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS documents_submitted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employeur_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS compte_paiement_type VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS compte_paiement_nom VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS compte_paiement_identifiant VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS compte_paiement_banque VARCHAR(150);

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
    id SERIAL PRIMARY KEY,
    subject VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'EN_COURS',
    recipient_count INTEGER NOT NULL DEFAULT 0,
    processed_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_campaigns_one_active_idx
    ON newsletter_campaigns ((status))
    WHERE status = 'EN_COURS';

CREATE TABLE IF NOT EXISTS newsletter_campaign_recipients (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS service_integrations (
    service_key VARCHAR(64) PRIMARY KEY,
    encrypted_config TEXT NOT NULL,
    iv VARCHAR(32) NOT NULL,
    auth_tag VARCHAR(32) NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_history (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date_connexion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    adresse_ip VARCHAR(255)
);

ALTER TABLE login_history ADD COLUMN IF NOT EXISTS navigateur VARCHAR(255);
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS appareil VARCHAR(255);
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS machine VARCHAR(255);
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS user_agent TEXT;
CREATE INDEX IF NOT EXISTS login_history_user_recent_idx
    ON login_history (utilisateur_id, date_connexion DESC);

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type_document document_type NOT NULL,
    fichier_url VARCHAR(500) NOT NULL,
    statut user_status DEFAULT 'EN_ATTENTE',
    date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS motif_refus TEXT;

CREATE TABLE camions (
    id SERIAL PRIMARY KEY,
    proprietaire_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type_vehicule VARCHAR(100) NOT NULL,
    capacite_tonnes NUMERIC(10, 2) NOT NULL,
    plaque_immatriculation VARCHAR(50) UNIQUE NOT NULL,
    statut camion_status DEFAULT 'INDISPONIBLE',
    date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    chauffeur_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE camions ADD COLUMN IF NOT EXISTS chauffeur_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS camion_id INTEGER REFERENCES camions(id) ON DELETE CASCADE;
UPDATE users u
SET documents_submitted_at = (
  SELECT MAX(d.date_ajout) FROM documents d WHERE d.utilisateur_id = u.id
)
WHERE u.documents_submitted_at IS NULL
  AND EXISTS (SELECT 1 FROM documents d WHERE d.utilisateur_id = u.id);

CREATE TABLE demandes_transport (
    id SERIAL PRIMARY KEY,
    chargeur_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ville_depart VARCHAR(100) NOT NULL,
    ville_arrivee VARCHAR(100) NOT NULL,
    nature_marchandise VARCHAR(255) NOT NULL,
    tonnage NUMERIC(10, 2) NOT NULL,
    type_camion_requis VARCHAR(100) NOT NULL,
    date_chargement DATE NOT NULL,
    heure_chargement TIME,
    prix_propose NUMERIC(15, 2),
    exigences_particulieres TEXT,
    statut demande_status DEFAULT 'PUBLIEE',
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiration_notifiee_at TIMESTAMP,
    suppression_prevue_le TIMESTAMP
);

ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS heure_chargement TIME;
ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS exigences_particulieres TEXT;
ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS expiration_notifiee_at TIMESTAMP;
ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS suppression_prevue_le TIMESTAMP;

CREATE TABLE disponibilites_camion (
    id SERIAL PRIMARY KEY,
    camion_id INTEGER REFERENCES camions(id) ON DELETE CASCADE,
    position_actuelle VARCHAR(100) NOT NULL,
    destinations_possibles TEXT NOT NULL,
    disponibilite_date DATE NOT NULL,
    statut VARCHAR(50) DEFAULT 'ACTIVE',
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    demande_id INTEGER REFERENCES demandes_transport(id) ON DELETE SET NULL,
    camion_id INTEGER REFERENCES camions(id) ON DELETE SET NULL,
    statut demande_status DEFAULT 'CAMION_TROUVE',
    commission NUMERIC(15, 2) DEFAULT 0.00,
    date_chargement_reelle TIMESTAMP,
    date_livraison_reelle TIMESTAMP,
    chauffeur_assigne_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    commission_taux NUMERIC(5, 4),
    commission_montant NUMERIC(15, 2),
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS chauffeur_assigne_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS commission_taux NUMERIC(5, 4);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS commission_montant NUMERIC(15, 2);

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

CREATE TABLE paiements (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    montant_total NUMERIC(15, 2) NOT NULL,
    montant_avance NUMERIC(15, 2) NOT NULL,
    montant_solde NUMERIC(15, 2) NOT NULL,
    statut_avance paiement_status DEFAULT 'EN_ATTENTE',
    statut_solde paiement_status DEFAULT 'EN_ATTENTE',
    moyen_paiement paiement_moyen NOT NULL,
    reference_transaction_avance VARCHAR(255),
    reference_transaction_solde VARCHAR(255),
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE paiements ADD COLUMN IF NOT EXISTS commission_taux NUMERIC(5, 4);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS commission_montant NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_avance_commission NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_solde_commission NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_avance_net NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_solde_net NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS reference_transaction_avance_chargeur VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS reference_transaction_solde_chargeur VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS statut_reversement_avance VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE';
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS statut_reversement_solde VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE';
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS reference_reversement_avance VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS reference_reversement_solde VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS date_reversement_avance TIMESTAMP;
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS date_reversement_solde TIMESTAMP;
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS date_validation_avance TIMESTAMP;
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS date_validation_solde TIMESTAMP;
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS paypal_order_id_avance VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS paypal_order_id_solde VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_usd_avance NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_usd_solde NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS frais_paypal_usd_avance NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS frais_paypal_usd_solde NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS frais_paypal_reel_usd_avance NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS frais_paypal_reel_usd_solde NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS frais_reversement_paypal_reel_usd_avance NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS frais_reversement_paypal_reel_usd_solde NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS taux_conversion_usd_avance NUMERIC(18, 8);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS taux_conversion_usd_solde NUMERIC(18, 8);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_usd_reversement_avance NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_usd_reversement_solde NUMERIC(15, 2);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS taux_conversion_reversement_avance NUMERIC(18, 8);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS taux_conversion_reversement_solde NUMERIC(18, 8);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS kkiapay_partner_id_avance VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS kkiapay_partner_id_solde VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS paiements_one_per_course_idx ON paiements (course_id);

CREATE TABLE IF NOT EXISTS abonnements (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan VARCHAR(30) NOT NULL DEFAULT 'PRO',
    periode VARCHAR(20) NOT NULL CHECK (periode IN ('MONTHLY', 'ANNUAL')),
    statut VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'ACTIF', 'EXPIRE', 'ANNULE')),
    montant NUMERIC(15, 2) NOT NULL,
    remise_taux NUMERIC(5, 4) NOT NULL DEFAULT 0,
    moyen_paiement paiement_moyen,
    reference_transaction VARCHAR(255),
    date_debut TIMESTAMP,
    date_fin TIMESTAMP,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS kkiapay_partner_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS abonnements_user_status_idx ON abonnements (utilisateur_id, statut, date_fin);

CREATE TABLE IF NOT EXISTS subscription_reminder_emails (
    reminder_key VARCHAR(255) PRIMARY KEY,
    reminder_type VARCHAR(30) NOT NULL CHECK (reminder_type IN ('TRIAL_ENDING', 'SUBSCRIPTION_RENEWAL')),
    utilisateur_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    abonnement_id INTEGER REFERENCES abonnements(id) ON DELETE CASCADE,
    date_echeance TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS subscription_reminder_pending_idx
  ON subscription_reminder_emails (status, created_at);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    titre VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS lu BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_label VARCHAR(100);
