-- Translink-Africa Logistics Database Schema

CREATE TYPE user_role AS ENUM ('CHAUFFEUR', 'ENTREPRISE', 'CHARGEUR', 'TRANSPORTEUR', 'ADMIN');
CREATE TYPE user_status AS ENUM ('EN_ATTENTE', 'VALIDE', 'REFUSE', 'SUSPENDU');
CREATE TYPE document_type AS ENUM ('CARTE_GRISE', 'CARTE_GRISE_RECTO', 'CARTE_GRISE_VERSO', 'CARTE_IDENTITE', 'CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO', 'ASSURANCE', 'PERMIS', 'REGISTRE_COMMERCE', 'NINEA', 'LICENCE_TRANSPORT', 'PHOTO_CAMION');
CREATE TYPE camion_status AS ENUM ('DISPONIBLE', 'EN_MISSION', 'INDISPONIBLE');
CREATE TYPE demande_status AS ENUM ('PUBLIEE', 'CAMION_TROUVE', 'CHARGEMENT', 'LIVRAISON', 'SOLDE_REGLE');
CREATE TYPE paiement_status AS ENUM ('EN_ATTENTE', 'VALIDE', 'LITIGE');
CREATE TYPE paiement_moyen AS ENUM ('WAVE', 'ORANGE_MONEY');

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_GRISE_RECTO';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_GRISE_VERSO';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_IDENTITE';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_IDENTITE_RECTO';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'CARTE_IDENTITE_VERSO';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'ASSURANCE';

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    telephone_whatsapp VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    mot_de_passe VARCHAR(255) NOT NULL,
    ville VARCHAR(100) NOT NULL,
    role user_role NOT NULL,
    numero_cni_nin VARCHAR(50),
    statut_verification user_status DEFAULT 'EN_ATTENTE',
    abonnement_actif BOOLEAN DEFAULT FALSE,
    documents_submitted_at TIMESTAMP,
    avatar_url VARCHAR(500),
    invitation_token_hash VARCHAR(128),
    invitation_expires_at TIMESTAMP,
    newsletter_consent_at TIMESTAMP,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_token_hash VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS newsletter_consent_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS documents_submitted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_debut_essai TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_fin_essai TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employeur_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS numero_cni_nin VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS compte_paiement_type VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS compte_paiement_nom VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS compte_paiement_identifiant VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS compte_paiement_banque VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS trajet_ville_depart VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS trajet_ville_destination VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS trajet_depart_lng DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trajet_depart_lat DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trajet_destination_lng DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trajet_destination_lat DOUBLE PRECISION;
CREATE UNIQUE INDEX IF NOT EXISTS users_numero_cni_nin_unique_idx ON users (numero_cni_nin) WHERE numero_cni_nin IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_payment_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method VARCHAR(30) NOT NULL CHECK (method IN ('WAVE', 'ORANGE_MONEY', 'PAYPAL', 'BANQUE')),
    holder VARCHAR(255) NOT NULL,
    identifier VARCHAR(120) NOT NULL,
    bank VARCHAR(150),
    can_receive BOOLEAN NOT NULL DEFAULT FALSE,
    can_send BOOLEAN NOT NULL DEFAULT FALSE,
    is_default_receive BOOLEAN NOT NULL DEFAULT FALSE,
    is_default_send BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, method),
    CHECK (NOT is_default_receive OR can_receive),
    CHECK (NOT is_default_send OR can_send)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_payment_accounts_default_receive_idx
    ON user_payment_accounts (user_id) WHERE is_default_receive;
CREATE UNIQUE INDEX IF NOT EXISTS user_payment_accounts_default_send_idx
    ON user_payment_accounts (user_id) WHERE is_default_send;

INSERT INTO user_payment_accounts
    (user_id, method, holder, identifier, bank, can_receive, is_default_receive)
SELECT id, compte_paiement_type, compte_paiement_nom, compte_paiement_identifiant,
       compte_paiement_banque, TRUE, TRUE
FROM users
WHERE compte_paiement_type IN ('WAVE', 'ORANGE_MONEY', 'PAYPAL', 'BANQUE')
  AND COALESCE(compte_paiement_nom, '') <> ''
  AND COALESCE(compte_paiement_identifiant, '') <> ''
ON CONFLICT (user_id, method) DO NOTHING;

CREATE TABLE IF NOT EXISTS service_integrations (
    service_key VARCHAR(64) PRIMARY KEY,
    encrypted_config TEXT NOT NULL,
    iv VARCHAR(32) NOT NULL,
    auth_tag VARCHAR(32) NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_integration_maintenance (
    service_key VARCHAR(64) PRIMARY KEY,
    maintenance BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_integration_password (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    password_hash VARCHAR(255) NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_history (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date_connexion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    adresse_ip VARCHAR(255),
    navigateur VARCHAR(255),
    appareil VARCHAR(255),
    machine VARCHAR(255),
    user_agent TEXT
);

ALTER TABLE login_history ADD COLUMN IF NOT EXISTS navigateur VARCHAR(255);
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS appareil VARCHAR(255);
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS machine VARCHAR(255);
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS user_agent TEXT;

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
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
