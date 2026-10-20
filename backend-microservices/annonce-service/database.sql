-- Translink-Africa Logistics Database Schema

CREATE TYPE user_role AS ENUM ('CHAUFFEUR', 'ENTREPRISE', 'CHARGEUR', 'ADMIN');
CREATE TYPE user_status AS ENUM ('EN_ATTENTE', 'VALIDE', 'REFUSE', 'SUSPENDU');
CREATE TYPE document_type AS ENUM ('CARTE_GRISE', 'PERMIS', 'REGISTRE_COMMERCE', 'NINEA', 'LICENCE_TRANSPORT', 'PHOTO_CAMION');
CREATE TYPE camion_status AS ENUM ('DISPONIBLE', 'EN_MISSION', 'INDISPONIBLE');
CREATE TYPE demande_status AS ENUM ('PUBLIEE', 'CAMION_TROUVE', 'CHARGEMENT', 'LIVRAISON', 'SOLDE_REGLE', 'ANNULEE');
CREATE TYPE paiement_status AS ENUM ('EN_ATTENTE', 'VALIDE', 'LITIGE');
CREATE TYPE paiement_moyen AS ENUM ('WAVE', 'ORANGE_MONEY');

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
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS documents_submitted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_debut_essai TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_fin_essai TIMESTAMP;

CREATE TABLE IF NOT EXISTS service_integrations (
    service_key VARCHAR(64) PRIMARY KEY,
    encrypted_config TEXT NOT NULL,
    iv VARCHAR(32) NOT NULL,
    auth_tag VARCHAR(32) NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type_document document_type NOT NULL,
    fichier_url VARCHAR(500) NOT NULL,
    statut user_status DEFAULT 'EN_ATTENTE',
    date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE camions (
    id SERIAL PRIMARY KEY,
    proprietaire_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type_vehicule VARCHAR(100) NOT NULL,
    capacite_tonnes NUMERIC(10, 2) NOT NULL,
    plaque_immatriculation VARCHAR(50) UNIQUE NOT NULL,
    statut camion_status DEFAULT 'INDISPONIBLE',
    date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS camion_id INTEGER REFERENCES camions(id) ON DELETE CASCADE;
ALTER TABLE camions ADD COLUMN IF NOT EXISTS chauffeur_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

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
    suppression_prevue_le TIMESTAMP,
    quartier_chargement VARCHAR(255),
    position_lng DOUBLE PRECISION,
    position_lat DOUBLE PRECISION
);

ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS quartier_chargement VARCHAR(255);
ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS position_lng DOUBLE PRECISION;
ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS position_lat DOUBLE PRECISION;
ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS heure_chargement TIME;
ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS exigences_particulieres TEXT;
ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS expiration_notifiee_at TIMESTAMP;
ALTER TABLE demandes_transport ADD COLUMN IF NOT EXISTS suppression_prevue_le TIMESTAMP;

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    titre VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lu BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    action_label VARCHAR(100)
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_label VARCHAR(100);

CREATE TABLE IF NOT EXISTS annonces_moderation_archive (
    id SERIAL PRIMARY KEY,
    annonce_id INTEGER NOT NULL,
    chargeur_id INTEGER,
    chargeur_nom VARCHAR(255),
    chargeur_email VARCHAR(255),
    motif TEXT NOT NULL,
    annonce_data JSONB NOT NULL,
    supprime_par INTEGER,
    date_suppression TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE disponibilites_camion (
    id SERIAL PRIMARY KEY,
    camion_id INTEGER REFERENCES camions(id) ON DELETE CASCADE,
    position_actuelle VARCHAR(100) NOT NULL,
    destinations_possibles TEXT NOT NULL,
    disponibilite_date DATE NOT NULL,
    statut VARCHAR(50) DEFAULT 'ACTIVE',
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    position_lng DOUBLE PRECISION,
    position_lat DOUBLE PRECISION,
    destination_lng DOUBLE PRECISION,
    destination_lat DOUBLE PRECISION
);

ALTER TABLE disponibilites_camion ADD COLUMN IF NOT EXISTS position_lng DOUBLE PRECISION;
ALTER TABLE disponibilites_camion ADD COLUMN IF NOT EXISTS position_lat DOUBLE PRECISION;
ALTER TABLE disponibilites_camion ADD COLUMN IF NOT EXISTS destination_lng DOUBLE PRECISION;
ALTER TABLE disponibilites_camion ADD COLUMN IF NOT EXISTS destination_lat DOUBLE PRECISION;

WITH ranked_active_routes AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY camion_id ORDER BY date_creation DESC, id DESC) AS route_rank
    FROM disponibilites_camion
    WHERE statut = 'ACTIVE'
)
UPDATE disponibilites_camion AS route SET statut = 'REMPLACEE'
FROM ranked_active_routes
WHERE route.id = ranked_active_routes.id AND ranked_active_routes.route_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS disponibilites_one_active_route_per_camion_idx
    ON disponibilites_camion (camion_id) WHERE statut = 'ACTIVE';

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
