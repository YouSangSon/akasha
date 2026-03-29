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

extract_snapshot_name() {
  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(input);
      const name = parsed?.result?.name ?? parsed?.name;
      if (!name) {
        process.stderr.write("Snapshot name missing in Qdrant response\n");
        process.exit(1);
      }
      process.stdout.write(String(name));
    });
  '
}

if [ -n "${QDRANT_API_KEY:-}" ]; then
  snapshot_response="$(curl -fsS \
    -X POST \
    -H "api-key: ${QDRANT_API_KEY}" \
    "${QDRANT_URL}/collections/${collection}/snapshots")"
else
  snapshot_response="$(curl -fsS \
    -X POST \
    "${QDRANT_URL}/collections/${collection}/snapshots")"
fi

printf '%s\n' "${snapshot_response}" > "${metadata_file}"
snapshot_name="$(printf '%s' "${snapshot_response}" | extract_snapshot_name)"
snapshot_file="${BACKUP_DIR}/${snapshot_name}"

if [ -n "${QDRANT_API_KEY:-}" ]; then
  curl -fsS \
    -H "api-key: ${QDRANT_API_KEY}" \
    "${QDRANT_URL}/collections/${collection}/snapshots/${snapshot_name}" \
    --output "${snapshot_file}"
else
  curl -fsS \
    "${QDRANT_URL}/collections/${collection}/snapshots/${snapshot_name}" \
    --output "${snapshot_file}"
fi
