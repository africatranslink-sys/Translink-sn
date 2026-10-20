const db = require('../config/db');
const { calculateFreightSettlement } = require('../services/financeService');
const { assertTruckWithinPlan } = require('../../../shared/subscriptionEntitlements');

async function createAcceptedCourse(client, {
  demandeId, camionId, ownerId, ownerRole, driverId, agreedPrice, activeConversationId = null,
}) {
  const { rows: offerRows } = await client.query(`
    SELECT d.id AS demande_id, d.statut AS demande_statut, d.chargeur_id, d.prix_propose,
           d.ville_depart, d.ville_arrivee, c.id AS camion_id,
           c.proprietaire_id, c.chauffeur_id, c.statut AS camion_statut,
           owner.role AS proprietaire_role, owner.compte_paiement_type,
           owner.compte_paiement_nom, owner.compte_paiement_identifiant
    FROM demandes_transport d
    JOIN camions c ON c.id = $2
    JOIN users owner ON owner.id = c.proprietaire_id
    WHERE d.id = $1
    FOR UPDATE OF d, c;
  `, [demandeId, camionId]);
  const offer = offerRows[0];
  if (!offer || offer.demande_statut !== 'PUBLIEE') {
    throw Object.assign(new Error('Cette offre n’est plus disponible.'), { statusCode: 409 });
  }
  if (String(offer.proprietaire_id) !== String(ownerId) || offer.proprietaire_role !== ownerRole) {
    throw Object.assign(new Error('Ce camion ne vous appartient pas.'), { statusCode: 403 });
  }
  await assertTruckWithinPlan(client, ownerId, camionId);
  if (offer.camion_statut !== 'DISPONIBLE') {
    throw Object.assign(new Error('Ce camion n’est pas disponible.'), { statusCode: 409 });
  }
  if (!offer.compte_paiement_type || !offer.compte_paiement_nom || !offer.compte_paiement_identifiant) {
    throw Object.assign(new Error('Complétez le compte de réception dans Paramètres avant d’accepter un chargement.'), { statusCode: 409 });
  }

  let assignedDriverId;
  if (ownerRole === 'CHAUFFEUR') {
    if (String(driverId || ownerId) !== String(ownerId)) {
      throw Object.assign(new Error('Un chauffeur indépendant doit conduire son propre camion.'), { statusCode: 403 });
    }
    assignedDriverId = ownerId;
  } else {
    if (!driverId) throw Object.assign(new Error('Sélectionnez le chauffeur qui prendra ce chargement.'), { statusCode: 400 });
    const { rows: drivers } = await client.query(
      'SELECT id FROM users WHERE id = $1 AND role = \'CHAUFFEUR\' AND employeur_id = $2;',
      [driverId, ownerId]
    );
    if (!drivers[0]) {
      throw Object.assign(new Error('Ce chauffeur ne fait pas partie de votre entreprise.'), { statusCode: 403 });
    }
    assignedDriverId = driverId;
  }

  if (agreedPrice != null) {
    await client.query('UPDATE demandes_transport SET prix_propose = $1 WHERE id = $2;', [agreedPrice, demandeId]);
  }
  const price = agreedPrice ?? offer.prix_propose;
  const settlement = calculateFreightSettlement(price, ownerRole);
  const { rows: courseRows } = await client.query(
    `INSERT INTO courses (demande_id, camion_id, chauffeur_assigne_id, statut, commission_taux, commission_montant)
     VALUES ($1, $2, $3, 'CAMION_TROUVE', $4, $5) RETURNING *;`,
    [demandeId, camionId, assignedDriverId, settlement.commissionRate, settlement.platformFeeTotal]
  );
  await client.query("UPDATE demandes_transport SET statut = 'CAMION_TROUVE' WHERE id = $1;", [demandeId]);
  await client.query("UPDATE camions SET statut = 'EN_MISSION', chauffeur_id = $2 WHERE id = $1;", [camionId, assignedDriverId]);
  await client.query("UPDATE disponibilites_camion SET statut = 'OCCUPEE' WHERE camion_id = $1 AND statut = 'ACTIVE';", [camionId]);
  await client.query(
    `INSERT INTO notifications (utilisateur_id, titre, message)
     VALUES ($1, 'Nouveau chargement affecté', 'Un chargement vous a été affecté. Consultez vos missions pour voir le trajet et les informations.');`,
    [assignedDriverId]
  );
  await client.query(
    `INSERT INTO notifications (utilisateur_id, titre, message)
     VALUES ($1, 'Camion affecté à une offre', 'Votre offre a été acceptée. Votre camion est maintenant en mission.');`,
    [ownerId]
  );
  await client.query(
    `INSERT INTO notifications (utilisateur_id, titre, message)
     VALUES ($1, 'Offre acceptée', $2);`,
    [offer.chargeur_id, `Votre annonce ${offer.ville_depart} → ${offer.ville_arrivee} a été acceptée pour ${Number(price).toLocaleString('fr-FR')} FCFA.`]
  );
  const { rows: closedConversations } = await client.query(`
    UPDATE negotiation_conversations
    SET statut = 'ANNULEE'
    WHERE demande_id = $1 AND statut <> 'ANNULEE' AND ($2::INTEGER IS NULL OR id <> $2)
    RETURNING id;
  `, [demandeId, activeConversationId]);
  if (closedConversations.length) {
    await client.query(`
      UPDATE negotiation_price_proposals
      SET statut = 'REFUSEE', date_reponse = CURRENT_TIMESTAMP
      WHERE conversation_id = ANY($1::INTEGER[]) AND statut = 'EN_ATTENTE';
    `, [closedConversations.map((conversation) => conversation.id)]);
  }
  return { course: courseRows[0], closedConversationIds: closedConversations.map((conversation) => conversation.id) };
}

class CourseModel {
  static async create(course) {
    const { demande_id, camion_id } = course;
    const query = `
      INSERT INTO courses (demande_id, camion_id, statut)
      VALUES ($1, $2, 'CAMION_TROUVE')
      RETURNING *;
    `;
    const values = [demande_id, camion_id];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async acceptOffer({ demandeId, camionId, ownerId, ownerRole, driverId }) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const accepted = await createAcceptedCourse(client, { demandeId, camionId, ownerId, ownerRole, driverId });
      await client.query('COMMIT');
      return { ...accepted.course, closed_negotiation_ids: accepted.closedConversationIds };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async acceptNegotiatedPrice({ conversationId, proposalId, actorId }) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: references } = await client.query(
        'SELECT demande_id FROM negotiation_conversations WHERE id = $1;',
        [conversationId]
      );
      if (!references[0]) throw Object.assign(new Error('Conversation introuvable.'), { statusCode: 404 });
      const { rows: demandRows } = await client.query(
        'SELECT id FROM demandes_transport WHERE id = $1 FOR UPDATE;',
        [references[0].demande_id]
      );
      if (!demandRows[0]) throw Object.assign(new Error('Demande introuvable.'), { statusCode: 404 });
      const { rows: conversationRows } = await client.query(`
        SELECT nc.id, nc.demande_id, nc.camion_id, nc.transporteur_id, nc.chauffeur_id, nc.statut,
               d.chargeur_id, owner.role AS transporteur_role
        FROM negotiation_conversations nc
        JOIN demandes_transport d ON d.id = nc.demande_id
        JOIN users owner ON owner.id = nc.transporteur_id
        WHERE nc.id = $1
        FOR UPDATE OF nc;
      `, [conversationId]);
      const conversation = conversationRows[0];
      if (!conversation) throw Object.assign(new Error('Conversation introuvable.'), { statusCode: 404 });
      if (![String(conversation.chargeur_id), String(conversation.transporteur_id)].includes(String(actorId))) {
        throw Object.assign(new Error('Vous ne participez pas à cette négociation.'), { statusCode: 403 });
      }
      if (conversation.statut !== 'OUVERTE') {
        throw Object.assign(new Error('Cette négociation n’est plus ouverte.'), { statusCode: 409 });
      }

      const { rows: proposalRows } = await client.query(`
        SELECT id, proposant_id, montant, statut
        FROM negotiation_price_proposals
        WHERE id = $1 AND conversation_id = $2
        FOR UPDATE;
      `, [proposalId, conversationId]);
      const proposal = proposalRows[0];
      if (!proposal) throw Object.assign(new Error('Proposition introuvable.'), { statusCode: 404 });
      if (proposal.statut !== 'EN_ATTENTE') {
        throw Object.assign(new Error('Cette proposition a déjà reçu une réponse.'), { statusCode: 409 });
      }
      if (String(proposal.proposant_id) === String(actorId)) {
        throw Object.assign(new Error('Vous ne pouvez pas accepter votre propre proposition.'), { statusCode: 403 });
      }

      const course = await createAcceptedCourse(client, {
        demandeId: conversation.demande_id,
        camionId: conversation.camion_id,
        ownerId: conversation.transporteur_id,
        ownerRole: conversation.transporteur_role,
        driverId: conversation.chauffeur_id,
        agreedPrice: proposal.montant,
        activeConversationId: conversation.id,
      });
      await client.query(`
        UPDATE negotiation_price_proposals
        SET statut = CASE WHEN id = $2 THEN 'ACCEPTEE' ELSE 'REFUSEE' END,
            date_reponse = CURRENT_TIMESTAMP
        WHERE conversation_id = $1 AND statut = 'EN_ATTENTE';
      `, [conversationId, proposalId]);
      await client.query(
        "UPDATE negotiation_conversations SET statut = 'ACCEPTEE', course_id = $2 WHERE id = $1;",
        [conversationId, course.id]
      );
      await client.query('COMMIT');
      return {
        course: course.course,
        closedConversationIds: course.closedConversationIds,
        conversationId: Number(conversationId),
        proposalId: Number(proposalId),
        agreedPrice: proposal.montant,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async cancelAcceptedByChargeur(courseId, chargeurId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: referenceRows } = await client.query('SELECT demande_id FROM courses WHERE id = $1;', [courseId]);
      if (!referenceRows[0]) throw Object.assign(new Error('Cette course est introuvable.'), { statusCode: 404 });
      const { rows: demandRows } = await client.query(
        'SELECT id FROM demandes_transport WHERE id = $1 AND chargeur_id = $2 FOR UPDATE;',
        [referenceRows[0].demande_id, chargeurId]
      );
      if (!demandRows[0]) throw Object.assign(new Error('Cette course est introuvable.'), { statusCode: 404 });
      const { rows } = await client.query(`
        SELECT c.id, c.demande_id, c.camion_id, c.statut,
               d.chargeur_id, ca.proprietaire_id, ca.chauffeur_id
        FROM courses c
        JOIN demandes_transport d ON d.id = c.demande_id
        JOIN camions ca ON ca.id = c.camion_id
        WHERE c.id = $1
        FOR UPDATE OF c, ca;
      `, [courseId]);
      const course = rows[0];
      if (!course) throw Object.assign(new Error('Cette course est introuvable.'), { statusCode: 404 });
      if (course.statut !== 'CAMION_TROUVE') {
        throw Object.assign(new Error('Une course ne peut être annulée que avant le début du chargement.'), { statusCode: 409 });
      }
      const { rows: paymentRows } = await client.query(`
        SELECT statut_avance
        FROM paiements
        WHERE course_id = $1
        FOR UPDATE;
      `, [course.id]);
      const payment = paymentRows[0];
      if (payment?.statut_avance === 'VALIDE') {
        throw Object.assign(new Error('Une avance a déjà été payée. Contactez le support pour demander une annulation.'), { statusCode: 409 });
      }
      if (payment) {
        throw Object.assign(new Error('Un paiement est en cours. Contactez le support avant d’annuler cette course.'), { statusCode: 409 });
      }

      const { rows: negotiationRows } = await client.query(
        'SELECT id FROM negotiation_conversations WHERE demande_id = $1 FOR UPDATE;',
        [course.demande_id]
      );
      await client.query("UPDATE courses SET statut = 'ANNULEE' WHERE id = $1;", [course.id]);
      await client.query("UPDATE demandes_transport SET statut = 'ANNULEE' WHERE id = $1;", [course.demande_id]);
      await client.query("UPDATE camions SET statut = 'DISPONIBLE' WHERE id = $1;", [course.camion_id]);
      await client.query("UPDATE disponibilites_camion SET statut = 'ACTIVE' WHERE camion_id = $1 AND statut = 'OCCUPEE';", [course.camion_id]);
      await client.query(
        `UPDATE negotiation_conversations SET statut = 'ANNULEE'
         WHERE demande_id = $1;`,
        [course.demande_id]
      );
      await client.query(`
        UPDATE negotiation_price_proposals
        SET statut = 'REFUSEE', date_reponse = CURRENT_TIMESTAMP
        WHERE conversation_id IN (
          SELECT id FROM negotiation_conversations WHERE demande_id = $1
        ) AND statut = 'EN_ATTENTE';
      `, [course.demande_id]);
      await client.query(
        `INSERT INTO notifications (utilisateur_id, titre, message)
         VALUES ($1, 'Course annulée', 'Le chargeur a annulé la course avant le début du chargement.');`,
        [course.proprietaire_id]
      );
      if (course.chauffeur_id && String(course.chauffeur_id) !== String(course.proprietaire_id)) {
        await client.query(
          `INSERT INTO notifications (utilisateur_id, titre, message)
           VALUES ($1, 'Course annulée', 'La course qui vous était affectée a été annulée par le chargeur.');`,
          [course.chauffeur_id]
        );
      }

      await client.query('COMMIT');
      return { ...course, negotiation_conversation_ids: negotiationRows.map((row) => row.id) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findById(id) {
    const query = 'SELECT * FROM courses WHERE id = $1;';
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  static async findDetails(id) {
    const query = `
      SELECT c.*,
             d.chargeur_id,
              d.ville_depart, d.ville_arrivee, d.nature_marchandise, d.tonnage, d.prix_propose,
              ca.proprietaire_id, ca.chauffeur_id, owner.role AS proprietaire_role,
              c.chauffeur_assigne_id, p.id AS paiement_id,
              p.statut_avance AS paiement_statut_avance, p.statut_solde AS paiement_statut_solde,
              p.montant_avance, p.montant_solde,
              p.montant_avance_commission, p.montant_solde_commission,
              p.montant_avance_net, p.montant_solde_net
      FROM courses c
      LEFT JOIN demandes_transport d ON d.id = c.demande_id
      LEFT JOIN camions ca ON ca.id = c.camion_id
            LEFT JOIN users owner ON owner.id = ca.proprietaire_id
            LEFT JOIN paiements p ON p.course_id = c.id
      WHERE c.id = $1;
    `;
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  static async findByActor(userId, role) {
    const query = `
      SELECT c.id, c.demande_id, c.camion_id, c.statut, c.commission, c.date_creation,
             c.date_chargement_reelle, c.date_livraison_reelle,
             d.chargeur_id, d.ville_depart, d.ville_arrivee, d.nature_marchandise, d.tonnage,
             d.prix_propose, d.date_chargement,
             ca.proprietaire_id, ca.chauffeur_id, ca.plaque_immatriculation, c.chauffeur_assigne_id,
             ca.type_vehicule, ca.capacite_tonnes,
             owner.nom AS transporteur_nom, owner.telephone_whatsapp AS transporteur_telephone,
             driver.nom AS chauffeur_nom, driver.telephone_whatsapp AS chauffeur_telephone,
             c.commission_taux, c.commission_montant,
               owner.role AS proprietaire_role,
               p.id AS paiement_id, p.statut_avance AS paiement_statut_avance,
               p.statut_solde AS paiement_statut_solde,
               p.montant_avance, p.montant_solde,
               p.montant_avance_commission, p.montant_solde_commission,
               p.montant_avance_net, p.montant_solde_net,
               p.reference_transaction_avance_chargeur,
               p.statut_reversement_avance, p.statut_reversement_solde,
               p.date_reversement_avance, p.date_reversement_solde
      FROM courses c
      LEFT JOIN demandes_transport d ON d.id = c.demande_id
      LEFT JOIN camions ca ON ca.id = c.camion_id
          LEFT JOIN users owner ON owner.id = ca.proprietaire_id
          LEFT JOIN users driver ON driver.id = c.chauffeur_assigne_id
          LEFT JOIN paiements p ON p.course_id = c.id
      WHERE ($1 = 'CHARGEUR' AND d.chargeur_id = $2)
            OR ($1 IN ('CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR') AND (ca.proprietaire_id = $2 OR ca.chauffeur_id = $2 OR c.chauffeur_assigne_id = $2))
      ORDER BY c.date_creation DESC;
    `;
    const { rows } = await db.query(query, [role, userId]);
    return rows;
  }

  static async declineAssignedCourse(courseId, driverId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: referenceRows } = await client.query('SELECT demande_id FROM courses WHERE id = $1;', [courseId]);
      if (!referenceRows[0]) throw Object.assign(new Error('Mission introuvable.'), { statusCode: 404 });
      await client.query('SELECT id FROM demandes_transport WHERE id = $1 FOR UPDATE;', [referenceRows[0].demande_id]);
      const { rows } = await client.query(`
        SELECT c.id, c.demande_id, c.camion_id, c.statut, c.chauffeur_assigne_id,
               ca.chauffeur_id, ca.proprietaire_id, d.chargeur_id
        FROM courses c
        JOIN camions ca ON ca.id = c.camion_id
        JOIN demandes_transport d ON d.id = c.demande_id
        WHERE c.id = $1
        FOR UPDATE OF c, ca;
      `, [courseId]);
      const course = rows[0];
      if (!course) throw Object.assign(new Error('Mission introuvable.'), { statusCode: 404 });

      const assignedDriverId = course.chauffeur_assigne_id || course.chauffeur_id;
      if (String(assignedDriverId) !== String(driverId)) {
        throw Object.assign(new Error('Cette mission ne vous est pas affectée.'), { statusCode: 403 });
      }
      if (course.statut !== 'CAMION_TROUVE') {
        throw Object.assign(new Error('Cette mission ne peut plus être déclinée.'), { statusCode: 409 });
      }
      const { rows: paymentRows } = await client.query(
        'SELECT id FROM paiements WHERE course_id = $1 FOR UPDATE;',
        [course.id]
      );
      if (paymentRows.length) {
        throw Object.assign(new Error('Le paiement a déjà été commencé. Contactez le chargeur pour annuler cette mission.'), { statusCode: 409 });
      }

      await client.query("UPDATE demandes_transport SET statut = 'PUBLIEE' WHERE id = $1;", [course.demande_id]);
      await client.query("UPDATE camions SET statut = 'DISPONIBLE' WHERE id = $1;", [course.camion_id]);
      await client.query("UPDATE disponibilites_camion SET statut = 'ACTIVE' WHERE camion_id = $1 AND statut = 'OCCUPEE';", [course.camion_id]);
      await client.query('DELETE FROM courses WHERE id = $1;', [course.id]);

      if (String(course.proprietaire_id) !== String(driverId)) {
        await client.query(
          `INSERT INTO notifications (utilisateur_id, titre, message)
           VALUES ($1, 'Mission déclinée', 'Le chauffeur a décliné cette mission. Votre camion est de nouveau disponible.');`,
          [course.proprietaire_id]
        );
      }
      await client.query(
        `INSERT INTO notifications (utilisateur_id, titre, message)
         VALUES ($1, 'Offre de nouveau disponible', 'Le chauffeur affecté a décliné cette mission. Vous pouvez choisir un autre transporteur.');`,
        [course.chargeur_id]
      );

      await client.query('COMMIT');
      return course;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findTrackingCourse(id) {
    const query = `
      SELECT c.id, c.camion_id, c.statut, ca.proprietaire_id, ca.chauffeur_id, ca.plaque_immatriculation,
             d.chargeur_id, d.ville_depart, d.ville_arrivee
      FROM courses c
      LEFT JOIN camions ca ON ca.id = c.camion_id
      LEFT JOIN demandes_transport d ON d.id = c.demande_id
      WHERE c.id = $1 AND c.statut IN ('CAMION_TROUVE', 'CHARGEMENT', 'LIVRAISON');
    `;
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  static async findTrackableIds(userId, role) {
    const query = `
      SELECT c.id
      FROM courses c
      LEFT JOIN camions ca ON ca.id = c.camion_id
      LEFT JOIN demandes_transport d ON d.id = c.demande_id
      WHERE c.statut IN ('CAMION_TROUVE', 'CHARGEMENT', 'LIVRAISON')
        AND (
          $1 = 'ADMIN'
          OR ($1 = 'CHARGEUR' AND d.chargeur_id = $2)
          OR ($1 IN ('CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR') AND (ca.proprietaire_id = $2 OR ca.chauffeur_id = $2))
        );
    `;
    const { rows } = await db.query(query, [role, userId]);
    return rows.map((row) => row.id);
  }

  static async updateStatus(id, statut, realDateFields = {}, expectedStatus) {
    let query = 'UPDATE courses SET statut = $1';
    const values = [statut, id];
    let idx = 3;
    
    if (realDateFields.date_chargement_reelle) {
      query += `, date_chargement_reelle = $${idx++}`;
      values.push(realDateFields.date_chargement_reelle);
    }
    if (realDateFields.date_livraison_reelle) {
      query += `, date_livraison_reelle = $${idx++}`;
      values.push(realDateFields.date_livraison_reelle);
    }

    query += ` WHERE id = $2`;
    if (expectedStatus) {
      query += ` AND statut = $${idx++}`;
      values.push(expectedStatus);
    }
    query += ' RETURNING *;';
    
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async completePrivateDelivery(id, userId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT c.id, c.demande_id, c.camion_id, c.statut, d.chargeur_id,
               ca.proprietaire_id, owner.role AS proprietaire_role
        FROM courses c
        JOIN camions ca ON ca.id = c.camion_id
        JOIN users owner ON owner.id = ca.proprietaire_id
        LEFT JOIN demandes_transport d ON d.id = c.demande_id
        WHERE c.id = $1
        FOR UPDATE OF c, ca;
      `, [id]);
      const course = rows[0];
      if (!course || course.statut !== 'LIVRAISON') throw Object.assign(new Error('La course n’est pas en phase de livraison.'), { statusCode: 409 });
      if (course.proprietaire_role !== 'CHAUFFEUR' || String(course.proprietaire_id) !== String(userId)) {
        throw Object.assign(new Error('Cette action est réservée au chauffeur propriétaire du camion.'), { statusCode: 403 });
      }

      const { rows: updatedRows } = await client.query(
        "UPDATE courses SET statut = 'LIVREE', date_livraison_reelle = CURRENT_TIMESTAMP WHERE id = $1 AND statut = 'LIVRAISON' RETURNING *;",
        [id]
      );
      await client.query("UPDATE demandes_transport SET statut = 'LIVREE' WHERE id = $1;", [course.demande_id]);
      await client.query("UPDATE camions SET statut = 'DISPONIBLE' WHERE id = $1;", [course.camion_id]);
      await client.query(`
        UPDATE disponibilites_camion
        SET position_actuelle = destinations_possibles,
            destinations_possibles = position_actuelle,
            position_lng = destination_lng,
            position_lat = destination_lat,
            destination_lng = position_lng,
            destination_lat = position_lat,
            statut = 'ACTIVE',
            date_creation = CURRENT_TIMESTAMP
        WHERE camion_id = $1 AND statut = 'OCCUPEE';
      `, [course.camion_id]);
      await client.query(
        `INSERT INTO notifications (utilisateur_id, titre, message)
         VALUES ($1, 'Chargement livré', 'Le chauffeur a confirmé la livraison. Son camion est disponible pour un trajet retour.');`,
        [course.chargeur_id]
      );
      await client.query('COMMIT');
      return updatedRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async acknowledgeDelivery(id, ownerId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT c.demande_id, c.camion_id, c.statut, d.chargeur_id, ca.proprietaire_id, owner.role AS proprietaire_role
        FROM courses c
        JOIN camions ca ON ca.id = c.camion_id
        JOIN users owner ON owner.id = ca.proprietaire_id
        LEFT JOIN demandes_transport d ON d.id = c.demande_id
        WHERE c.id = $1
        FOR UPDATE OF c, ca;
      `, [id]);
      const course = rows[0];
      if (!course || course.statut !== 'LIVREE') throw Object.assign(new Error('La livraison doit être confirmée par le chauffeur avant cette action.'), { statusCode: 409 });
      if (!['ENTREPRISE', 'TRANSPORTEUR'].includes(course.proprietaire_role) || String(course.proprietaire_id) !== String(ownerId)) {
        throw Object.assign(new Error('Cette action est réservée au propriétaire du camion.'), { statusCode: 403 });
      }

      const { rows: updatedRows } = await client.query(
        "UPDATE courses SET statut = 'TERMINEE' WHERE id = $1 AND statut = 'LIVREE' RETURNING *;",
        [id]
      );
      await client.query("UPDATE demandes_transport SET statut = 'TERMINEE' WHERE id = $1;", [course.demande_id]);
      await client.query("UPDATE camions SET statut = 'DISPONIBLE' WHERE id = $1;", [course.camion_id]);
      await client.query(`
        UPDATE disponibilites_camion
        SET position_actuelle = destinations_possibles,
            destinations_possibles = position_actuelle,
            position_lng = destination_lng,
            position_lat = destination_lat,
            destination_lng = position_lng,
            destination_lat = position_lat,
            statut = 'ACTIVE',
            date_creation = CURRENT_TIMESTAMP
        WHERE camion_id = $1 AND statut = 'OCCUPEE';
      `, [course.camion_id]);
      await client.query(
        `INSERT INTO notifications (utilisateur_id, titre, message)
         VALUES ($1, 'Livraison confirmée', 'L’entreprise a confirmé la disponibilité du camion pour un trajet retour.');`,
        [course.chargeur_id]
      );
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

module.exports = CourseModel;
