#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIRM_FLAG="${1:-}"
DUMP_FILE="${2:-${APP_DIR}/translink-database-reexport-2026-10-16.dump}"
DB_NAME="translink"
DB_USER="translink_app"
DB_PORT="5432"

log() {
  printf '\n[Translink PostgreSQL 18] %s\n' "$*"
}

fail() {
  printf '\n[Translink PostgreSQL 18] ERREUR : %s\n' "$*" >&2
  exit 1
}

if [[ "${EUID}" -ne 0 ]]; then
  fail "Lancez ce script en root : sudo bash reinstall-postgresql18-vps.sh --confirm-delete-postgresql16 [chemin/vers/le/dump]"
fi

if [[ "${CONFIRM_FLAG}" != "--confirm-delete-postgresql16" ]]; then
  fail "Cette opération supprime les clusters et les données PostgreSQL 16. Pour confirmer, relancez avec --confirm-delete-postgresql16 en premier argument."
fi

[[ -f "${DUMP_FILE}" ]] || fail "Archive absente : ${DUMP_FILE}. Transférez d'abord le nouvel export PostgreSQL 18."
[[ -f /etc/os-release ]] || fail "Impossible d'identifier la distribution Linux."
# shellcheck disable=SC1091
source /etc/os-release

if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" && " ${ID_LIKE:-} " != *" debian "* ]]; then
  fail "Distribution non prise en charge : ${PRETTY_NAME:-inconnue}. Utilisez Ubuntu ou Debian."
fi

if [[ -z "${VERSION_CODENAME:-}" ]]; then
  fail "Le nom de code de la distribution est introuvable dans /etc/os-release."
fi

if ! id translink >/dev/null 2>&1; then
  fail "Le compte système translink est absent. Déployez d'abord l'application avec deploy-vps.sh."
fi

for service in auth-service annonce-service course-service; do
  env_file="${APP_DIR}/backend-microservices/${service}/.env"
  [[ -f "${env_file}" ]] || fail "Fichier absent : ${env_file}"
done

command -v pg_lsclusters >/dev/null 2>&1 || fail "PostgreSQL ou pg_lsclusters est absent."
command -v pg_dropcluster >/dev/null 2>&1 || fail "La commande pg_dropcluster est absente."
command -v runuser >/dev/null 2>&1 || fail "La commande runuser est requise."
mapfile -t PG16_CLUSTERS < <(pg_lsclusters --no-header | awk '$1 == 16 { print $2 }')
if [[ "${#PG16_CLUSTERS[@]}" -eq 0 ]]; then
  fail "Aucun cluster PostgreSQL 16 détecté. Aucun changement n'a été effectué."
fi

if pg_lsclusters --no-header | awk '$1 == 18 { found = 1 } END { exit !found }'; then
  fail "Un cluster PostgreSQL 18 existe déjà. Arrêt par sécurité : vérifiez et sauvegardez ses données avant toute réinstallation."
fi

for service in translink-api-gateway translink-auth-service translink-annonce-service translink-course-service; do
  systemctl cat "${service}.service" >/dev/null 2>&1 \
    || fail "Unité systemd absente : ${service}.service. Déployez d'abord l'application."
done

log "Installation du client PostgreSQL 18 avant toute suppression"
apt-get update
apt-get install -y ca-certificates curl gnupg
install -d -m 0755 /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor --yes -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
chmod 0644 /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' \
  "${VERSION_CODENAME}" > /etc/apt/sources.list.d/pgdg.list
apt-get update
apt-get install -y postgresql-client-18

PG_RESTORE="/usr/lib/postgresql/18/bin/pg_restore"
[[ -x "${PG_RESTORE}" ]] || fail "Le client pg_restore PostgreSQL 18 est introuvable."
"${PG_RESTORE}" --list "${DUMP_FILE}" >/dev/null \
  || fail "Le client PostgreSQL 18 ne peut pas lire l'archive. PostgreSQL 16 n'a pas été supprimé."

printf '\nATTENTION : ce script va supprimer les clusters PostgreSQL 16 suivants et leurs données : %s\n' "${PG16_CLUSTERS[*]}"
printf 'L’archive PostgreSQL 18 sera restaurée dans une nouvelle base translink.\n'
log "Arrêt des services applicatifs"
systemctl stop \
  translink-api-gateway.service \
  translink-auth-service.service \
  translink-annonce-service.service \
  translink-course-service.service

log "Suppression des clusters PostgreSQL 16 confirmés"
for cluster in "${PG16_CLUSTERS[@]}"; do
  pg_dropcluster --stop 16 "${cluster}"
done

mapfile -t PG16_PACKAGES < <(dpkg-query -W -f='${binary:Package}\n' 'postgresql-16*' 2>/dev/null || true)
for package in postgresql postgresql-client postgresql-contrib; do
  if [[ "$(dpkg-query -W -f='${db:Status-Status}' "${package}" 2>/dev/null || true)" == "installed" ]]; then
    PG16_PACKAGES+=("${package}")
  fi
done
if [[ "${#PG16_PACKAGES[@]}" -gt 0 ]]; then
  log "Désinstallation des paquets serveur et extensions PostgreSQL 16"
  apt-get purge -y "${PG16_PACKAGES[@]}"
fi

log "Installation de PostgreSQL 18"
apt-get install -y postgresql-18 postgresql-client-18

if ! pg_lsclusters --no-header | awk '$1 == 18 && $2 == "main" { found = 1 } END { exit !found }'; then
  pg_createcluster 18 main --port="${DB_PORT}"
fi

pg_conftool 18 main set port "${DB_PORT}"
pg_conftool 18 main set listen_addresses 127.0.0.1
systemctl enable --now postgresql@18-main
systemctl restart postgresql@18-main
pg_isready --host=/var/run/postgresql --port="${DB_PORT}" \
  || fail "PostgreSQL 18 ne répond pas sur le port ${DB_PORT}. Les services applicatifs restent arrêtés."

install -d -m 0700 /etc/translink
if [[ ! -s /etc/translink/db-password ]]; then
  openssl rand -hex 32 > /etc/translink/db-password
  chmod 0600 /etc/translink/db-password
fi
DB_PASSWORD="$(< /etc/translink/db-password)"

log "Création de l'utilisateur applicatif et de la base"
runuser -u postgres -- psql --host=/var/run/postgresql --port="${DB_PORT}" --set=ON_ERROR_STOP=1 <<SQL
SELECT format('CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD %L', '${DB_PASSWORD}')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') \gexec
ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}') \gexec
ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};
SQL

log "Restauration de la nouvelle archive avec pg_restore PostgreSQL 18"
runuser -u postgres -- "${PG_RESTORE}" \
  --host=/var/run/postgresql \
  --port="${DB_PORT}" \
  --username=postgres \
  --role="${DB_USER}" \
  --clean \
  --if-exists \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --dbname="${DB_NAME}" \
  "${DUMP_FILE}" \
  || fail "La restauration a échoué. Les services applicatifs restent arrêtés ; consultez le message pg_restore."

set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

log "Configuration des services pour PostgreSQL 18"
for service in auth-service annonce-service course-service; do
  env_file="${APP_DIR}/backend-microservices/${service}/.env"
  set_env_value "${env_file}" DB_USER "${DB_USER}"
  set_env_value "${env_file}" DB_PASSWORD "${DB_PASSWORD}"
  set_env_value "${env_file}" DB_NAME "${DB_NAME}"
  set_env_value "${env_file}" DB_HOST 127.0.0.1
  set_env_value "${env_file}" DB_PORT "${DB_PORT}"
  chown translink:translink "${env_file}"
  chmod 0600 "${env_file}"
done

log "Redémarrage des services applicatifs"
systemctl start \
  translink-auth-service.service \
  translink-annonce-service.service \
  translink-course-service.service \
  translink-api-gateway.service

log "Réinstallation terminée"
printf 'PostgreSQL 16 et ses clusters ont été supprimés ; PostgreSQL 18 écoute sur 127.0.0.1:%s.\n' "${DB_PORT}"
printf 'Base restaurée : %s\n' "${DB_NAME}"
printf 'Mot de passe sauvegardé dans /etc/translink/db-password\n'
printf 'Vérifier les services : systemctl --no-pager --full status translink-auth-service translink-annonce-service translink-course-service translink-api-gateway\n'
