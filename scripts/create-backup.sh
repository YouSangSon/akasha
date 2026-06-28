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

if [ "${BACKUP_ENCRYPTION_KEY_FILE+x}" = "x" ]; then
  if [ -z "$(printf '%s' "${BACKUP_ENCRYPTION_KEY_FILE}" | tr -d '[:space:]')" ]; then
    echo "BACKUP_ENCRYPTION_KEY_FILE must contain non-whitespace text" >&2
    exit 1
  fi
fi

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

run_backup_encryption() {
  if [ -f "./dist/scripts/backup-encryption.js" ]; then
    node ./dist/scripts/backup-encryption.js "$@"
  elif [ -x "./node_modules/.bin/tsx" ]; then
    ./node_modules/.bin/tsx ./scripts/backup-encryption.ts "$@"
  else
    echo "backup encryption requires built dist/scripts/backup-encryption.js or local tsx" >&2
    exit 1
  fi
}

if [ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ]; then
  BACKUP_MANIFEST_PATH="${manifest}" run_backup_encryption encrypt-manifest
fi

if [ -n "${BACKUP_TARGET_HOST:-}" ]; then
  if [ "${BACKUP_TARGET_DIR+x}" = "x" ]; then
    if [ -z "$(printf '%s' "${BACKUP_TARGET_DIR}" | tr -d '[:space:]')" ]; then
      echo "BACKUP_TARGET_DIR must contain non-whitespace text" >&2
      exit 1
    fi
    remote_dir="${BACKUP_TARGET_DIR}"
  else
    remote_dir="${BACKUP_DIR}"
  fi
  if [ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ]; then
    ssh "${BACKUP_TARGET_HOST}" "mkdir -p \"${remote_dir}\""
    files_to_copy="$(MANIFEST_PATH="${manifest}" BACKUP_DIR="${BACKUP_DIR}" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"));
const files = [path.join(process.env.BACKUP_DIR, path.basename(process.env.MANIFEST_PATH))];
files.push(path.join(process.env.BACKUP_DIR, manifest.postgres.fileName));
if (manifest.qdrant?.fileName) files.push(path.join(process.env.BACKUP_DIR, manifest.qdrant.fileName));
if (manifest.qdrant?.metadataFileName) files.push(path.join(process.env.BACKUP_DIR, manifest.qdrant.metadataFileName));
process.stdout.write(files.join("\n"));
NODE
)"
    # shellcheck disable=SC2086
    scp ${files_to_copy} "${BACKUP_TARGET_HOST}:${remote_dir}/"
  else
    scp "${manifest}" "${BACKUP_TARGET_HOST}:${remote_dir}/"
  fi
fi
