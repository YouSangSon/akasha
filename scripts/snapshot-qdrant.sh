#!/usr/bin/env sh
set -eu

timestamp="${BACKUP_TIMESTAMP:-$(date -u +%Y%m%d-%H%M)}"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ -z "$(printf '%s' "${BACKUP_DIR:-}" | tr -d '[:space:]')" ]; then
  echo "BACKUP_DIR is required" >&2
  exit 1
fi

if [ -z "$(printf '%s' "${QDRANT_URL:-}" | tr -d '[:space:]')" ]; then
  echo "QDRANT_URL is required" >&2
  exit 1
fi

if [ "${BACKUP_ENCRYPTION_KEY_FILE+x}" = "x" ]; then
  if [ -z "$(printf '%s' "${BACKUP_ENCRYPTION_KEY_FILE}" | tr -d '[:space:]')" ]; then
    echo "BACKUP_ENCRYPTION_KEY_FILE must contain non-whitespace text" >&2
    exit 1
  fi
fi

if [ "${QDRANT_COLLECTION_NAME+x}" = "x" ]; then
  if [ -z "$(printf '%s' "${QDRANT_COLLECTION_NAME}" | tr -d '[:space:]')" ]; then
    echo "QDRANT_COLLECTION_NAME must contain non-whitespace text" >&2
    exit 1
  fi
  collection="${QDRANT_COLLECTION_NAME}"
else
  collection="memory_chunks_v1"
fi
metadata_file="${BACKUP_DIR}/qdrant-${collection}-${timestamp}.json"
artifact_file="${BACKUP_DIR}/qdrant-${timestamp}.snapshot"
checksum_file="${artifact_file}.sha256"
manifest_file="${BACKUP_DIR}/manifest-${timestamp}.json"

mkdir -p "${BACKUP_DIR}"

extract_snapshot_name() {
  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(input);
      const name = parsed?.result?.name ?? parsed?.name;
      if (typeof name !== "string" || name.trim() === "") {
        process.stderr.write("Snapshot name missing in Qdrant response\n");
        process.exit(1);
      }
      process.stdout.write(name);
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

if [ -n "${QDRANT_API_KEY:-}" ]; then
  curl -fsS \
    -H "api-key: ${QDRANT_API_KEY}" \
    "${QDRANT_URL}/collections/${collection}/snapshots/${snapshot_name}" \
    --output "${artifact_file}"
else
  curl -fsS \
    "${QDRANT_URL}/collections/${collection}/snapshots/${snapshot_name}" \
    --output "${artifact_file}"
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${artifact_file}" > "${checksum_file}"
else
  shasum -a 256 "${artifact_file}" > "${checksum_file}"
fi

snapshot_sha="$(awk '{print $1}' "${checksum_file}")"

MANIFEST_PATH="${manifest_file}" \
BACKUP_CREATED_AT="${created_at}" \
QDRANT_FILE_NAME="$(basename "${artifact_file}")" \
QDRANT_SHA256="${snapshot_sha}" \
QDRANT_METADATA_FILE_NAME="$(basename "${metadata_file}")" \
QDRANT_COLLECTION="${collection}" \
node <<'NODE'
const fs = require("node:fs");

const manifestPath = process.env.MANIFEST_PATH;
const createdAt = process.env.BACKUP_CREATED_AT;
const qdrantFileName = process.env.QDRANT_FILE_NAME;
const qdrantSha256 = process.env.QDRANT_SHA256;
const metadataFileName = process.env.QDRANT_METADATA_FILE_NAME;
const collectionName = process.env.QDRANT_COLLECTION;

const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};
if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
  throw new Error("backup manifest must be a JSON object");
}

manifest.createdAt ??= createdAt;
manifest.qdrant = {
  fileName: qdrantFileName,
  sha256: qdrantSha256,
  metadataFileName,
  collectionName,
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
  scp "${artifact_file}" "${checksum_file}" "${metadata_file}" "${manifest_file}" \
    "${BACKUP_TARGET_HOST}:${remote_dir}/"
fi
