#!/usr/bin/env sh
set -eu

timestamp="${BACKUP_TIMESTAMP:-$(date -u +%Y%m%d-%H%M)}"
vector_backend="${VECTOR_BACKEND:-qdrant}"

case "${vector_backend}" in
  qdrant|pgvector)
    ;;
  *)
    echo "Unsupported VECTOR_BACKEND for backup: ${vector_backend} (expected qdrant or pgvector)" >&2
    exit 1
    ;;
esac

BACKUP_TIMESTAMP="${timestamp}" ./scripts/backup-postgres.sh

if [ "${vector_backend}" = "qdrant" ]; then
  BACKUP_TIMESTAMP="${timestamp}" ./scripts/snapshot-qdrant.sh
fi

if [ -z "${BACKUP_DIR:-}" ]; then
  echo "BACKUP_DIR is required" >&2
  exit 1
fi

manifest="${BACKUP_DIR}/manifest-${timestamp}.json"

MANIFEST_PATH="${manifest}" \
VECTOR_BACKEND="${vector_backend}" \
node <<'NODE'
const fs = require("node:fs");

const manifestPath = process.env.MANIFEST_PATH;
const vectorBackend = process.env.VECTOR_BACKEND;
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};

manifest.vectorBackend = vectorBackend;

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

if [ -n "${BACKUP_TARGET_HOST:-}" ]; then
  remote_dir="${BACKUP_TARGET_DIR:-${BACKUP_DIR}}"
  scp "${manifest}" "${BACKUP_TARGET_HOST}:${remote_dir}/"
fi
