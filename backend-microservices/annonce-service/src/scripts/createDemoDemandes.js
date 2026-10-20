const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'translink',
  password: process.env.DB_PASSWORD || 'postgres',
  port: Number(process.env.DB_PORT || 5432)
});

const sampleProfiles = [
  { nom: 'Amina Diop', role: 'CHARGEUR', email: 'amina.diop@demo.translink.sn', telephone: '+221771000111', ville: 'Dakar', pays: 'Sénégal' },
  { nom: 'Koffi Mensah', role: 'CHARGEUR', email: 'koffi.mensah@demo.translink.ci', telephone: '+225070000111', ville: 'Abidjan', pays: 'Côte d’Ivoire' },
  { nom: 'Moussa Coulibaly', role: 'CHARGEUR', email: 'moussa.coulibaly@demo.translink.ml', telephone: '+223660000222', ville: 'Bamako', pays: 'Mali' },
  { nom: 'Togo Cargo Group', role: 'ENTREPRISE', email: 'logistics@togo-cargo.tg', telephone: '+22890000033', ville: 'Lomé', pays: 'Togo' },
  { nom: 'Soro Logistics', role: 'ENTREPRISE', email: 'ops@sorologistics.bj', telephone: '+22997000044', ville: 'Cotonou', pays: 'Bénin' },
  { nom: 'Nadia Fall', role: 'CHARGEUR', email: 'nadia.fall@demo.translink.sn', telephone: '+221771222333', ville: 'Saint-Louis', pays: 'Sénégal' },
  { nom: 'Rachid Toure', role: 'CHARGEUR', email: 'rachid.toure@demo.translink.gn', telephone: '+224600000555', ville: 'Conakry', pays: 'Guinée' },
  { nom: 'Etoile Commerce', role: 'ENTREPRISE', email: 'contact@etoilecommerce.sn', telephone: '+221770333444', ville: 'Thiès', pays: 'Sénégal' },
  { nom: 'West Africa Freight', role: 'ENTREPRISE', email: 'shipping@westafricafreight.gh', telephone: '+233240000666', ville: 'Accra', pays: 'Ghana' },
  { nom: 'Laurent N’Guessan', role: 'CHARGEUR', email: 'laurent.nguessan@demo.translink.ci', telephone: '+225010000777', ville: 'Yamoussoukro', pays: 'Côte d’Ivoire' }
];

const sampleOffers = [
  { userIndex: 0, depart: 'Dakar, Sénégal', arrivee: 'Abidjan, Côte d’Ivoire', nature: 'Électronique', tonnage: '2.50', typeCamion: 'Camion 3.5T', prix: 780000, date: '2026-10-12' },
  { userIndex: 1, depart: 'Abidjan, Côte d’Ivoire', arrivee: 'Lomé, Togo', nature: 'Produits alimentaires', tonnage: '5.00', typeCamion: 'Camion 7T', prix: 920000, date: '2026-10-15' },
  { userIndex: 2, depart: 'Bamako, Mali', arrivee: 'Dakar, Sénégal', nature: 'Matériel médical', tonnage: '4.20', typeCamion: 'Camion 5T', prix: 850000, date: '2026-10-14' },
  { userIndex: 3, depart: 'Lomé, Togo', arrivee: 'Cotonou, Bénin', nature: 'Produits de construction', tonnage: '8.00', typeCamion: 'Tracteur + semi-remorque', prix: 1450000, date: '2026-10-18' },
  { userIndex: 4, depart: 'Cotonou, Bénin', arrivee: 'Accra, Ghana', nature: 'Textile', tonnage: '3.80', typeCamion: 'Camion 4.5T', prix: 980000, date: '2026-10-16' },
  { userIndex: 5, depart: 'Saint-Louis, Sénégal', arrivee: 'Conakry, Guinée', nature: 'Boulangerie / céréales', tonnage: '6.50', typeCamion: 'Camion 8T', prix: 1200000, date: '2026-10-20' },
  { userIndex: 6, depart: 'Conakry, Guinée', arrivee: 'Dakar, Sénégal', nature: 'Consommables', tonnage: '2.90', typeCamion: 'Camion 3.5T', prix: 760000, date: '2026-10-17' },
  { userIndex: 7, depart: 'Thiès, Sénégal', arrivee: 'Ouagadougou, Burkina Faso', nature: 'Petit matériel agricole', tonnage: '4.50', typeCamion: 'Camion 5T', prix: 1100000, date: '2026-10-19' },
  { userIndex: 8, depart: 'Accra, Ghana', arrivee: 'Abidjan, Côte d’Ivoire', nature: 'Vêtements', tonnage: '7.20', typeCamion: 'Camion 10T', prix: 1380000, date: '2026-10-21' },
  { userIndex: 9, depart: 'Yamoussoukro, Côte d’Ivoire', arrivee: 'Bamako, Mali', nature: 'Machinerie légère', tonnage: '9.50', typeCamion: 'Plateau 12T', prix: 1750000, date: '2026-10-23' }
];

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

async function ensureUser(profile) {
  const phone = normalizePhone(profile.telephone);
  const existing = await pool.query(
    `SELECT id, role FROM users WHERE telephone_whatsapp = $1 OR LOWER(email) = LOWER($2) LIMIT 1;`,
    [phone, profile.email]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const passwordHash = '$2b$10$8W7mZ3R3lQ3Qv7e7kZt7QO7PMT5z7nKZ3Yp8QfKJ7Gv7m7mR0Q2m.';
  const insert = await pool.query(
    `INSERT INTO users (nom, telephone_whatsapp, email, mot_de_passe, ville, role, statut_verification)
     VALUES ($1, $2, $3, $4, $5, $6, 'VALIDE')
     RETURNING id, role;`,
    [profile.nom, phone, profile.email, passwordHash, profile.ville, profile.role]
  );

  return insert.rows[0];
}

async function publishOffer(userId, offer) {
  const query = `
    INSERT INTO demandes_transport (
      chargeur_id, ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, prix_propose, statut
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PUBLIEE')
    RETURNING id, ville_depart, ville_arrivee, statut, prix_propose;
  `;

  const result = await pool.query(query, [
    userId,
    offer.depart,
    offer.arrivee,
    offer.nature,
    offer.tonnage,
    offer.typeCamion,
    offer.date,
    offer.prix
  ]);

  return result.rows[0];
}

async function main() {
  try {
    const createdUsers = [];

    for (const profile of sampleProfiles) {
      const user = await ensureUser(profile);
      createdUsers.push({ ...profile, id: user.id, role: user.role || profile.role });
    }

    const published = [];
    for (const offer of sampleOffers) {
      const user = createdUsers[offer.userIndex];
      if (!user) continue;

      const inserted = await publishOffer(user.id, offer);
      published.push({
        user: user.nom,
        role: user.role,
        pays: user.pays,
        ...inserted
      });
    }

    console.log('Offres publiées avec succès :');
    console.table(published.map((item) => ({
      utilisateur: item.user,
      role: item.role,
      pays: item.pays,
      depart: item.ville_depart,
      arrivee: item.ville_arrivee,
      statut: item.statut,
      prix: item.prix_propose
    })));

    console.log(`Nombre total d'offres publiées : ${published.length}`);
  } catch (error) {
    console.error('Erreur lors de la création des offres :', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
