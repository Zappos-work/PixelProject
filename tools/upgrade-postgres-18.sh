#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

strip_env_value() {
  local value="$1"
  value="${value%$'\r'}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf "%s" "$value"
}

load_env_key() {
  local key="$1"
  local current="${!key-}"

  if [[ -n "$current" || ! -f "${PROJECT_DIR}/.env" ]]; then
    return
  fi

  local line
  line="$(grep -E "^[[:space:]]*${key}=" "${PROJECT_DIR}/.env" | tail -n 1 || true)"

  if [[ -z "$line" ]]; then
    return
  fi

  printf -v "$key" "%s" "$(strip_env_value "${line#*=}")"
}

load_env_key COMPOSE_PROJECT_NAME
load_env_key POSTGRES_DB
load_env_key POSTGRES_USER
load_env_key POSTGRES_PASSWORD

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pixelproject}"
POSTGRES_DB="${POSTGRES_DB:-pixelproject}"
POSTGRES_USER="${POSTGRES_USER:-pixelproject}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-pixelproject}"
OLD_VOLUME="${POSTGRES_16_VOLUME:-${PROJECT_NAME}_postgres_data}"
NEW_VOLUME="${POSTGRES_18_VOLUME:-${PROJECT_NAME}_postgres18_data}"
BACKUP_DIR="${POSTGRES_UPGRADE_BACKUP_DIR:-${PROJECT_DIR}/backups/postgres-major-upgrade}"
OLD_IMAGE="${POSTGRES_16_IMAGE:-postgres:16-alpine}"
NEW_IMAGE="${POSTGRES_18_IMAGE:-postgres:18-alpine}"
OLD_TEMP_CONTAINER=""
NEW_TEMP_CONTAINER=""

docker version >/dev/null

docker_compose() {
  docker compose --project-directory "$PROJECT_DIR" -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  if [[ -n "$OLD_TEMP_CONTAINER" ]]; then
    docker rm -f "$OLD_TEMP_CONTAINER" >/dev/null 2>&1 || true
  fi

  if [[ -n "$NEW_TEMP_CONTAINER" ]]; then
    docker rm -f "$NEW_TEMP_CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

volume_exists() {
  docker volume inspect "$1" >/dev/null 2>&1
}

volume_pg_version() {
  local volume="$1"
  local mount_path="$2"
  local version_path="$3"
  local image="$4"

  docker run --rm \
    -v "${volume}:${mount_path}" \
    --entrypoint sh \
    "$image" \
    -c "cat '${version_path}' 2>/dev/null || true"
}

wait_for_postgres() {
  local container="$1"

  for _ in $(seq 1 60); do
    if docker exec "$container" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      return 0
    fi

    sleep 1
  done

  docker logs "$container" >&2 || true
  echo "PostgreSQL did not become ready in container ${container}." >&2
  return 1
}

stop_app_services() {
  local services
  services="$(docker_compose config --services 2>/dev/null || true)"

  for service in caddy frontend backend; do
    if printf "%s\n" "$services" | grep -qx "$service"; then
      docker_compose stop "$service" >/dev/null 2>&1 || true
    fi
  done
}

target_version="$(volume_pg_version "$NEW_VOLUME" /var/lib/postgresql /var/lib/postgresql/18/docker/PG_VERSION "$NEW_IMAGE")"
if [[ "$target_version" == "18" ]]; then
  echo "PostgreSQL 18 volume ${NEW_VOLUME} is already initialized; skipping major upgrade."
  exit 0
fi

if ! volume_exists "$OLD_VOLUME"; then
  echo "Legacy PostgreSQL 16 volume ${OLD_VOLUME} does not exist; a fresh PostgreSQL 18 volume will be initialized by compose."
  exit 0
fi

old_version="$(volume_pg_version "$OLD_VOLUME" /var/lib/postgresql/data /var/lib/postgresql/data/PG_VERSION "$OLD_IMAGE")"
if [[ "$old_version" != "16" ]]; then
  echo "Legacy volume ${OLD_VOLUME} is not a PostgreSQL 16 data directory; a fresh PostgreSQL 18 volume will be initialized by compose."
  exit 0
fi

target_entries="$(docker run --rm \
  -v "${NEW_VOLUME}:/var/lib/postgresql" \
  --entrypoint sh \
  "$NEW_IMAGE" \
  -c "find /var/lib/postgresql -mindepth 1 -maxdepth 3 ! -path '/var/lib/postgresql/lost+found*' | head -n 1" \
  2>/dev/null || true)"
if [[ -n "$target_entries" ]]; then
  echo "Target PostgreSQL 18 volume ${NEW_VOLUME} is not empty but has no PG18 marker. Refusing to overwrite it." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="${BACKUP_DIR}/${POSTGRES_DB}_pg16_to_pg18_${timestamp}.sql"

echo "Preparing PostgreSQL 16 -> 18 upgrade."
echo "Old volume: ${OLD_VOLUME}"
echo "New volume: ${NEW_VOLUME}"
echo "Backup dump: ${dump_file}"

stop_app_services

old_container="$(docker ps \
  --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
  --filter "label=com.docker.compose.service=db" \
  --format "{{.ID}}" \
  | head -n 1)"
old_was_temp=false

if [[ -z "$old_container" ]]; then
  OLD_TEMP_CONTAINER="${PROJECT_NAME}-postgres16-upgrade"
  docker rm -f "$OLD_TEMP_CONTAINER" >/dev/null 2>&1 || true
  old_container="$OLD_TEMP_CONTAINER"
  old_was_temp=true

  docker run -d \
    --name "$OLD_TEMP_CONTAINER" \
    -e "POSTGRES_DB=${POSTGRES_DB}" \
    -e "POSTGRES_USER=${POSTGRES_USER}" \
    -e "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
    -v "${OLD_VOLUME}:/var/lib/postgresql/data" \
    "$OLD_IMAGE" >/dev/null
fi

wait_for_postgres "$old_container"
docker exec "$old_container" pg_dump --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$dump_file"

if [[ "$old_was_temp" == true ]]; then
  docker rm -f "$OLD_TEMP_CONTAINER" >/dev/null
  OLD_TEMP_CONTAINER=""
fi

NEW_TEMP_CONTAINER="${PROJECT_NAME}-postgres18-upgrade"
docker rm -f "$NEW_TEMP_CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$NEW_TEMP_CONTAINER" \
  -e "POSTGRES_DB=${POSTGRES_DB}" \
  -e "POSTGRES_USER=${POSTGRES_USER}" \
  -e "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
  -v "${NEW_VOLUME}:/var/lib/postgresql" \
  "$NEW_IMAGE" >/dev/null

wait_for_postgres "$NEW_TEMP_CONTAINER"
docker exec -i "$NEW_TEMP_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$dump_file"

server_version_num="$(docker exec "$NEW_TEMP_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SHOW server_version_num" | tr -d '[:space:]')"
if [[ "${server_version_num:0:2}" != "18" ]]; then
  echo "Restored database is not running PostgreSQL 18; server_version_num=${server_version_num}." >&2
  exit 1
fi

table_count="$(docker exec "$NEW_TEMP_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" | tr -d '[:space:]')"
if [[ "$table_count" == "0" ]]; then
  echo "Restore finished with zero public tables. Refusing to switch volumes." >&2
  exit 1
fi

if [[ "$old_was_temp" == false && -n "$old_container" ]]; then
  docker stop "$old_container" >/dev/null 2>&1 || true
fi

docker rm -f "$NEW_TEMP_CONTAINER" >/dev/null
NEW_TEMP_CONTAINER=""

gzip -f "$dump_file"
echo "PostgreSQL 18 upgrade completed. Compressed safety dump: ${dump_file}.gz"
