const db = require('../config/db');
const { calculateFreightSettlement, calculateSubscriptionQuote } = require('../services/financeService');
const { isPlanAllowedForRole, getPlan } = require('../../../shared/subscriptionPlans');

class PaiementModel {
  static async createForCourse(courseId, chargeurId, moyenPaiement) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: courseRows } = await client.query(`
        SELECT c.id, c.statut, d.chargeur_id, d.prix_propose, owner.role AS proprietaire_role
        FROM courses c
        JOIN demandes_transport d ON d.id = c.demande_id
        JOIN camions truck ON truck.id = c.camion_id
        JOIN users owner ON owner.id = truck.proprietaire_id
        WHERE c.id = $1
        FOR UPDATE OF c;
      `, [courseId]);
      const course = courseRows[0];
      if (!course || String(course.chargeur_id) !== String(chargeurId)) {
        throw Object.assign(new Error('Cette course n’appartient pas à votre compte.'), { statusCode: 403 });
      }
      if (!['CAMION_TROUVE', 'CHARGEMENT', 'LIVRAISON', 'LIVREE', 'TERMINEE'].includes(course.statut)) {
        throw Object.assign(new Error('Le paiement concerne une course acceptée uniquement.'), { statusCode: 409 });
      }

      const settlement = calculateFreightSettlement(course.prix_propose, course.proprietaire_role);
      const { rows } = await client.query(`
        INSERT INTO paiements (
          course_id, montant_total, montant_avance, montant_solde, moyen_paiement,
          commission_taux, commission_montant, montant_avance_commission,
          montant_solde_commission, montant_avance_net, montant_solde_net
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (course_id) DO UPDATE SET moyen_paiement = EXCLUDED.moyen_paiement
        WHERE paiements.statut_avance = 'EN_ATTENTE'
          AND paiements.reference_transaction_avance_chargeur IS NULL
        RETURNING *;
      `, [
        courseId, settlement.total, settlement.advance.gross, settlement.balance.gross, moyenPaiement,
        settlement.commissionRate, settlement.platformFeeTotal,
        settlement.advance.platformFee, settlement.balance.platformFee,
        settlement.advance.ownerNet, settlement.balance.ownerNet
      ]);
      if (!rows[0]) throw Object.assign(new Error('Ce paiement a déjà commencé.'), { statusCode: 409 });
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async savePayPalPayoutActualFee(id, tranche, batchId, feeUsd) {
    if (feeUsd == null || !Number.isFinite(Number(feeUsd)) || Number(feeUsd) < 0) return null;
    const feeColumn = tranche === 'AVANCE'
      ? 'frais_reversement_paypal_reel_usd_avance'
      : 'frais_reversement_paypal_reel_usd_solde';
    const referenceColumn = tranche === 'AVANCE' ? 'reference_reversement_avance' : 'reference_reversement_solde';
    const { rows } = await db.query(`
      UPDATE paiements SET ${feeColumn} = $1
      WHERE id = $2 AND ${referenceColumn} = $3
        AND ${tranche === 'AVANCE' ? 'statut_reversement_avance' : 'statut_reversement_solde'} IN ('EN_COURS', 'ENVOYE')
      RETURNING id;
    `, [feeUsd, id, batchId]);
    return rows[0];
  }

  static async submitAdvanceReference(id, chargeurId, reference) {
    const query = `
      UPDATE paiements p
      SET reference_transaction_avance_chargeur = $1
      FROM courses c
      JOIN demandes_transport d ON d.id = c.demande_id
      WHERE p.id = $2 AND p.course_id = c.id AND d.chargeur_id = $3
        AND p.statut_avance = 'EN_ATTENTE' AND c.statut = 'CAMION_TROUVE'
      RETURNING *;
    `;
    const { rows } = await db.query(query, [reference, id, chargeurId]);
    return rows[0];
  }

  static async validateAdvance(id, reference) {
    const query = `
      UPDATE paiements
      SET statut_avance = 'VALIDE', reference_transaction_avance = COALESCE($1, reference_transaction_avance_chargeur),
          date_validation_avance = COALESCE(date_validation_avance, CURRENT_TIMESTAMP)
      WHERE id = $2 AND statut_avance = 'EN_ATTENTE' AND reference_transaction_avance_chargeur IS NOT NULL
      RETURNING *;
    `;
    const { rows } = await db.query(query, [reference, id]);
    return rows[0];
  }

  static async submitBalanceReference(id, chargeurId, reference) {
    const query = `
      UPDATE paiements p
      SET reference_transaction_solde_chargeur = $1
      FROM courses c
      JOIN demandes_transport d ON d.id = c.demande_id
      WHERE p.id = $2 AND p.course_id = c.id AND d.chargeur_id = $3
        AND p.statut_avance = 'VALIDE' AND p.statut_solde = 'EN_ATTENTE'
        AND c.statut IN ('LIVREE', 'TERMINEE')
      RETURNING *;
    `;
    const { rows } = await db.query(query, [reference, id, chargeurId]);
    return rows[0];
  }

  static async validateBalance(id, reference) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        UPDATE paiements p
        SET statut_solde = 'VALIDE', reference_transaction_solde = COALESCE($1, reference_transaction_solde_chargeur),
          date_validation_solde = COALESCE(date_validation_solde, CURRENT_TIMESTAMP)
        FROM courses c
        WHERE p.id = $2 AND p.course_id = c.id
          AND p.statut_avance = 'VALIDE' AND p.statut_solde = 'EN_ATTENTE'
          AND p.reference_transaction_solde_chargeur IS NOT NULL
          AND c.statut IN ('LIVREE', 'TERMINEE')
        RETURNING p.*, c.id AS course_id;
      `, [reference, id]);
      if (rows[0]) {
        await client.query("UPDATE courses SET statut = 'SOLDE_REGLE' WHERE id = $1;", [rows[0].course_id]);
        await client.query(`
          UPDATE demandes_transport d
          SET statut = 'SOLDE_REGLE'
          FROM courses c
          WHERE c.id = $1 AND d.id = c.demande_id;
        `, [rows[0].course_id]);
      }
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getById(id) {
    const { rows } = await db.query('SELECT * FROM paiements WHERE id = $1;', [id]);
    return rows[0];
  }

  static async findMyTransactions(userId) {
    const [{ rows: payments }, { rows: subscriptions }] = await Promise.all([
      db.query(`
        SELECT p.*, c.statut AS course_statut, d.chargeur_id, d.ville_depart, d.ville_arrivee,
               owner.id AS proprietaire_id, owner.nom AS proprietaire_nom,
               c.chauffeur_assigne_id,
               CASE WHEN d.chargeur_id = $1 THEN 'DEBIT'
                    WHEN owner.id = $1 THEN 'CREDIT'
                    ELSE 'PARTICIPANT' END AS actor_side
        FROM paiements p
        JOIN courses c ON c.id = p.course_id
        JOIN demandes_transport d ON d.id = c.demande_id
        JOIN camions truck ON truck.id = c.camion_id
        JOIN users owner ON owner.id = truck.proprietaire_id
        WHERE d.chargeur_id = $1 OR owner.id = $1 OR c.chauffeur_assigne_id = $1
        ORDER BY p.date_creation DESC;
      `, [userId]),
      db.query(`
        SELECT id, plan, periode, statut, montant, moyen_paiement,
               reference_transaction, date_creation, date_debut, date_fin
        FROM abonnements WHERE utilisateur_id = $1 ORDER BY date_creation DESC;
      `, [userId]),
    ]);

    const transactions = [];
    for (const payment of payments) {
      for (const installment of [
        { key: 'avance', label: 'Avance', gross: payment.montant_avance, commission: payment.montant_avance_commission, net: payment.montant_avance_net },
        { key: 'solde', label: 'Solde', gross: payment.montant_solde, commission: payment.montant_solde_commission, net: payment.montant_solde_net },
      ]) {
        const isAdvance = installment.key === 'avance';
        const paymentStatus = isAdvance ? payment.statut_avance : payment.statut_solde;
        const payoutStatus = isAdvance ? payment.statut_reversement_avance : payment.statut_reversement_solde;
        const isChargeur = payment.actor_side === 'DEBIT';
        const isOwner = payment.actor_side === 'CREDIT';
        const chargeurReference = isAdvance
          ? payment.reference_transaction_avance_chargeur
          : payment.reference_transaction_solde_chargeur;
        const canContinuePayPal = isChargeur
          && payment.moyen_paiement === 'PAYPAL'
          && paymentStatus === 'EN_ATTENTE'
          && !chargeurReference
          && (isAdvance
            ? payment.course_statut === 'CAMION_TROUVE'
            : payment.statut_avance === 'VALIDE' && ['LIVREE', 'TERMINEE'].includes(payment.course_statut));
        const canContinueKkiapay = isChargeur
          && payment.moyen_paiement === 'KKIAPAY'
          && paymentStatus === 'EN_ATTENTE'
          && !chargeurReference
          && (isAdvance
            ? payment.course_statut === 'CAMION_TROUVE'
            : payment.statut_avance === 'VALIDE' && ['LIVREE', 'TERMINEE'].includes(payment.course_statut));
        transactions.push({
          id: `course-${payment.id}-${installment.key}`,
          category: isChargeur ? 'PAIEMENT' : isOwner ? 'REVERSEMENT' : 'COURSE',
          label: `${installment.label} · ${payment.ville_depart} → ${payment.ville_arrivee}`,
          direction: isChargeur ? 'DEBIT' : isOwner ? 'CREDIT' : 'INFO',
          amountXof: isChargeur ? Number(installment.gross || 0) : isOwner ? Number(installment.net || 0) : null,
          grossXof: Number(installment.gross || 0),
          commissionXof: Number(installment.commission || 0),
          netXof: Number(installment.net || 0),
          status: isChargeur ? paymentStatus : isOwner ? paymentStatus === 'VALIDE' ? payoutStatus : paymentStatus : paymentStatus,
          paymentStatus,
          payoutStatus: isOwner ? payoutStatus : null,
          paymentMethod: payment.moyen_paiement,
          payoutPaymentId: isOwner ? payment.id : null,
          payoutTranche: isOwner ? installment.key.toUpperCase() : null,
          paymentId: isChargeur ? payment.id : null,
          installment: isChargeur ? installment.key.toUpperCase() : null,
          canContinuePayPal,
          canContinueKkiapay,
          reference: isChargeur
            ? (isAdvance ? payment.reference_transaction_avance : payment.reference_transaction_solde)
            : isOwner ? (isAdvance ? payment.reference_reversement_avance : payment.reference_reversement_solde) : null,
          date: isOwner && payoutStatus === 'ENVOYE'
            ? (isAdvance ? payment.date_reversement_avance : payment.date_reversement_solde)
            : paymentStatus === 'VALIDE'
              ? (isAdvance ? payment.date_validation_avance : payment.date_validation_solde)
              : payment.date_creation,
          courseId: payment.course_id,
          otherParty: isChargeur ? payment.proprietaire_nom : undefined,
        });
      }
    }

    for (const subscription of subscriptions) {
      const planName = getPlan(subscription.plan)?.name || subscription.plan;
      transactions.push({
        id: `subscription-${subscription.id}`,
        category: 'ABONNEMENT',
        label: `Abonnement ${subscription.plan} · ${subscription.periode === 'ANNUAL' ? 'annuel' : 'mensuel'}`,
        direction: 'DEBIT',
        amountXof: Number(subscription.montant),
        grossXof: Number(subscription.montant),
        commissionXof: 0,
        netXof: 0,
        status: subscription.statut === 'ACTIF' ? 'VALIDE' : subscription.statut,
        paymentMethod: subscription.moyen_paiement,
        reference: subscription.reference_transaction,
        date: subscription.date_debut || subscription.date_creation,
      });
    }

    transactions.sort((first, second) => new Date(second.date || 0) - new Date(first.date || 0));
    const receivedXof = transactions
      .filter((transaction) => transaction.category === 'REVERSEMENT' && transaction.payoutStatus === 'ENVOYE')
      .reduce((total, transaction) => total + transaction.amountXof, 0);
    const pendingPayoutXof = transactions
      .filter((transaction) => transaction.category === 'REVERSEMENT' && transaction.paymentStatus === 'VALIDE' && ['EN_ATTENTE', 'EN_COURS', 'ECHEC'].includes(transaction.payoutStatus))
      .reduce((total, transaction) => total + transaction.amountXof, 0);
    const paidXof = transactions
      .filter((transaction) => (transaction.category === 'PAIEMENT' && transaction.paymentStatus === 'VALIDE') || (transaction.category === 'ABONNEMENT' && transaction.status === 'VALIDE'))
      .reduce((total, transaction) => total + transaction.amountXof, 0);

    return {
      transactions,
      balance: {
        receivedXof,
        pendingPayoutXof,
        accumulatedNetXof: receivedXof + pendingPayoutXof,
        paidXof,
      },
    };
  }

  static async getPlatformFundsSummary() {
    const { rows } = await db.query(`
      SELECT
        COALESCE(SUM(
          CASE WHEN statut_avance = 'VALIDE' THEN COALESCE(montant_avance_commission, 0) ELSE 0 END
          + CASE WHEN statut_solde = 'VALIDE' THEN COALESCE(montant_solde_commission, 0) ELSE 0 END
        ), 0) AS commission_confirmee_xof,
        COALESCE(SUM(
          CASE WHEN statut_avance = 'VALIDE' AND statut_reversement_avance IN ('EN_ATTENTE', 'EN_COURS', 'ECHEC') THEN COALESCE(montant_avance_net, 0) ELSE 0 END
          + CASE WHEN statut_solde = 'VALIDE' AND statut_reversement_solde IN ('EN_ATTENTE', 'EN_COURS', 'ECHEC') THEN COALESCE(montant_solde_net, 0) ELSE 0 END
        ), 0) AS reversements_a_traiter_xof,
        COALESCE(SUM(
          CASE WHEN moyen_paiement = 'PAYPAL' AND statut_avance = 'VALIDE' THEN COALESCE(frais_paypal_usd_avance, 0) ELSE 0 END
          + CASE WHEN moyen_paiement = 'PAYPAL' AND statut_solde = 'VALIDE' THEN COALESCE(frais_paypal_usd_solde, 0) ELSE 0 END
        ), 0) AS frais_paypal_estimes_usd
        , COALESCE(SUM(
          CASE WHEN moyen_paiement = 'PAYPAL' AND statut_avance = 'VALIDE' THEN COALESCE(frais_paypal_reel_usd_avance, 0) ELSE 0 END
          + CASE WHEN moyen_paiement = 'PAYPAL' AND statut_solde = 'VALIDE' THEN COALESCE(frais_paypal_reel_usd_solde, 0) ELSE 0 END
        ), 0) AS frais_paypal_reels_usd
        , COALESCE(SUM(
          CASE WHEN moyen_paiement = 'PAYPAL' AND statut_reversement_avance = 'ENVOYE' THEN COALESCE(frais_reversement_paypal_reel_usd_avance, 0) ELSE 0 END
          + CASE WHEN moyen_paiement = 'PAYPAL' AND statut_reversement_solde = 'ENVOYE' THEN COALESCE(frais_reversement_paypal_reel_usd_solde, 0) ELSE 0 END
        ), 0) AS frais_reversement_paypal_reels_usd
        , COALESCE(SUM(
          CASE WHEN moyen_paiement = 'PAYPAL' AND statut_avance = 'VALIDE' AND frais_paypal_reel_usd_avance IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN moyen_paiement = 'PAYPAL' AND statut_solde = 'VALIDE' AND frais_paypal_reel_usd_solde IS NOT NULL THEN 1 ELSE 0 END
        ), 0)::int AS captures_paypal_avec_frais_reels
        , COALESCE(SUM(
          CASE WHEN moyen_paiement = 'PAYPAL' AND statut_reversement_avance = 'ENVOYE' AND frais_reversement_paypal_reel_usd_avance IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN moyen_paiement = 'PAYPAL' AND statut_reversement_solde = 'ENVOYE' AND frais_reversement_paypal_reel_usd_solde IS NOT NULL THEN 1 ELSE 0 END
        ), 0)::int AS reversements_paypal_avec_frais_reels
        , (SELECT COALESCE(SUM(montant), 0) FROM abonnements WHERE statut = 'ACTIF') AS abonnements_actifs_xof
      FROM paiements;
    `);
    return rows[0];
  }

  static async getPayPalFeeSamples() {
    const { rows } = await db.query(`
      SELECT montant_usd_avance AS montant_usd, frais_paypal_reel_usd_avance AS frais_usd
      FROM paiements
      WHERE moyen_paiement = 'PAYPAL' AND statut_avance = 'VALIDE'
        AND montant_usd_avance IS NOT NULL AND frais_paypal_reel_usd_avance IS NOT NULL
      UNION ALL
      SELECT montant_usd_solde, frais_paypal_reel_usd_solde
      FROM paiements
      WHERE moyen_paiement = 'PAYPAL' AND statut_solde = 'VALIDE'
        AND montant_usd_solde IS NOT NULL AND frais_paypal_reel_usd_solde IS NOT NULL;
    `);
    return rows.map(({ montant_usd, frais_usd }) => ({
      amountUsd: Number(montant_usd),
      feeUsd: Number(frais_usd),
    }));
  }

  static async getPayPalPayoutFeeSamples() {
    const { rows } = await db.query(`
      SELECT frais_reversement_paypal_reel_usd_avance AS frais_usd
      FROM paiements
      WHERE moyen_paiement = 'PAYPAL' AND statut_reversement_avance = 'ENVOYE'
        AND frais_reversement_paypal_reel_usd_avance IS NOT NULL
      UNION ALL
      SELECT frais_reversement_paypal_reel_usd_solde
      FROM paiements
      WHERE moyen_paiement = 'PAYPAL' AND statut_reversement_solde = 'ENVOYE'
        AND frais_reversement_paypal_reel_usd_solde IS NOT NULL;
    `);
    return rows.map(({ frais_usd }) => Number(frais_usd));
  }

  static async findAllTransactionsForAdmin() {
    const [{ rows: payments }, { rows: subscriptions }] = await Promise.all([
      db.query(`
        SELECT p.*, c.id AS course_id, d.ville_depart, d.ville_arrivee,
               shipper.nom AS chargeur_nom, owner.nom AS proprietaire_nom
        FROM paiements p
        JOIN courses c ON c.id = p.course_id
        JOIN demandes_transport d ON d.id = c.demande_id
        JOIN camions truck ON truck.id = c.camion_id
        JOIN users owner ON owner.id = truck.proprietaire_id
        JOIN users shipper ON shipper.id = d.chargeur_id
        ORDER BY p.date_creation DESC;
      `),
      db.query(`
        SELECT s.*, users.nom AS utilisateur_nom
        FROM abonnements s JOIN users ON users.id = s.utilisateur_id
        ORDER BY s.date_creation DESC;
      `),
    ]);

    const transactions = [];
    for (const payment of payments) {
      for (const installment of [
        { key: 'avance', label: 'Avance', gross: payment.montant_avance, commission: payment.montant_avance_commission, net: payment.montant_avance_net },
        { key: 'solde', label: 'Solde', gross: payment.montant_solde, commission: payment.montant_solde_commission, net: payment.montant_solde_net },
      ]) {
        const isAdvance = installment.key === 'avance';
        const paymentStatus = isAdvance ? payment.statut_avance : payment.statut_solde;
        const payoutStatus = isAdvance ? payment.statut_reversement_avance : payment.statut_reversement_solde;
        transactions.push({
          id: `admin-payment-${payment.id}-${installment.key}`,
          category: 'ENCAISSEMENT',
          label: `${installment.label} · ${payment.ville_depart} → ${payment.ville_arrivee}`,
          actor: payment.chargeur_nom,
          beneficiary: payment.proprietaire_nom,
          amountXof: Number(installment.gross || 0),
          commissionXof: Number(installment.commission || 0),
          netXof: Number(installment.net || 0),
          status: paymentStatus,
          paymentMethod: payment.moyen_paiement,
          reference: isAdvance ? payment.reference_transaction_avance : payment.reference_transaction_solde,
          date: paymentStatus === 'VALIDE'
            ? (isAdvance ? payment.date_validation_avance : payment.date_validation_solde)
            : payment.date_creation,
        });
        transactions.push({
          id: `admin-payout-${payment.id}-${installment.key}`,
          category: 'REVERSEMENT',
          label: `Reversement ${installment.label} · ${payment.ville_depart} → ${payment.ville_arrivee}`,
          actor: payment.proprietaire_nom,
          amountXof: Number(installment.net || 0),
          commissionXof: Number(installment.commission || 0),
          netXof: Number(installment.net || 0),
          status: paymentStatus === 'VALIDE' ? payoutStatus : paymentStatus,
          paymentMethod: payment.moyen_paiement,
          reference: isAdvance ? payment.reference_reversement_avance : payment.reference_reversement_solde,
          date: payoutStatus === 'ENVOYE'
            ? (isAdvance ? payment.date_reversement_avance : payment.date_reversement_solde)
            : payment.date_creation,
        });
      }
    }

    for (const subscription of subscriptions) {
      transactions.push({
        id: `admin-subscription-${subscription.id}`,
        subscriptionId: subscription.id,
        category: 'ABONNEMENT',
        label: `Abonnement ${planName} · ${subscription.periode}`,
        actor: subscription.utilisateur_nom,
        amountXof: Number(subscription.montant),
        commissionXof: 0,
        netXof: 0,
        status: subscription.statut === 'ACTIF' ? 'VALIDE' : subscription.statut,
        paymentMethod: subscription.moyen_paiement,
        reference: subscription.reference_transaction,
        date: subscription.date_debut || subscription.date_creation,
      });
    }

    transactions.sort((first, second) => new Date(second.date || 0) - new Date(first.date || 0));
    return transactions;
  }

  static async getMyPendingPayPalPayouts(userId = null, limit = 50) {
    const { rows } = await db.query(`
      SELECT p.id AS payment_id,
             p.statut_reversement_avance,
             p.statut_reversement_solde,
             p.reference_reversement_avance,
             p.reference_reversement_solde
      FROM paiements p
      JOIN courses c ON c.id = p.course_id
      JOIN camions truck ON truck.id = c.camion_id
      WHERE ($1::INTEGER IS NULL OR truck.proprietaire_id = $1) AND p.moyen_paiement = 'PAYPAL'
        AND (p.statut_reversement_avance = 'EN_COURS' OR p.statut_reversement_solde = 'EN_COURS')
      ORDER BY p.date_creation DESC
      LIMIT $2;
    `, [userId, limit]);
    return rows.flatMap((row) => [
      row.statut_reversement_avance === 'EN_COURS' && row.reference_reversement_avance && { paymentId: row.payment_id, tranche: 'AVANCE', batchId: row.reference_reversement_avance, status: 'EN_COURS' },
      row.statut_reversement_solde === 'EN_COURS' && row.reference_reversement_solde && { paymentId: row.payment_id, tranche: 'SOLDE', batchId: row.reference_reversement_solde, status: 'EN_COURS' },
    ].filter(Boolean));
  }

  static async getPayPalPayoutsMissingActualFees(limit = 5) {
    const { rows } = await db.query(`
      SELECT id AS payment_id, reference_reversement_avance, reference_reversement_solde,
             statut_reversement_avance, statut_reversement_solde
      FROM paiements
      WHERE moyen_paiement = 'PAYPAL'
        AND (
          (statut_reversement_avance = 'ENVOYE' AND frais_reversement_paypal_reel_usd_avance IS NULL)
          OR (statut_reversement_solde = 'ENVOYE' AND frais_reversement_paypal_reel_usd_solde IS NULL)
        )
      ORDER BY date_creation DESC
      LIMIT $1;
    `, [limit]);
    return rows.flatMap((row) => [
      row.statut_reversement_avance === 'ENVOYE' && row.reference_reversement_avance
        && { paymentId: row.payment_id, tranche: 'AVANCE', batchId: row.reference_reversement_avance, status: 'ENVOYE' },
      row.statut_reversement_solde === 'ENVOYE' && row.reference_reversement_solde
        && { paymentId: row.payment_id, tranche: 'SOLDE', batchId: row.reference_reversement_solde, status: 'ENVOYE' },
    ].filter(Boolean));
  }

  static async updatePayPalPayoutStatus(id, tranche, status) {
    if (!['ENVOYE', 'ECHEC'].includes(status)) throw new Error('Statut de reversement PayPal invalide.');
    const payoutStatusColumn = tranche === 'AVANCE' ? 'statut_reversement_avance' : 'statut_reversement_solde';
    const payoutDateColumn = tranche === 'AVANCE' ? 'date_reversement_avance' : 'date_reversement_solde';
    const { rows } = await db.query(`
      UPDATE paiements SET ${payoutStatusColumn} = $1,
        ${payoutDateColumn} = CASE WHEN $1 = 'ENVOYE' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = $2 AND ${payoutStatusColumn} = 'EN_COURS'
      RETURNING id;
    `, [status, id]);
    return rows[0];
  }

  static async getKkiapayInstallment(id, chargeurId, tranche, allowCompleted = false) {
    const isAdvance = tranche === 'AVANCE';
    const { rows } = await db.query(`
      SELECT p.*, c.statut AS course_statut, d.chargeur_id
      FROM paiements p
      JOIN courses c ON c.id = p.course_id
      JOIN demandes_transport d ON d.id = c.demande_id
      WHERE p.id = $1 AND d.chargeur_id = $2;
    `, [id, chargeurId]);
    const payment = rows[0];
    if (!payment) throw Object.assign(new Error('Paiement introuvable pour ce compte.'), { statusCode: 404 });
    if (payment.moyen_paiement !== 'KKIAPAY') throw Object.assign(new Error('Ce paiement n’a pas été créé avec KKiaPay.'), { statusCode: 409 });

    const isPayable = isAdvance
      ? payment.statut_avance === 'EN_ATTENTE' && payment.course_statut === 'CAMION_TROUVE'
      : payment.statut_avance === 'VALIDE' && payment.statut_solde === 'EN_ATTENTE'
        && ['LIVREE', 'TERMINEE'].includes(payment.course_statut);
    const status = isAdvance ? payment.statut_avance : payment.statut_solde;
    const reference = isAdvance ? payment.reference_transaction_avance : payment.reference_transaction_solde;
    if (!isPayable && !(allowCompleted && status === 'VALIDE' && reference)) {
      throw Object.assign(new Error('Cette tranche n’est pas payable actuellement.'), { statusCode: 409 });
    }

    return {
      amountXof: Number(isAdvance ? payment.montant_avance : payment.montant_solde),
      partnerId: `translink-course:${payment.id}:${tranche}`,
      transactionId: reference,
    };
  }

  static async saveKkiapayInstallmentPartner(id, chargeurId, tranche, partnerId) {
    const partnerColumn = tranche === 'AVANCE' ? 'kkiapay_partner_id_avance' : 'kkiapay_partner_id_solde';
    const statusColumn = tranche === 'AVANCE' ? 'statut_avance' : 'statut_solde';
    const { rows } = await db.query(`
      UPDATE paiements p
      SET ${partnerColumn} = $1
      FROM courses c
      JOIN demandes_transport d ON d.id = c.demande_id
      WHERE p.id = $2 AND p.course_id = c.id AND d.chargeur_id = $3
        AND p.moyen_paiement = 'KKIAPAY' AND p.${statusColumn} = 'EN_ATTENTE'
        AND (p.${partnerColumn} IS NULL OR p.${partnerColumn} = $1)
      RETURNING p.id;
    `, [partnerId, id, chargeurId]);
    if (!rows[0]) throw Object.assign(new Error('Le paiement a changé avant l’ouverture de KKiaPay.'), { statusCode: 409 });
    return rows[0];
  }

  static async completeKkiapayInstallment(id, chargeurId, tranche, partnerId, transactionId, amount) {
    const client = await db.pool.connect();
    const isAdvance = tranche === 'AVANCE';
    const statusColumn = isAdvance ? 'statut_avance' : 'statut_solde';
    const referenceColumn = isAdvance ? 'reference_transaction_avance' : 'reference_transaction_solde';
    const partnerColumn = isAdvance ? 'kkiapay_partner_id_avance' : 'kkiapay_partner_id_solde';
    const amountColumn = isAdvance ? 'montant_avance' : 'montant_solde';
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT p.*, c.statut AS course_statut, d.chargeur_id
        FROM paiements p
        JOIN courses c ON c.id = p.course_id
        JOIN demandes_transport d ON d.id = c.demande_id
        WHERE p.id = $1 AND ($2::INTEGER IS NULL OR d.chargeur_id = $2)
        FOR UPDATE OF p, c;
      `, [id, chargeurId]);
      const payment = rows[0];
      if (!payment || payment.moyen_paiement !== 'KKIAPAY' || payment[partnerColumn] !== partnerId) {
        throw Object.assign(new Error('La transaction KKiaPay ne correspond pas à cette tranche.'), { statusCode: 409 });
      }
      if (Number(payment[amountColumn]) !== Number(amount)) {
        throw Object.assign(new Error('Le montant confirmé par KKiaPay ne correspond pas au montant dû.'), { statusCode: 409 });
      }
      if (payment[statusColumn] === 'VALIDE' && payment[referenceColumn] === transactionId) {
        await client.query('COMMIT');
        return payment;
      }
      if (payment[statusColumn] !== 'EN_ATTENTE' || (isAdvance
        ? payment.course_statut !== 'CAMION_TROUVE'
        : payment.statut_avance !== 'VALIDE' || !['LIVREE', 'TERMINEE'].includes(payment.course_statut))) {
        throw Object.assign(new Error('Cette tranche a déjà été traitée ou n’est plus payable.'), { statusCode: 409 });
      }

      const { rows: updatedRows } = await client.query(`
        UPDATE paiements SET ${statusColumn} = 'VALIDE', ${referenceColumn} = $1,
          ${isAdvance ? 'date_validation_avance' : 'date_validation_solde'} = CURRENT_TIMESTAMP
        WHERE id = $2 RETURNING *;
      `, [transactionId, id]);
      if (!isAdvance) {
        await client.query("UPDATE courses SET statut = 'SOLDE_REGLE' WHERE id = $1;", [payment.course_id]);
        await client.query(`
          UPDATE demandes_transport d SET statut = 'SOLDE_REGLE'
          FROM courses c WHERE c.id = $1 AND d.id = c.demande_id;
        `, [payment.course_id]);
      }
      await client.query('COMMIT');
      return updatedRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getPayPalInstallment(id, chargeurId, tranche, allowCompleted = false) {
    const isAdvance = tranche === 'AVANCE';
    const { rows } = await db.query(`
            SELECT p.*, c.statut AS course_statut, d.chargeur_id,
              owner.compte_paiement_type, owner.compte_paiement_identifiant
      FROM paiements p
      JOIN courses c ON c.id = p.course_id
      JOIN demandes_transport d ON d.id = c.demande_id
            JOIN camions truck ON truck.id = c.camion_id
            JOIN users owner ON owner.id = truck.proprietaire_id
      WHERE p.id = $1 AND d.chargeur_id = $2;
    `, [id, chargeurId]);
    const payment = rows[0];
    if (!payment) throw Object.assign(new Error('Paiement introuvable pour ce compte.'), { statusCode: 404 });
    if (payment.moyen_paiement !== 'PAYPAL') throw Object.assign(new Error('Ce paiement n’a pas été créé avec PayPal.'), { statusCode: 409 });
    if (payment.compte_paiement_type !== 'PAYPAL' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payment.compte_paiement_identifiant || '')) {
      throw Object.assign(new Error('Le transporteur doit configurer une adresse PayPal valide pour recevoir ce paiement.'), { statusCode: 409 });
    }

    const isPayable = isAdvance
      ? payment.statut_avance === 'EN_ATTENTE' && payment.course_statut === 'CAMION_TROUVE'
      : payment.statut_avance === 'VALIDE' && payment.statut_solde === 'EN_ATTENTE' && ['LIVREE', 'TERMINEE'].includes(payment.course_statut);
    const trancheStatus = isAdvance ? payment.statut_avance : payment.statut_solde;
    const captureReference = isAdvance ? payment.reference_transaction_avance : payment.reference_transaction_solde;
    if (!isPayable && !(allowCompleted && trancheStatus === 'VALIDE' && captureReference)) {
      throw Object.assign(new Error('Cette tranche n’est pas payable actuellement.'), { statusCode: 409 });
    }

    return {
      payment,
      amountXof: Number(isAdvance ? payment.montant_avance : payment.montant_solde),
      orderId: isAdvance ? payment.paypal_order_id_avance : payment.paypal_order_id_solde,
      amountUsd: isAdvance ? payment.montant_usd_avance : payment.montant_usd_solde,
      estimatedFeesUsd: isAdvance ? payment.frais_paypal_usd_avance : payment.frais_paypal_usd_solde,
      rate: isAdvance ? payment.taux_conversion_usd_avance : payment.taux_conversion_usd_solde,
    };
  }

  static async savePayPalOrder(id, chargeurId, tranche, orderId, amountUsd, estimatedFeesUsd, rate) {
    const isAdvance = tranche === 'AVANCE';
    const orderColumn = isAdvance ? 'paypal_order_id_avance' : 'paypal_order_id_solde';
    const amountColumn = isAdvance ? 'montant_usd_avance' : 'montant_usd_solde';
    const feesColumn = isAdvance ? 'frais_paypal_usd_avance' : 'frais_paypal_usd_solde';
    const rateColumn = isAdvance ? 'taux_conversion_usd_avance' : 'taux_conversion_usd_solde';
    const statusColumn = isAdvance ? 'statut_avance' : 'statut_solde';
    const { rows } = await db.query(`
      UPDATE paiements p
      SET ${orderColumn} = $1, ${amountColumn} = $2, ${feesColumn} = $3, ${rateColumn} = $4
      FROM courses c
      JOIN demandes_transport d ON d.id = c.demande_id
      WHERE p.id = $5 AND p.course_id = c.id AND d.chargeur_id = $6
        AND p.moyen_paiement = 'PAYPAL' AND p.${statusColumn} = 'EN_ATTENTE'
      RETURNING p.*;
    `, [orderId, amountUsd, estimatedFeesUsd, rate, id, chargeurId]);
    if (!rows[0]) throw Object.assign(new Error('Le paiement a changé avant la création de la commande PayPal.'), { statusCode: 409 });
    return rows[0];
  }

  static async completePayPalInstallment(id, chargeurId, tranche, orderId, captureId, amountUsd, estimatedFeesUsd, rate, actualFeeUsd = null) {
    const client = await db.pool.connect();
    const isAdvance = tranche === 'AVANCE';
    const statusColumn = isAdvance ? 'statut_avance' : 'statut_solde';
    const referenceColumn = isAdvance ? 'reference_transaction_avance' : 'reference_transaction_solde';
    const orderColumn = isAdvance ? 'paypal_order_id_avance' : 'paypal_order_id_solde';
    const usdAmountColumn = isAdvance ? 'montant_usd_avance' : 'montant_usd_solde';
    const feesColumn = isAdvance ? 'frais_paypal_usd_avance' : 'frais_paypal_usd_solde';
    const actualFeesColumn = isAdvance ? 'frais_paypal_reel_usd_avance' : 'frais_paypal_reel_usd_solde';
    const rateColumn = isAdvance ? 'taux_conversion_usd_avance' : 'taux_conversion_usd_solde';
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT p.*, c.statut AS course_statut
        FROM paiements p
        JOIN courses c ON c.id = p.course_id
        JOIN demandes_transport d ON d.id = c.demande_id
        WHERE p.id = $1 AND d.chargeur_id = $2
        FOR UPDATE OF p, c;
      `, [id, chargeurId]);
      const payment = rows[0];
      if (!payment || payment.moyen_paiement !== 'PAYPAL' || payment[orderColumn] !== orderId) {
        throw Object.assign(new Error('La commande PayPal ne correspond pas à ce paiement.'), { statusCode: 409 });
      }
      if (payment[statusColumn] === 'VALIDE' && payment[referenceColumn] === captureId) {
        if (actualFeeUsd !== null && payment[actualFeesColumn] == null) {
          await client.query(`UPDATE paiements SET ${actualFeesColumn} = $1 WHERE id = $2;`, [actualFeeUsd, id]);
        }
        await client.query('COMMIT');
        return payment;
      }

      const payable = isAdvance
        ? payment.statut_avance === 'EN_ATTENTE' && payment.course_statut === 'CAMION_TROUVE'
        : payment.statut_avance === 'VALIDE' && payment.statut_solde === 'EN_ATTENTE' && ['LIVREE', 'TERMINEE'].includes(payment.course_statut);
      if (!payable) throw Object.assign(new Error('Cette tranche a déjà été traitée ou n’est plus payable.'), { statusCode: 409 });

      const { rows: updatedRows } = await client.query(`
        UPDATE paiements SET ${statusColumn} = 'VALIDE', ${referenceColumn} = $1,
          ${usdAmountColumn} = $2, ${feesColumn} = $3, ${rateColumn} = $4,
          ${actualFeesColumn} = $5,
          ${isAdvance ? 'date_validation_avance' : 'date_validation_solde'} = CURRENT_TIMESTAMP
        WHERE id = $6 RETURNING *;
      `, [captureId, amountUsd, estimatedFeesUsd, rate, actualFeeUsd, id]);
      if (!isAdvance) {
        await client.query("UPDATE courses SET statut = 'SOLDE_REGLE' WHERE id = $1;", [payment.course_id]);
        await client.query(`
          UPDATE demandes_transport d
          SET statut = 'SOLDE_REGLE'
          FROM courses c
          WHERE c.id = $1 AND d.id = c.demande_id;
        `, [payment.course_id]);
      }
      await client.query('COMMIT');
      return updatedRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getOwnerPayoutDetails(id, tranche) {
    const isAdvance = tranche === 'AVANCE';
    const payoutStatusColumn = isAdvance ? 'statut_reversement_avance' : 'statut_reversement_solde';
    const amountColumn = isAdvance ? 'montant_avance_net' : 'montant_solde_net';
    const { rows } = await db.query(`
      SELECT p.id, p.${payoutStatusColumn} AS statut_reversement, p.${amountColumn} AS montant_net,
             owner.compte_paiement_type, owner.compte_paiement_identifiant
      FROM paiements p
      JOIN courses c ON c.id = p.course_id
      JOIN camions truck ON truck.id = c.camion_id
      JOIN users owner ON owner.id = truck.proprietaire_id
      WHERE p.id = $1;
    `, [id]);
    return rows[0];
  }

  static async claimOwnerPayPalPayout(id, tranche) {
    const isAdvance = tranche === 'AVANCE';
    const paymentStatusColumn = isAdvance ? 'statut_avance' : 'statut_solde';
    const payoutStatusColumn = isAdvance ? 'statut_reversement_avance' : 'statut_reversement_solde';
    const { rows } = await db.query(`
      UPDATE paiements SET ${payoutStatusColumn} = 'EN_COURS'
      WHERE id = $1 AND ${paymentStatusColumn} = 'VALIDE' AND ${payoutStatusColumn} = 'EN_ATTENTE'
      RETURNING id;
    `, [id]);
    return rows[0];
  }

  static async releaseOwnerPayPalPayout(id, tranche) {
    const payoutStatusColumn = tranche === 'AVANCE' ? 'statut_reversement_avance' : 'statut_reversement_solde';
    await db.query(`UPDATE paiements SET ${payoutStatusColumn} = 'EN_ATTENTE' WHERE id = $1 AND ${payoutStatusColumn} = 'EN_COURS';`, [id]);
  }

  static async createSubscription(userId, period, paymentMethod, planId) {
    const plan = getPlan(planId);
    if (!plan) throw Object.assign(new Error('Formule d’abonnement non prise en charge.'), { statusCode: 400 });
    const quote = calculateSubscriptionQuote(period, planId);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query(
        'SELECT role, employeur_id FROM users WHERE id = $1 FOR UPDATE;',
        [userId],
      );
      const user = userRows[0];
      if (!user || !isPlanAllowedForRole(planId, user.role, user.employeur_id)) {
        throw Object.assign(new Error('Cette formule n’est pas disponible pour votre type de compte.'), { statusCode: 403 });
      }
      if (plan.maxTrucks != null && user.role !== 'CHARGEUR') {
        const { rows: fleetRows } = await client.query(
          'SELECT COUNT(*)::int AS total FROM camions WHERE proprietaire_id = $1;',
          [userId],
        );
        if (Number(fleetRows[0]?.total || 0) > plan.maxTrucks) {
          throw Object.assign(new Error('Votre flotte dépasse la limite de cette formule. Choisissez une formule supérieure.'), { statusCode: 409 });
        }
      }
      const { rows } = await client.query(`
        INSERT INTO abonnements (utilisateur_id, plan, periode, montant, remise_taux, moyen_paiement)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `, [userId, quote.plan, quote.period, quote.amount, quote.discountRate, paymentMethod]);
      await client.query('COMMIT');
      return { subscription: rows[0], quote };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async submitSubscriptionReference(id, userId, reference) {
    const { rows } = await db.query(`
      UPDATE abonnements SET reference_transaction = $1
      WHERE id = $2 AND utilisateur_id = $3 AND statut = 'EN_ATTENTE'
      RETURNING *;
    `, [reference, id, userId]);
    return rows[0];
  }

  static async saveKkiapaySubscriptionPartner(id, userId, partnerId) {
    const { rows } = await db.query(`
      UPDATE abonnements SET kkiapay_partner_id = $1
      WHERE id = $2 AND utilisateur_id = $3 AND moyen_paiement = 'KKIAPAY'
        AND statut = 'EN_ATTENTE'
        AND (kkiapay_partner_id IS NULL OR kkiapay_partner_id = $1)
      RETURNING id;
    `, [partnerId, id, userId]);
    if (!rows[0]) throw Object.assign(new Error('La demande d’abonnement a changé avant l’ouverture de KKiaPay.'), { statusCode: 409 });
    return rows[0];
  }

  static async completeKkiapaySubscription(id, userId, partnerId, transactionId, amount) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT * FROM abonnements
        WHERE id = $1 AND ($2::INTEGER IS NULL OR utilisateur_id = $2)
        FOR UPDATE;
      `, [id, userId]);
      const subscription = rows[0];
      if (!subscription || subscription.moyen_paiement !== 'KKIAPAY' || subscription.kkiapay_partner_id !== partnerId) {
        throw Object.assign(new Error('La transaction KKiaPay ne correspond pas à cet abonnement.'), { statusCode: 409 });
      }
      if (Number(subscription.montant) !== Number(amount)) {
        throw Object.assign(new Error('Le montant confirmé par KKiaPay ne correspond pas au montant dû.'), { statusCode: 409 });
      }
      if (subscription.statut === 'ACTIF' && subscription.reference_transaction === transactionId) {
        await client.query('COMMIT');
        return subscription;
      }
      if (subscription.statut !== 'EN_ATTENTE') {
        throw Object.assign(new Error('Cette demande d’abonnement a déjà été traitée.'), { statusCode: 409 });
      }
      const { rows: updatedRows } = await client.query(`
        WITH next_period AS (
          SELECT pending.id,
                 GREATEST(
                   CURRENT_TIMESTAMP,
                   COALESCE(users.date_fin_essai, CURRENT_TIMESTAMP),
                   COALESCE((
                     SELECT MAX(previous.date_fin)
                     FROM abonnements previous
                     WHERE previous.utilisateur_id = pending.utilisateur_id
                       AND previous.id <> pending.id AND previous.statut = 'ACTIF'
                   ), CURRENT_TIMESTAMP)
                 ) AS starts_at
          FROM abonnements pending
          JOIN users ON users.id = pending.utilisateur_id
          WHERE pending.id = $1 AND pending.statut = 'EN_ATTENTE'
        )
        UPDATE abonnements subscription
        SET statut = 'ACTIF', reference_transaction = $2,
            date_debut = next_period.starts_at,
            date_fin = next_period.starts_at
              + CASE WHEN subscription.periode = 'ANNUAL' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END
        FROM next_period
        WHERE subscription.id = next_period.id
        RETURNING subscription.*;
      `, [id, transactionId]);
      if (!updatedRows[0]) throw Object.assign(new Error('Impossible d’activer cet abonnement après le paiement.'), { statusCode: 409 });
      await client.query('UPDATE users SET abonnement_actif = TRUE WHERE id = $1;', [updatedRows[0].utilisateur_id]);
      await client.query('COMMIT');
      return updatedRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async validateSubscription(id, reference) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        WITH next_period AS (
          SELECT pending.id,
                 GREATEST(
                   CURRENT_TIMESTAMP,
                   COALESCE(users.date_fin_essai, CURRENT_TIMESTAMP),
                   COALESCE((
                     SELECT MAX(previous.date_fin)
                     FROM abonnements previous
                     WHERE previous.utilisateur_id = pending.utilisateur_id
                       AND previous.id <> pending.id
                       AND previous.statut = 'ACTIF'
                   ), CURRENT_TIMESTAMP)
                 ) AS starts_at
          FROM abonnements pending
          JOIN users ON users.id = pending.utilisateur_id
          WHERE pending.id = $1 AND pending.statut = 'EN_ATTENTE'
            AND pending.reference_transaction IS NOT NULL
        )
        UPDATE abonnements subscription
        SET statut = 'ACTIF',
            reference_transaction = COALESCE($2, subscription.reference_transaction),
            date_debut = next_period.starts_at,
            date_fin = next_period.starts_at
              + CASE WHEN subscription.periode = 'ANNUAL' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END
        FROM next_period
        WHERE subscription.id = next_period.id
        RETURNING subscription.*;
      `, [id, reference || null]);
      if (rows[0]) await client.query('UPDATE users SET abonnement_actif = TRUE WHERE id = $1;', [rows[0].utilisateur_id]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findCurrentSubscription(userId) {
    const { rows } = await db.query(`
      SELECT s.*, u.role, u.date_debut_essai, u.date_fin_essai,
             (u.date_fin_essai > CURRENT_TIMESTAMP AND u.date_debut_essai <= CURRENT_TIMESTAMP) AS essai_actif,
             (u.date_fin_essai IS NOT NULL AND u.date_fin_essai <= CURRENT_TIMESTAMP) AS essai_termine,
             active_subscription.plan AS plan_actif,
             active_subscription.date_fin AS acces_date_fin,
             (active_subscription.id IS NOT NULL) AS abonnement_valide,
             (active_subscription.id IS NOT NULL AND active_subscription.date_debut <= CURRENT_TIMESTAMP) AS abonnement_actif,
             (active_subscription.id IS NOT NULL
               AND active_subscription.date_debut <= CURRENT_TIMESTAMP
               AND active_subscription.date_fin <= CURRENT_TIMESTAMP + INTERVAL '5 days') AS renouvellement_ouvert,
             (SELECT COUNT(*)::int FROM camions WHERE proprietaire_id = u.id) AS truck_count,
             (SELECT COUNT(*)::int FROM users driver WHERE driver.employeur_id = u.id AND driver.role = 'CHAUFFEUR') AS driver_count
      FROM users u
      LEFT JOIN LATERAL (
        SELECT * FROM abonnements
        WHERE utilisateur_id = u.id AND statut IN ('ACTIF', 'EN_ATTENTE')
        ORDER BY date_creation DESC LIMIT 1
      ) s ON TRUE
      LEFT JOIN LATERAL (
        SELECT id, plan, date_debut, date_fin FROM abonnements
        WHERE utilisateur_id = u.id AND statut = 'ACTIF' AND date_fin > CURRENT_TIMESTAMP
        ORDER BY date_fin DESC LIMIT 1
      ) active_subscription ON TRUE
      WHERE u.id = $1;
    `, [userId]);
    if (!rows[0]) return null;
    const {
      date_debut_essai, date_fin_essai, essai_actif, essai_termine,
      abonnement_actif, abonnement_valide, renouvellement_ouvert, plan_actif,
      acces_date_fin, role, truck_count, driver_count, ...subscription
    } = rows[0];
    const plan = abonnement_valide ? getPlan(plan_actif) : null;
    const isTrialActive = Boolean(essai_actif);
    const isChargeur = role === 'CHARGEUR';
    const canPublish = isChargeur
      ? plan_actif === 'CHARGEUR' && Boolean(abonnement_actif)
      : true;
    return {
      subscription: subscription.id == null ? null : subscription,
      trial: {
        startsAt: date_debut_essai,
        endsAt: date_fin_essai,
        active: essai_actif,
        expired: essai_termine,
      },
      subscriptionActive: Boolean(abonnement_actif),
      subscriptionValid: Boolean(abonnement_valide),
      renewalOpen: Boolean(renouvellement_ouvert),
      activeSubscriptionEndsAt: acces_date_fin,
      active: Boolean(abonnement_actif || (isTrialActive && !isChargeur)),
      entitlements: {
        planId: isTrialActive && !isChargeur ? 'ESSAI' : plan?.id || (isChargeur ? null : 'GRATUIT'),
        planName: isTrialActive && !isChargeur ? 'Essai gratuit' : plan?.name || (isChargeur ? 'Abonnement requis' : 'Offre gratuite'),
        maxTrucks: isTrialActive && !isChargeur ? null : plan ? plan.maxTrucks : (isChargeur ? 0 : 1),
        maxDrivers: isTrialActive && !isChargeur ? null : plan ? plan.maxDrivers : (isChargeur ? 0 : null),
        truckCount: Number(truck_count || 0),
        driverCount: Number(driver_count || 0),
        canPublish,
        features: plan?.features || (isChargeur ? [] : ['Un camion opérationnel']),
      },
    };
  }

  static async findAdminQueue() {
    const { rows } = await db.query(`
      SELECT p.*, c.statut AS course_statut, d.ville_depart, d.ville_arrivee,
             d.nature_marchandise, owner.id AS proprietaire_id, owner.nom AS proprietaire_nom,
             owner.role AS proprietaire_role, owner.compte_paiement_type,
             owner.compte_paiement_nom, owner.compte_paiement_identifiant,
             owner.compte_paiement_banque, shipper.nom AS chargeur_nom
      FROM paiements p
      JOIN courses c ON c.id = p.course_id
      JOIN demandes_transport d ON d.id = c.demande_id
      JOIN camions truck ON truck.id = c.camion_id
      JOIN users owner ON owner.id = truck.proprietaire_id
      JOIN users shipper ON shipper.id = d.chargeur_id
      ORDER BY p.date_creation DESC;
    `);
    return rows;
  }

  static async recordOwnerPayout(id, tranche, reference, amountUsd = null, rate = null, expectedStatus = 'EN_ATTENTE', resultStatus = 'ENVOYE', actualFeeUsd = null) {
    const isAdvance = tranche === 'AVANCE';
    const paymentStatusColumn = isAdvance ? 'statut_avance' : 'statut_solde';
    const payoutStatusColumn = isAdvance ? 'statut_reversement_avance' : 'statut_reversement_solde';
    const payoutReferenceColumn = isAdvance ? 'reference_reversement_avance' : 'reference_reversement_solde';
    const payoutDateColumn = isAdvance ? 'date_reversement_avance' : 'date_reversement_solde';
    const { rows } = await db.query(`
      UPDATE paiements SET ${payoutStatusColumn} = $6, ${payoutReferenceColumn} = $1,
        ${payoutDateColumn} = CASE WHEN $6 = 'ENVOYE' THEN CURRENT_TIMESTAMP ELSE NULL END,
        ${isAdvance ? 'montant_usd_reversement_avance' : 'montant_usd_reversement_solde'} = $3,
        ${isAdvance ? 'taux_conversion_reversement_avance' : 'taux_conversion_reversement_solde'} = $4,
        ${isAdvance ? 'frais_reversement_paypal_reel_usd_avance' : 'frais_reversement_paypal_reel_usd_solde'} = $7
      WHERE id = $2 AND ${paymentStatusColumn} = 'VALIDE' AND ${payoutStatusColumn} = $5
      RETURNING *;
    `, [reference, id, amountUsd, rate, expectedStatus, resultStatus, actualFeeUsd]);
    return rows[0];
  }
}

module.exports = PaiementModel;
