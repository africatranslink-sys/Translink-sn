const db = require('../config/db');

class NegotiationModel {
  static async createConversation({ demandeId, camionId, ownerId, ownerRole, driverId }) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT d.id AS demande_id, d.statut AS demande_statut, d.chargeur_id,
               c.id AS camion_id, c.proprietaire_id, c.statut AS camion_statut,
               owner.role AS proprietaire_role
        FROM demandes_transport d
        JOIN camions c ON c.id = $2
        JOIN users owner ON owner.id = c.proprietaire_id
        WHERE d.id = $1
        FOR UPDATE OF d, c;
      `, [demandeId, camionId]);
      const offer = rows[0];
      if (!offer || offer.demande_statut !== 'PUBLIEE') {
        throw Object.assign(new Error('Cette demande n’est plus disponible pour négociation.'), { statusCode: 409 });
      }
      if (String(offer.proprietaire_id) !== String(ownerId) || offer.proprietaire_role !== ownerRole) {
        throw Object.assign(new Error('Ce camion ne vous appartient pas.'), { statusCode: 403 });
      }
      if (offer.camion_statut !== 'DISPONIBLE') {
        throw Object.assign(new Error('Choisissez un camion disponible pour négocier.'), { statusCode: 409 });
      }

      let assignedDriverId = null;
      if (ownerRole === 'CHAUFFEUR') {
        if (String(driverId || ownerId) !== String(ownerId)) {
          throw Object.assign(new Error('Un chauffeur indépendant doit conduire son propre camion.'), { statusCode: 403 });
        }
        assignedDriverId = ownerId;
      } else {
        const { rows: drivers } = await client.query(
          'SELECT id FROM users WHERE id = $1 AND role = \'CHAUFFEUR\' AND employeur_id = $2;',
          [driverId, ownerId]
        );
        if (!drivers[0]) {
          throw Object.assign(new Error('Sélectionnez un chauffeur de votre entreprise.'), { statusCode: 400 });
        }
        assignedDriverId = driverId;
      }

      const { rows: insertedRows } = await client.query(`
        INSERT INTO negotiation_conversations (demande_id, camion_id, transporteur_id, chauffeur_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (demande_id, camion_id) DO NOTHING
        RETURNING id;
      `, [demandeId, camionId, ownerId, assignedDriverId]);
      const conversationId = insertedRows[0]?.id;
      const { rows: conversationRows } = await client.query(`
        SELECT nc.id, nc.demande_id, nc.camion_id, nc.transporteur_id, nc.chauffeur_id,
               CASE WHEN d.statut = 'ANNULEE' THEN 'ANNULEE' ELSE nc.statut END AS statut,
               nc.course_id, nc.date_creation,
               d.ville_depart, d.ville_arrivee, d.chargeur_id, d.nature_marchandise, d.prix_propose,
               c.plaque_immatriculation, c.type_vehicule, c.capacite_tonnes,
               owner.nom AS transporteur_nom, chargeur.nom AS chargeur_nom
        FROM negotiation_conversations nc
        JOIN demandes_transport d ON d.id = nc.demande_id
        JOIN camions c ON c.id = nc.camion_id
        JOIN users owner ON owner.id = nc.transporteur_id
        JOIN users chargeur ON chargeur.id = d.chargeur_id
        WHERE nc.id = $1 OR (nc.demande_id = $2 AND nc.camion_id = $3)
        FOR UPDATE OF nc;
      `, [conversationId || -1, demandeId, camionId]);
      const conversation = conversationRows[0];
      if (!conversation) throw Object.assign(new Error('Impossible de créer la conversation.'), { statusCode: 500 });
      if (conversation.statut !== 'OUVERTE') {
        throw Object.assign(new Error('Cette négociation est déjà terminée.'), { statusCode: 409 });
      }
      if (insertedRows[0]) {
        await client.query(
          `INSERT INTO notifications (utilisateur_id, titre, message)
           VALUES ($1, 'Nouvelle négociation', $2);`,
          [conversation.chargeur_id, `${conversation.transporteur_nom} souhaite négocier le prix de votre demande ${conversation.ville_depart} → ${conversation.ville_arrivee}.`]
        );
      }
      await client.query('COMMIT');
      return conversation;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async listConversations(userId, demandeId) {
    const values = [userId];
    let demandFilter = '';
    if (demandeId != null) {
      values.push(demandeId);
      demandFilter = ' AND d.id = $2';
    }
    const { rows } = await db.query(`
      SELECT nc.id, nc.demande_id, nc.camion_id, nc.transporteur_id, nc.chauffeur_id,
             CASE WHEN d.statut = 'ANNULEE' THEN 'ANNULEE' ELSE nc.statut END AS statut,
             nc.course_id, nc.date_creation,
             d.ville_depart, d.ville_arrivee, d.chargeur_id, d.nature_marchandise, d.prix_propose,
             c.plaque_immatriculation, c.type_vehicule, c.capacite_tonnes,
             owner.nom AS transporteur_nom, chargeur.nom AS chargeur_nom
      FROM negotiation_conversations nc
      JOIN demandes_transport d ON d.id = nc.demande_id
      JOIN camions c ON c.id = nc.camion_id
      JOIN users owner ON owner.id = nc.transporteur_id
      JOIN users chargeur ON chargeur.id = d.chargeur_id
      WHERE (d.chargeur_id = $1 OR nc.transporteur_id = $1)${demandFilter}
      ORDER BY nc.date_creation DESC, nc.id DESC;
    `, values);
    return rows;
  }

  static async findConversationForUser(conversationId, userId) {
    const { rows } = await db.query(`
      SELECT nc.id, nc.demande_id, nc.camion_id, nc.transporteur_id, nc.chauffeur_id,
             CASE WHEN d.statut = 'ANNULEE' THEN 'ANNULEE' ELSE nc.statut END AS statut,
             nc.course_id, d.chargeur_id, d.statut AS demande_statut
      FROM negotiation_conversations nc
      JOIN demandes_transport d ON d.id = nc.demande_id
      WHERE nc.id = $1 AND (d.chargeur_id = $2 OR nc.transporteur_id = $2);
    `, [conversationId, userId]);
    const conversation = rows[0];
    if (!conversation) throw Object.assign(new Error('Conversation introuvable.'), { statusCode: 404 });
    return conversation;
  }

  static async lockConversationForUser(client, conversationId, userId) {
    const { rows: referenceRows } = await client.query(`
      SELECT nc.demande_id
      FROM negotiation_conversations nc
      JOIN demandes_transport d ON d.id = nc.demande_id
      WHERE nc.id = $1 AND (d.chargeur_id = $2 OR nc.transporteur_id = $2);
    `, [conversationId, userId]);
    if (!referenceRows[0]) throw Object.assign(new Error('Conversation introuvable.'), { statusCode: 404 });
    const { rows: demandRows } = await client.query(
      'SELECT id, statut FROM demandes_transport WHERE id = $1 FOR UPDATE;',
      [referenceRows[0].demande_id]
    );
    const demand = demandRows[0];
    if (!demand) throw Object.assign(new Error('Demande introuvable.'), { statusCode: 404 });
    const { rows: conversationRows } = await client.query(`
      SELECT nc.statut
      FROM negotiation_conversations nc
      WHERE nc.id = $1 AND (EXISTS (
        SELECT 1 FROM demandes_transport d WHERE d.id = nc.demande_id AND d.chargeur_id = $2
      ) OR nc.transporteur_id = $2)
      FOR UPDATE;
    `, [conversationId, userId]);
    const conversation = conversationRows[0];
    if (!conversation) throw Object.assign(new Error('Conversation introuvable.'), { statusCode: 404 });
    return { ...conversation, demande_statut: demand.statut };
  }

  static async getHistory(conversationId, userId) {
    const conversation = await this.findConversationForUser(conversationId, userId);
    const [messageResult, proposalResult] = await Promise.all([
      db.query(`
        SELECT m.id, m.conversation_id, m.expediteur_id, m.contenu, m.date_creation,
               u.nom AS expediteur_nom
        FROM negotiation_messages m
        JOIN users u ON u.id = m.expediteur_id
        WHERE m.conversation_id = $1
        ORDER BY m.date_creation, m.id;
      `, [conversationId]),
      db.query(`
        SELECT p.id, p.conversation_id, p.proposant_id, p.montant, p.statut,
               p.date_creation, p.date_reponse, u.nom AS proposant_nom
        FROM negotiation_price_proposals p
        JOIN users u ON u.id = p.proposant_id
        WHERE p.conversation_id = $1
        ORDER BY p.date_creation, p.id;
      `, [conversationId]),
    ]);
    const proposals = conversation.statut === 'ANNULEE'
      ? proposalResult.rows.map((proposal) => proposal.statut === 'EN_ATTENTE'
        ? { ...proposal, statut: 'REFUSEE' }
        : proposal)
      : proposalResult.rows;
    return { conversation, messages: messageResult.rows, proposals };
  }

  static async createMessage(conversationId, userId, content) {
    const trimmed = String(content || '').trim();
    if (!trimmed || trimmed.length > 2000) {
      throw Object.assign(new Error('Le message doit contenir entre 1 et 2 000 caractères.'), { statusCode: 400 });
    }
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const conversation = await this.lockConversationForUser(client, conversationId, userId);
      if (conversation.statut === 'ANNULEE' || conversation.demande_statut === 'ANNULEE') {
        throw Object.assign(new Error('Cette conversation est fermée.'), { statusCode: 409 });
      }
      const { rows } = await client.query(`
        INSERT INTO negotiation_messages (conversation_id, expediteur_id, contenu)
        VALUES ($1, $2, $3)
        RETURNING id, conversation_id, expediteur_id, contenu, date_creation;
      `, [conversationId, userId, trimmed]);
      const { rows: senderRows } = await client.query('SELECT nom FROM users WHERE id = $1;', [userId]);
      await client.query('COMMIT');
      return { ...rows[0], expediteur_nom: senderRows[0]?.nom };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async createPriceProposal(conversationId, userId, amount) {
    const price = Number(amount);
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000_000) {
      throw Object.assign(new Error('Saisissez un prix positif valide en FCFA.'), { statusCode: 400 });
    }
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const conversation = await this.lockConversationForUser(client, conversationId, userId);
      if (conversation.statut !== 'OUVERTE' || conversation.demande_statut !== 'PUBLIEE') {
        throw Object.assign(new Error('Cette négociation n’accepte plus de propositions de prix.'), { statusCode: 409 });
      }
      const { rows } = await client.query(`
        INSERT INTO negotiation_price_proposals (conversation_id, proposant_id, montant)
        VALUES ($1, $2, $3)
        RETURNING id, conversation_id, proposant_id, montant, statut, date_creation;
      `, [conversationId, userId, price]);
      const { rows: proposerRows } = await client.query('SELECT nom FROM users WHERE id = $1;', [userId]);
      await client.query('COMMIT');
      return { ...rows[0], proposant_nom: proposerRows[0]?.nom };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async rejectPriceProposal(conversationId, proposalId, userId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT nc.id, nc.transporteur_id, nc.statut AS conversation_statut, d.chargeur_id,
               p.id AS proposal_id, p.proposant_id, p.statut AS proposal_statut
        FROM negotiation_conversations nc
        JOIN demandes_transport d ON d.id = nc.demande_id
        JOIN negotiation_price_proposals p ON p.conversation_id = nc.id
        WHERE nc.id = $1 AND p.id = $2
        FOR UPDATE OF nc, p;
      `, [conversationId, proposalId]);
      const result = rows[0];
      if (!result) throw Object.assign(new Error('Proposition introuvable.'), { statusCode: 404 });
      if (![String(result.chargeur_id), String(result.transporteur_id)].includes(String(userId))) {
        throw Object.assign(new Error('Vous ne participez pas à cette négociation.'), { statusCode: 403 });
      }
      if (String(result.proposant_id) === String(userId)) {
        throw Object.assign(new Error('Vous ne pouvez pas refuser votre propre proposition.'), { statusCode: 403 });
      }
      if (result.conversation_statut !== 'OUVERTE' || result.proposal_statut !== 'EN_ATTENTE') {
        throw Object.assign(new Error('Cette proposition ne peut plus être refusée.'), { statusCode: 409 });
      }
      const { rows: updatedRows } = await client.query(`
        UPDATE negotiation_price_proposals
        SET statut = 'REFUSEE', date_reponse = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, conversation_id, proposant_id, montant, statut, date_creation, date_reponse;
      `, [proposalId]);
      await client.query('COMMIT');
      return updatedRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = NegotiationModel;
