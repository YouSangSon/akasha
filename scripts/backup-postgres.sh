#!/usr/bin/env sh
set -eu

timestamp="${BACKUP_TIMESTAMP:-$(date -u +%Y%m%d-%H%M)}"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ -z "${BACKUP_DIR:-}" ]; then
  echo "BACKUP_DIR is required" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [ "${BACKUP_ENCRYPTION_KEY_FILE+x}" = "x" ]; then
  if [ -z "$(printf '%s' "${BACKUP_ENCRYPTION_KEY_FILE}" | tr -d '[:space:]')" ]; then
    echo "BACKUP_ENCRYPTION_KEY_FILE must contain non-whitespace text" >&2
    exit 1
  fi
fi

artifact="${BACKUP_DIR}/postgres-${timestamp}.sql.gz"
checksum="${artifact}.sha256"
manifest="${BACKUP_DIR}/manifest-${timestamp}.json"

mkdir -p "${BACKUP_DIR}"
pg_dump "${DATABASE_URL}" | gzip > "${artifact}"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${artifact}" > "${checksum}"
else
  shasum -a 256 "${artifact}" > "${checksum}"
fi

postgres_sha="$(awk '{print $1}' "${checksum}")"

MANIFEST_PATH="${manifest}" \
BACKUP_CREATED_AT="${created_at}" \
POSTGRES_FILE_NAME="$(basename "${artifact}")" \
POSTGRES_SHA256="${postgres_sha}" \
node <<'NODE'
const fs = require("node:fs");

const manifestPath = process.env.MANIFEST_PATH;
const createdAt = process.env.BACKUP_CREATED_AT;
const postgresFileName = process.env.POSTGRES_FILE_NAME;
const postgresSha256 = process.env.POSTGRES_SHA256;

const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};

manifest.createdAt ??= createdAt;
manifest.postgres = {
  fileName: postgresFileName,
  sha256: postgresSha256,
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

if [ -n "${BACKUP_TARGET_HOST:-}" ] && [ -z "${BACKUP_ENCRYPTION_KEY_FILE:-}" ]; then
  if [ "${BACKUP_TARGET_DIR+x}" = "x" ]; then
    if [ -z "$(printf '%s' "${BACKUP_TARGET_DIR}" | tr -d '[:space:]')" ]; then
      echo "BACKUP_TARGET_DIR must contain non-whitespace text" >&2
      exit 1
    fi
    remote_dir="${BACKUP_TARGET_DIR}"
  else
    remote_dir="${BACKUP_DIR}"
  fi
  ssh "${BACKUP_TARGET_HOST}" "mkdir -p \"${remote_dir}\""
  scp "${artifact}" "${checksum}" "${manifest}" \
    "${BACKUP_TARGET_HOST}:${remote_dir}/"
fi
