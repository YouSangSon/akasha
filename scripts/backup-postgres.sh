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

artifact="${BACKUP_DIR}/postgres-${timestamp}.sql.gz"
checksum="${artifact}.sha256"
manifest="${BACKUP_DIR}/manifest-${timestamp}.json"
remote_dir="${BACKUP_TARGET_DIR:-${BACKUP_DIR}}"

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
  ssh "${BACKUP_TARGET_HOST}" "mkdir -p \"${remote_dir}\""
  scp "${artifact}" "${checksum}" "${manifest}" \
    "${BACKUP_TARGET_HOST}:${remote_dir}/"
fi
