const db = require('../config/db');

class UserModel {
  static async create(user) {
    const { nom, telephone_whatsapp, email, mot_de_passe, ville, numero_cni_nin, role, newsletter_consent } = user;
    const query = `
      INSERT INTO users (nom, telephone_whatsapp, email, mot_de_passe, ville, numero_cni_nin, role, newsletter_consent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8 THEN CURRENT_TIMESTAMP ELSE NULL END)
      RETURNING id, nom, telephone_whatsapp, email, ville, role, statut_verification, newsletter_consent_at, date_creation;
    `;
    const values = [nom, telephone_whatsapp, email, mot_de_passe, ville, numero_cni_nin, role, newsletter_consent !== false];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async findByTelephone(telephone_whatsapp) {
    const query = "SELECT * FROM users WHERE regexp_replace(telephone_whatsapp, '[^0-9]', '', 'g') = $1;";
    const { rows } = await db.query(query, [telephone_whatsapp]);
    return rows[0];
  }

  static async findByEmail(email) {
    if (!email) return null;
    const query = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1);';
    const { rows } = await db.query(query, [email]);
    return rows[0];
  }

  static async findByCniNin(numero_cni_nin) {
    const { rows } = await db.query('SELECT id FROM users WHERE numero_cni_nin = $1;', [numero_cni_nin]);
    return rows[0];
  }

  static async findById(id) {
    const query = 'SELECT id, nom, telephone_whatsapp, email, ville, role, statut_verification, abonnement_actif, avatar_url, employeur_id, description, compte_paiement_type, compte_paiement_nom, compte_paiement_identifiant, compte_paiement_banque, newsletter_consent_at, date_creation FROM users WHERE id = $1;';
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  static async getPaymentAccounts(userId) {
    const { rows } = await db.query(
      'SELECT id, method, holder, identifier, bank, can_receive, can_send, is_default_receive, is_default_send, updated_at FROM user_payment_accounts WHERE user_id = $1 ORDER BY method;',
      [userId]
    );
    return rows;
  }

  static async canManagePaymentAccounts(userId) {
    const { rows } = await db.query(
      'SELECT role, employeur_id FROM users WHERE id = $1;',
      [userId]
    );
    const user = rows[0];
    if (!user || !['TRANSPORTEUR', 'ENTREPRISE', 'CHARGEUR', 'CHAUFFEUR'].includes(user.role)) {
      return false;
    }
    return user.role !== 'CHAUFFEUR' || user.employeur_id === null;
  }

  static async savePaymentAccount(userId, account) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      if (account.is_default_receive) {
        await client.query('UPDATE user_payment_accounts SET is_default_receive = FALSE WHERE user_id = $1 AND method <> $2;', [userId, account.method]);
      }
      if (account.is_default_send) {
        await client.query('UPDATE user_payment_accounts SET is_default_send = FALSE WHERE user_id = $1 AND method <> $2;', [userId, account.method]);
      }

      const { rows: accountRows } = await client.query(`
        INSERT INTO user_payment_accounts
          (user_id, method, holder, identifier, bank, can_receive, can_send, is_default_receive, is_default_send, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, method) DO UPDATE SET
          holder = EXCLUDED.holder,
          identifier = EXCLUDED.identifier,
          bank = EXCLUDED.bank,
          can_receive = EXCLUDED.can_receive,
          can_send = EXCLUDED.can_send,
          is_default_receive = EXCLUDED.is_default_receive,
          is_default_send = EXCLUDED.is_default_send,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, method, holder, identifier, bank, can_receive, can_send, is_default_receive, is_default_send, updated_at;
      `, [userId, account.method, account.holder, account.identifier, account.bank, account.can_receive, account.can_send, account.is_default_receive, account.is_default_send]);

      await client.query(`
        UPDATE users
        SET (compte_paiement_type, compte_paiement_nom, compte_paiement_identifiant, compte_paiement_banque) = (
          SELECT method, holder, identifier, bank
          FROM user_payment_accounts
          WHERE user_id = $1 AND is_default_receive
          LIMIT 1
        )
        WHERE id = $1;
      `, [userId]);

      await client.query('COMMIT');
      return { account: accountRows[0], accounts: await this.getPaymentAccounts(userId), user: await this.findById(userId) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findPasswordById(id) {
    const { rows } = await db.query('SELECT mot_de_passe FROM users WHERE id = $1;', [id]);
    return rows[0];
  }

  static async updateStatus(id, statut) {
    const query = 'UPDATE users SET statut_verification = $1 WHERE id = $2 RETURNING *;';
    const { rows } = await db.query(query, [statut, id]);
    return rows[0];
  }

  static async updateProfile(id, profileData) {
    const { nom, email, ville, telephone_whatsapp, avatar_url, description } = profileData;
    const query = `
      UPDATE users 
      SET nom = COALESCE($1, nom), 
          email = COALESCE($2, email), 
          ville = COALESCE($3, ville),
          telephone_whatsapp = COALESCE($4, telephone_whatsapp),
          avatar_url = COALESCE($5, avatar_url),
          description = COALESCE($6, description)
        WHERE id = $7
      RETURNING id, nom, telephone_whatsapp, email, ville, role, statut_verification, avatar_url, abonnement_actif, description, compte_paiement_type, compte_paiement_nom, compte_paiement_identifiant, compte_paiement_banque, newsletter_consent_at, date_creation;
    `;
    const { rows } = await db.query(query, [nom, email, ville, telephone_whatsapp, avatar_url, description, id]);
    return rows[0];
  }

  static async setNewsletterConsent(id, consent) {
    const { rows } = await db.query(
      `UPDATE users
       SET newsletter_consent_at = CASE
         WHEN $1 THEN COALESCE(newsletter_consent_at, CURRENT_TIMESTAMP)
         ELSE NULL
       END
       WHERE id = $2
       RETURNING id, nom, email, newsletter_consent_at;`,
      [consent, id]
    );
    return rows[0];
  }

  static async addLoginHistory(id, ip, navigateur, appareil, machine, userAgent) {
    try {
      await db.query(
        'INSERT INTO login_history (utilisateur_id, adresse_ip, navigateur, appareil, machine, user_agent) VALUES ($1, $2, $3, $4, $5, $6);',
        [id, ip, navigateur || 'Inconnu', appareil || 'Inconnu', machine || 'Inconnu', userAgent || null]
      );
    } catch (error) {
      if (error.code === '42P01') {
        console.warn('Table login_history absente, enregistrement des connexions ignoré.');
        return;
      }
      if (error.code === '42703') {
        console.warn('Colonnes login_history incomplètes, tentative de migration automatique ignorée.');
        return;
      }
      throw error;
    }
  }

  static async getLoginHistory(id) {
    try {
      const { rows } = await db.query(
        'SELECT id, date_connexion, adresse_ip, navigateur, appareil, machine, user_agent FROM login_history WHERE utilisateur_id = $1 ORDER BY date_connexion DESC LIMIT 50;',
        [id]
      );
      return rows;
    } catch (error) {
      if (error.code === '42P01' || error.code === '42703') {
        return [];
      }
      throw error;
    }
  }

  static async updatePassword(id, passwordHash) {
    await db.query('UPDATE users SET mot_de_passe = $1 WHERE id = $2;', [passwordHash, id]);
  }
}

module.exports = UserModel;
