#!/usr/bin/env sh
set -eu

if [ -z "${BACKUP_DIR:-}" ]; then
  echo "BACKUP_DIR is required" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
artifact="${BACKUP_DIR}/postgres-${timestamp}.sql.gz"
checksum="${artifact}.sha256"

mkdir -p "${BACKUP_DIR}"
pg_dump "${DATABASE_URL}" | gzip > "${artifact}"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${artifact}" > "${checksum}"
else
  shasum -a 256 "${artifact}" > "${checksum}"
fi
