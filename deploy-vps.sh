#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${APP_DIR}/backend-microservices"
DOMAIN="${1:-_}"
CERTBOT_EMAIL="${2:-}"
SITE_NAME="translink"

log() {
  printf '\n[Translink] %s\n' "$*"
}

fail() {
  printf '\n[Translink] ERREUR : %s\n' "$*" >&2
  exit 1
}

if [[ "${EUID}" -ne 0 ]]; then
  fail "Lancez ce script en root : sudo bash deploy-vps.sh [votre-domaine.tld]"
fi

if [[ "${DOMAIN}" != "_" && ! "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  fail "Nom de domaine invalide : utilisez un nom DNS ou une adresse IPv4 sans espaces."
fi
if [[ "${DOMAIN}" != "_" ]]; then
  if [[ -z "${CERTBOT_EMAIL}" && -t 0 ]]; then
    read -r -p "Adresse e-mail pour les avis de renouvellement du certificat HTTPS : " CERTBOT_EMAIL
  fi
  if [[ ! "${CERTBOT_EMAIL}" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
    fail "Fournissez une adresse e-mail valide en deuxième argument : sudo bash deploy-vps.sh ${DOMAIN} votre@email.com"
  fi
fi

for path in \
  "${APP_DIR}/frontend/package-lock.json" \
  "${APP_DIR}/backend-microservices/package-lock.json" \
  "${APP_DIR}/backend-microservices/api-gateway/package-lock.json" \
  "${APP_DIR}/backend-microservices/auth-service/package-lock.json" \
  "${APP_DIR}/backend-microservices/annonce-service/package-lock.json" \
  "${APP_DIR}/backend-microservices/course-service/package-lock.json"; do
  [[ -f "${path}" ]] || fail "Fichier absent : ${path}. Copiez le projet complet avant de lancer le script."
done

for service in auth-service annonce-service course-service; do
  env_file="${APP_DIR}/backend-microservices/${service}/.env"
  [[ -f "${env_file}" ]] || fail "Fichier ${env_file} absent. Copiez le fichier .env de ce service avant le déploiement."
  for key in JWT_SECRET; do
    if ! grep -qE "^${key}=.+" "${env_file}"; then
      fail "La variable ${key} doit être renseignée dans ${env_file}."
    fi
  done
done

if [[ ! -f /etc/os-release ]]; then
  fail "Impossible d'identifier la distribution Linux. Ce script nécessite Ubuntu ou Debian."
fi
# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" && " ${ID_LIKE:-} " != *" debian "* ]]; then
  fail "Distribution non prise en charge : ${PRETTY_NAME:-inconnue}. Utilisez Ubuntu ou Debian."
fi

if command -v pg_lsclusters >/dev/null 2>&1 \
  && pg_lsclusters --no-header | awk '$1 == 16 { found = 1 } END { exit !found }'; then
  fail "Un cluster PostgreSQL 16 existe. Exécutez d'abord reinstall-postgresql18-vps.sh avec sa confirmation destructive."
fi

log "Installation des paquets système"
apt-get update
apt-get install -y ca-certificates curl gnupg openssl build-essential apache2 redis-server sudo
if [[ "${DOMAIN}" != "_" ]]; then
  apt-get install -y certbot python3-certbot-apache
fi

log "Configuration du dépôt PostgreSQL officiel"
install -d -m 0755 /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor --yes -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
chmod 0644 /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' \
  "${VERSION_CODENAME}" > /etc/apt/sources.list.d/pgdg.list
apt-get update
apt-get install -y postgresql-18 postgresql-client-18

if ! pg_lsclusters --no-header | awk '$1 == 18 && $2 == "main" { found = 1 } END { exit !found }'; then
  pg_createcluster 18 main --port=5432
fi
if pg_lsclusters --no-header | awk '$3 == 5432 && !($1 == 18 && $2 == "main") { found = 1 } END { exit !found }'; then
  fail "Le port PostgreSQL 5432 est attribué à un autre cluster. Vérifiez pg_lsclusters avant de poursuivre."
fi
pg_conftool 18 main set port 5432
pg_conftool 18 main set listen_addresses 127.0.0.1
systemctl enable --now postgresql@18-main
systemctl restart postgresql@18-main
pg_isready --host=/var/run/postgresql --port=5432 \
  || fail "PostgreSQL 18 ne répond pas sur le port 5432."

if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"; then
  log "Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

command -v npm >/dev/null 2>&1 || fail "npm n'est pas disponible après l'installation de Node.js."

set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

log "Configuration des ports internes des services"
set_env_value "${APP_DIR}/backend-microservices/auth-service/.env" PORT 5001
set_env_value "${APP_DIR}/backend-microservices/annonce-service/.env" PORT 5002
set_env_value "${APP_DIR}/backend-microservices/course-service/.env" PORT 5003

log "Initialisation de la base PostgreSQL locale"
install -d -m 700 /etc/translink
if [[ ! -s /etc/translink/db-password ]]; then
  openssl rand -hex 32 > /etc/translink/db-password
  chmod 600 /etc/translink/db-password
fi
DB_PASSWORD="$(< /etc/translink/db-password)"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<SQL
SELECT format('CREATE ROLE translink_app WITH LOGIN PASSWORD %L', '${DB_PASSWORD}')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'translink_app') \gexec
ALTER ROLE translink_app WITH LOGIN PASSWORD '${DB_PASSWORD}';
SELECT 'CREATE DATABASE translink OWNER translink_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'translink') \gexec
ALTER DATABASE translink OWNER TO translink_app;
SQL

for service in auth-service annonce-service course-service; do
  env_file="${APP_DIR}/backend-microservices/${service}/.env"
  set_env_value "${env_file}" DB_USER translink_app
  set_env_value "${env_file}" DB_PASSWORD "${DB_PASSWORD}"
  set_env_value "${env_file}" DB_NAME translink
  set_env_value "${env_file}" DB_HOST 127.0.0.1
  set_env_value "${env_file}" DB_PORT 5432
done

log "Installation des dépendances Node.js"
(
  cd "${BACKEND_DIR}"
  npm ci --omit=dev
)
for service in api-gateway auth-service annonce-service course-service; do
  service_dir="${APP_DIR}/backend-microservices/${service}"
  (cd "${service_dir}" && npm ci --omit=dev)
done

log "Construction du frontend React"
(cd "${APP_DIR}/frontend" && npm ci && VITE_API_URL=/ npm run build)

log "Préparation du compte système et des répertoires d'envoi"
if ! id translink >/dev/null 2>&1; then
  useradd --system --home-dir "${APP_DIR}" --no-create-home --shell /usr/sbin/nologin translink
fi
for service in auth-service annonce-service course-service; do
  mkdir -p "${APP_DIR}/backend-microservices/${service}/uploads"
done
for service in auth-service annonce-service course-service; do
  service_dir="${APP_DIR}/backend-microservices/${service}"
  chown translink:translink "${service_dir}/.env" "${service_dir}/uploads"
  chmod 600 "${service_dir}/.env"
done

log "Configuration de l'accès limité aux journaux systemd"
cat > /etc/sudoers.d/translink-journal <<'EOF'
translink ALL=(root) NOPASSWD: /usr/bin/journalctl --unit=translink-api-gateway.service --no-pager --output=short-iso --lines=100, \
  /usr/bin/journalctl --unit=translink-auth-service.service --no-pager --output=short-iso --lines=100, \
  /usr/bin/journalctl --unit=translink-annonce-service.service --no-pager --output=short-iso --lines=100, \
  /usr/bin/journalctl --unit=translink-course-service.service --no-pager --output=short-iso --lines=100
EOF
chmod 0440 /etc/sudoers.d/translink-journal
visudo -cf /etc/sudoers.d/translink-journal \
  || fail "La règle sudoers de consultation des journaux est invalide."

write_service() {
  local service_name="$1" working_dir="$2" entrypoint="$3" no_new_privileges="true"
  # The course service needs sudo for the exact journalctl commands allowed above.
  if [[ "${service_name}" == "course-service" ]]; then
    no_new_privileges="false"
  fi
  cat > "/etc/systemd/system/${SITE_NAME}-${service_name}.service" <<EOF
[Unit]
Description=Translink ${service_name}
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=translink
Group=translink
WorkingDirectory=${working_dir}
Environment=NODE_ENV=production
ExecStart=/usr/bin/node ${entrypoint}
Restart=on-failure
RestartSec=5
NoNewPrivileges=${no_new_privileges}
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
}

write_service api-gateway "${BACKEND_DIR}/api-gateway" "${BACKEND_DIR}/api-gateway/index.js"
write_service auth-service "${BACKEND_DIR}/auth-service" "${BACKEND_DIR}/auth-service/src/server.js"
write_service annonce-service "${BACKEND_DIR}/annonce-service" "${BACKEND_DIR}/annonce-service/src/server.js"
write_service course-service "${BACKEND_DIR}/course-service" "${BACKEND_DIR}/course-service/src/server.js"

log "Activation des modules Apache nécessaires"
a2enmod rewrite proxy proxy_http proxy_wstunnel headers

log "Configuration du VirtualHost Apache"
cat > "/etc/apache2/sites-available/${SITE_NAME}.conf" <<EOF
<VirtualHost *:80>
    ServerName ${DOMAIN}
    DocumentRoot "${APP_DIR}/frontend/dist"
    LimitRequestBody 20971520

    <Directory "${APP_DIR}/frontend/dist">
        Options FollowSymLinks
        AllowOverride None
        Require all granted
        FallbackResource /index.html
    </Directory>

    ProxyPreserveHost On
    ProxyTimeout 3600
    ProxyPass "/socket.io/" "http://127.0.0.1:5000/socket.io/" upgrade=websocket
    ProxyPassReverse "/socket.io/" "http://127.0.0.1:5000/socket.io/"
    ProxyPass "/api-docs" "http://127.0.0.1:5000/api-docs"
    ProxyPassReverse "/api-docs" "http://127.0.0.1:5000/api-docs"
    ProxyPass "/api" "http://127.0.0.1:5000/api"
    ProxyPassReverse "/api" "http://127.0.0.1:5000/api"
    ProxyPass "/uploads" "http://127.0.0.1:5000/uploads"
    ProxyPassReverse "/uploads" "http://127.0.0.1:5000/uploads"

    ErrorLog \${APACHE_LOG_DIR}/${SITE_NAME}-error.log
    CustomLog \${APACHE_LOG_DIR}/${SITE_NAME}-access.log combined
</VirtualHost>
EOF

apache2ctl configtest
a2ensite "${SITE_NAME}.conf"

log "Activation des services"
systemctl enable --now postgresql redis-server
systemctl daemon-reload
systemctl enable --now \
  translink-api-gateway.service \
  translink-auth-service.service \
  translink-annonce-service.service \
  translink-course-service.service
systemctl enable --now apache2
systemctl reload apache2

if [[ "${DOMAIN}" != "_" ]]; then
  log "Obtention du certificat HTTPS et redirection HTTP"
  certbot --apache \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "${CERTBOT_EMAIL}" \
    --domain "${DOMAIN}"
  systemctl enable --now certbot.timer
  if ! curl --silent --show-error --fail --max-time 20 "https://${DOMAIN}/" >/dev/null; then
    fail "HTTPS ne répond pas encore. Vérifiez la résolution DNS et l'ouverture des ports 80/443."
  fi
fi

if ! curl --silent --show-error --fail --max-time 10 http://127.0.0.1:5000/ >/dev/null; then
  fail "La passerelle API ne répond pas. Vérifiez ses journaux avec : journalctl -u translink-api-gateway -n 100 --no-pager"
fi

log "Déploiement terminé"
if [[ "${DOMAIN}" != "_" ]]; then
  printf 'Site HTTPS : https://%s/\n' "${DOMAIN}"
else
  printf "Apache est configuré sans domaine ; HTTPS n'a pas été configuré.\n"
fi
printf 'API locale : http://127.0.0.1:5000/\n'
printf 'Journaux : journalctl -u "translink-*.service" -f\n'
printf 'Vérifiez les variables .env, la base PostgreSQL et les accès réseau du VPS avant la mise en production.\n'
