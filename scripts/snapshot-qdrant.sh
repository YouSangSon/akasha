#!/usr/bin/env sh
set -eu

if [ -z "${BACKUP_DIR:-}" ]; then
  echo "BACKUP_DIR is required" >&2
  exit 1
fi

if [ -z "${QDRANT_URL:-}" ]; then
  echo "QDRANT_URL is required" >&2
  exit 1
fi

collection="${QDRANT_COLLECTION_NAME:-memory_chunks_v1}"
timestamp="$(date +%Y%m%d-%H%M%S)"
metadata_file="${BACKUP_DIR}/qdrant-${collection}-${timestamp}.json"

mkdir -p "${BACKUP_DIR}"

if [ -n "${QDRANT_API_KEY:-}" ]; then
  curl -fsS \
    -X POST \
    -H "api-key: ${QDRANT_API_KEY}" \
    "${QDRANT_URL}/collections/${collection}/snapshots" \
    > "${metadata_file}"
else
  curl -fsS \
    -X POST \
    "${QDRANT_URL}/collections/${collection}/snapshots" \
    > "${metadata_file}"
fi
