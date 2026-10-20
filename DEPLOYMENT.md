# Déploiement sur un VPS Ubuntu/Debian

Le script `deploy-vps.sh` installe Node.js 22, Apache, PostgreSQL 18 et Redis, installe les dépendances avec `npm ci`, construit le frontend et configure les quatre services backend avec systemd.

## Avant de lancer le script

1. Copiez **tout le projet** sur le VPS en conservant cette structure :
   `frontend/`, `backend-microservices/` et `deploy-vps.sh`.
2. Ne transférez pas les dossiers `node_modules/` ni `frontend/dist/` : le script installe les paquets et construit le frontend sur le VPS.
3. Copiez également les fichiers `.env` des services `auth-service`, `annonce-service` et `course-service`. Ces fichiers contiennent des secrets et ne doivent pas être publiés dans Git.
4. Dans ces fichiers `.env`, configurez `JWT_SECRET` avec une valeur secrète forte. Le script crée une base PostgreSQL locale `translink`, un utilisateur dédié et un mot de passe aléatoire stocké dans `/etc/translink/db-password`, puis renseigne les variables `DB_*` dans les fichiers `.env`.
5. Vérifiez la configuration SMTP dans les services `auth-service` et `course-service` ainsi que PayPal dans `course-service`. Pour utiliser le même compte expéditeur, définissez les mêmes variables SMTP valides dans les deux fichiers `.env`. Adaptez `FRONTEND_URL` dans `course-service` à votre domaine.
6. Pour utiliser un domaine, faites pointer son enregistrement DNS vers l'adresse IP du VPS et vérifiez que les ports 80 et 443 sont ouverts dans le pare-feu du fournisseur.

### Configuration `.env` sur le VPS existant

Les fichiers `.env.vps.example` sont des modèles, pas des fichiers prêts à remplacer les `.env` du VPS. Ils contiennent des marqueurs à compléter et ne contiennent aucun secret.
Gardez `DB_HOST=127.0.0.1` : PostgreSQL est installé sur le même VPS. Utilisez `https://translink-africa.servehttp.com` comme `FRONTEND_URL`; ne mettez pas l'adresse IP locale du poste de développement.

Ne remplacez pas directement les `.env` actuellement utilisés : conservez le mot de passe PostgreSQL généré dans `/etc/translink/db-password`, le même `JWT_SECRET` dans les trois services, et la clé `INTEGRATION_CONFIG_ENCRYPTION_KEY` qui chiffre les réglages stockés en base. Une clé différente rendrait les réglages chiffrés SMTP illisibles. Une configuration SMTP complète dans les variables `SMTP_*` du service prend priorité sur la configuration chiffrée enregistrée dans l'administration; sans configuration `.env` complète, le service SMTP de l'administration est utilisé. Pour Gmail, utilisez un mot de passe d'application, pas le mot de passe normal du compte; les espaces de présentation d'un mot de passe d'application Gmail sont ignorés par le transport.

## Installation

Copiez par exemple le projet dans `/var/www/translink`, faites pointer le DNS du domaine vers le VPS, ouvrez les ports 80 et 443 dans le pare-feu, puis lancez depuis ce répertoire en fournissant le domaine et l'adresse e-mail qui recevra les avis de Certbot :

```sh
sed -i 's/\r$//' deploy-vps.sh
bash -n deploy-vps.sh
sudo bash deploy-vps.sh exemple.com vous@example.com
```

Le script installe Certbot et son module Apache, obtient le certificat HTTPS et configure la redirection HTTP vers HTTPS. L'adresse e-mail peut aussi être omise en lancement interactif ; le script la demandera. La conversion CRLF/LF et le contrôle de syntaxe sont utiles si le script a été transféré depuis Windows.

Pour un premier test par adresse IP ou sans nom de domaine :

```sh
sudo bash deploy-vps.sh
```

Le script force les ports backend attendus par la passerelle (`5001`, `5002` et `5003`) et construit le frontend avec l'API servie sous le même domaine. Apache sert les fichiers du frontend, applique le repli SPA pour les routes React et transmet l'API, les WebSocket et les fichiers téléversés vers la passerelle locale. Il ne désactive pas les autres sites Apache et ne supprime pas une base PostgreSQL `translink` existante.

Pour un test sans domaine, aucun certificat HTTPS ne sera demandé. Une fois le domaine configuré, utilisez la commande de déploiement avec son adresse e-mail pour activer HTTPS.

Commandes utiles :

```sh
sudo systemctl status translink-api-gateway translink-auth-service translink-annonce-service translink-course-service
sudo journalctl -u translink-auth-service -f
sudo apache2ctl configtest
```

## Actualisations temps réel et informations de connexion admin

Les mutations API réussies sont diffusées via Redis et Socket.IO aux sessions authentifiées. La passerelle, Course et Redis doivent donc être actifs; les tableaux de bord rechargent leurs données en arrière-plan sans rechargement de page. Le menu des notifications reçoit aussi les nouveautés en direct et son panneau reste défilable sur mobile.

Dans **Administration > Utilisateurs**, les dates d'inscription et de transmission des documents sont affichées dans la liste. En ouvrant une fiche, l'administrateur peut aussi consulter le dernier dépôt, la date et l'adresse IP de connexion ainsi que le navigateur et l'appareil détectés. Ces informations proviennent de `login_history`; les anciennes connexions qui n'ont pas de métadonnées restent affichées comme non renseignées.

Après avoir transféré les changements sur un VPS déjà installé, reconstruisez le frontend et redémarrez les services concernés. Le démarrage de Course applique aussi les colonnes et l'index manquants à `login_history` :

```sh
cd /var/www/Translink-sn/frontend
VITE_API_URL=/ npm run build
sudo systemctl restart translink-api-gateway translink-course-service translink-auth-service
sudo systemctl reload apache2
```

## Supervision et journaux dans l'espace administrateur

La page **Administration > État du serveur** affiche les mesures CPU, mémoire, disque, l'état des quatre services et de PostgreSQL. Les journaux récents sont accessibles uniquement aux administrateurs et sont limités aux 100 dernières lignes des unités Translink autorisées.

Pour un nouveau déploiement, `deploy-vps.sh` installe la règle sudoers restreinte et configure le service Course pour l'utiliser. Sur un VPS déjà installé, après avoir transféré le code, ajoutez l'autorisation ciblée et le remplacement systemd nécessaire (le service Course est lancé avec `NoNewPrivileges=true` par défaut, ce qui empêcherait sudo de fonctionner) :

```sh
sudo tee /etc/sudoers.d/translink-journal >/dev/null <<'EOF'
translink ALL=(root) NOPASSWD: /usr/bin/journalctl --unit=translink-api-gateway.service --no-pager --output=short-iso --lines=100, \
  /usr/bin/journalctl --unit=translink-auth-service.service --no-pager --output=short-iso --lines=100, \
  /usr/bin/journalctl --unit=translink-annonce-service.service --no-pager --output=short-iso --lines=100, \
  /usr/bin/journalctl --unit=translink-course-service.service --no-pager --output=short-iso --lines=100
EOF
sudo chmod 0440 /etc/sudoers.d/translink-journal
sudo visudo -cf /etc/sudoers.d/translink-journal
sudo mkdir -p /etc/systemd/system/translink-course-service.service.d
printf '[Service]\nNoNewPrivileges=false\n' | sudo tee /etc/systemd/system/translink-course-service.service.d/journal-access.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart translink-course-service
```

Cette règle n'autorise que les quatre commandes `journalctl` fixes indiquées ci-dessus; elle ne donne pas d'accès sudo général à `translink`. Gardez les journaux accessibles uniquement dans l'espace administrateur.

## Abonnements et paiement manuel

Le compte transport validé par un administrateur démarre un essai de 14 jours. Après l’essai, l’utilisateur peut souscrire à l’une des formules mensuelles détaillées ci-dessous. Les renouvellements restent manuels : les utilisateurs transmettent une référence de paiement, puis l’administrateur vérifie le règlement et confirme l’activation dans **Administration > Transactions**.

Les destinations Wave, Orange Money et bancaires se configurent dans **Administration > Services externes > Abonnements — paiements manuels**. Activez au moins un moyen et renseignez ses coordonnées; ces informations sont chiffrées en base et seules les coordonnées nécessaires au règlement sont présentées aux utilisateurs. Les services Auth et Course doivent lire la même base PostgreSQL et utiliser exactement la même clé `INTEGRATION_CONFIG_ENCRYPTION_KEY`; sinon, les paiements ne pourront pas lire les paramètres enregistrés depuis l’administration.

### KKiaPay

KKiaPay prend en charge l’initiation du paiement par son SDK JavaScript et impose une vérification côté serveur avec son SDK Node.js avant de confirmer un encaissement. Transitions automatiques disponibles : abonnements et tranches de paiement de course. Le virement bancaire manuel reste disponible séparément; il ne fait pas partie du widget KKiaPay. Le widget autorise Mobile Money, carte et wallet, selon les moyens activés sur le compte marchand et les pays sélectionnés (codes configurables : `SN`, `BJ`, `CI`, `TG`, `NE`).

Dans **Administration > Services externes > KKiaPay**, configurez les clés publique, privée et secrète, le hash secret webhook, les pays et le mode Sandbox. Les clés privées/secrètes restent chiffrées en base et ne sont jamais renvoyées au navigateur. Configurez dans le tableau KKiaPay le webhook `https://<domaine>/api/paiements/webhook/kkiapay` avec le même hash secret. L’activation Live requiert un compte marchand KKiaPay actif; testez d’abord avec Sandbox.

Références officielles : [SDK JavaScript](https://docs.kkiapay.me/v1/plugin-et-sdk/sdk-javascript.md), [SDK Node.js côté serveur](https://docs.kkiapay.me/v1/plugin-et-sdk/admin-sdks-server-side/node.js-admin-sdk.md), [webhooks](https://docs.kkiapay.me/v1/tableau-de-bord/webhook.md), [guide Sandbox](https://docs.kkiapay.me/v1/compte/kkiapay-sandbox-guide-de-test.md).

Après transfert des changements sur un VPS déjà installé, redémarrez les services pour appliquer les colonnes d’essai et les routes backend, puis reconstruisez le frontend :

```sh
sudo systemctl restart translink-auth-service translink-annonce-service translink-course-service
cd /var/www/Translink-sn/frontend
VITE_API_URL=/ npm run build
sudo systemctl reload apache2
```

Pour la migration KKiaPay, copiez également `database.sql` ainsi que les manifestes (`package.json` et `package-lock.json`) du service Course, puis exécutez `npm ci` dans `backend-microservices/course-service`. Le service applique `database.sql` à son démarrage; redémarrez-le et vérifiez ses journaux pour confirmer que la migration est passée.

### Rappels d’essai et de renouvellement

Le service Course envoie un rappel e-mail aux comptes transport dont l’essai gratuit ou l’abonnement actif arrive à échéance dans les cinq jours, ainsi qu’aux chargeurs abonnés. Le rappel d’essai est envoyé uniquement après validation du compte; le renouvellement mensuel reste manuel, sans prélèvement automatique. La tâche vérifie les échéances toutes les six heures et réessaie les envois SMTP échoués. Elle nécessite une adresse e-mail utilisateur et un SMTP fonctionnel dans **Administration > Services externes**. La table de suivi des envois est créée automatiquement via `database.sql` au démarrage de Course.

Après les 14 jours d’essai, un compte sans abonnement actif reste sur l’offre gratuite : un seul camion peut publier des disponibilités ou accepter des courses. Si plusieurs camions avaient été enregistrés pendant l’essai, leurs données et missions en cours sont conservées; seul le camion enregistré en premier reste éligible aux nouvelles opérations jusqu’à la souscription. Aucun paiement n’est prélevé automatiquement. Le contrôle de cette limite est appliqué côté serveur par les services Annonce et Course.

### Forfaits et quotas

Les tarifs mensuels sont : Individuel privé (chauffeur indépendant) 5 000 FCFA pour 1 camion et 1 chauffeur; Petite entreprise 10 000 FCFA pour au plus 3 camions et 3 chauffeurs; Grande entreprise 15 000 FCFA avec camions et chauffeurs illimités et priorité de visibilité des disponibilités; Chargeur 2 500 FCFA pour publier des demandes pendant la période payée. Le chargeur ne bénéficie pas de l’essai gratuit et doit avoir un abonnement actif avant chaque nouvelle publication. Les services Course et Auth appliquent les paiements et quotas côté serveur. Les anciennes formules `PRO` actives conservent leurs droits historiques illimités jusqu’à leur échéance.

Pour déployer les forfaits, copiez les fichiers modifiés dans `backend-microservices/shared`, `backend-microservices/auth-service`, `backend-microservices/annonce-service`, `backend-microservices/course-service` et `frontend`, puis redémarrez Auth, Annonce et Course. Reconstruisez ensuite le frontend. Vérifiez les journaux de Course pour confirmer la migration de `subscription_reminder_emails` et l’envoi SMTP des rappels.

## Newsletter et publipostage

Les migrations ajoutent automatiquement le consentement newsletter et les tables de campagnes au prochain démarrage des services Auth et Course. Après avoir copié les changements sur le VPS, redémarrez ces services et reconstruisez le frontend :

```sh
sudo systemctl restart translink-auth-service translink-course-service
cd /var/www/Translink-sn/frontend
VITE_API_URL=/ npm run build
sudo systemctl reload apache2
```

Le formulaire d'inscription ne transmet plus `newsletter_consent`, ce qui évite l'erreur `"newsletter_consent" is not allowed` sur un service Auth ancien. Le service Auth doit tout de même être mis à jour et redémarré pour inscrire par défaut les nouveaux comptes et les invitations finalisées. Les préférences des comptes déjà existants restent inchangées.

Les nouveaux comptes sont inscrits par défaut aux communications par e-mail et peuvent se désabonner dans **Profil > Newsletter** ou depuis le lien inclus dans chaque campagne. Les comptes existants conservent leur préférence actuelle. L’administration trouve le publipostage dans **Administration > Newsletter**. L’envoi utilise le SMTP configuré dans **Administration > Services externes**; chaque destinataire reçoit un message individuel avec un lien de désabonnement.

## Réinstaller PostgreSQL 18 et restaurer l'archive

`reinstall-postgresql18-vps.sh` désinstalle PostgreSQL 16 et supprime **tous ses clusters et toutes leurs données**, puis installe PostgreSQL 18, restaure l'archive et reconfigure les `.env` des services. Cette opération est destructive et irréversible : conservez une sauvegarde externe de toute base PostgreSQL 16 à préserver.

Le nouvel export PostgreSQL 18 est `translink-database-reexport-2026-10-16.dump`. Transférez ce fichier et `reinstall-postgresql18-vps.sh` à la racine du projet sur le VPS. Le script vérifie d'abord l'archive avec `pg_restore` 18 avant de supprimer PostgreSQL 16.

```sh
cd /var/www/Translink-sn
sed -i 's/\r$//' reinstall-postgresql18-vps.sh
bash -n reinstall-postgresql18-vps.sh
sudo bash reinstall-postgresql18-vps.sh --confirm-delete-postgresql16
```

L'argument `--confirm-delete-postgresql16` est obligatoire. Si l'archive est ailleurs, donnez son chemin en deuxième argument. PostgreSQL 18 utilise le port `5432` et reste accessible uniquement en local. L'installation requiert un accès Internet au dépôt officiel PostgreSQL.
