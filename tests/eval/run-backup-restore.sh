#!/bin/sh
set -eu

container_cli=docker
source_project="akasha-backup-restore-$$"
restore_project="akasha-restore-$$"
database_name="akasha_backup_restore_$$"
collection_name="akasha_backup_restore_$$"
organization_id="akasha-backup-restore"
project_key="backup-restore"
proof_text="Disposable Qdrant backup restore proof."
source_postgres_port=${AKASHA_BACKUP_SOURCE_POSTGRES_PORT:-55433}
source_qdrant_port=6333
restore_postgres_port=${RESTORE_POSTGRES_PORT:-15432}
restore_qdrant_port=${RESTORE_QDRANT_PORT:-16333}
restore_app_port=${RESTORE_APP_PORT:-18787}
backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/akasha-backup-restore.XXXXXX")"
wrapper_dir="$backup_dir/bin"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

assert_port_free() {
  if lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "refusing to use occupied localhost port: $1" >&2
    exit 1
  fi
}

assert_valid_port() {
  case "$1" in
    ""|*[!0-9]*|??????*)
      echo "invalid localhost port: $1" >&2
      exit 1
      ;;
  esac
  if [ "$1" -lt 1 ] || [ "$1" -gt 65535 ]; then
    echo "invalid localhost port: $1" >&2
    exit 1
  fi
}

assert_owned_name() {
  case "$1" in
    "$2"[0-9]*) ;;
    *)
      echo "invalid owned resource name: $1" >&2
      exit 1
      ;;
  esac
}

assert_owned_backup_dir() {
  case "$1" in
    */akasha-backup-restore.*) ;;
    *)
      echo "invalid owned backup directory: $1" >&2
      exit 1
      ;;
  esac
}

source_compose() {
  "$container_cli" compose -f compose.yaml -p "$source_project" "$@"
}

restore_compose() {
  "$container_cli" compose -f compose.yaml -f compose.restore-smoke.yaml -p "$restore_project" "$@"
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  restore_compose down -v --remove-orphans >/dev/null 2>&1 || true
  source_compose down -v --remove-orphans >/dev/null 2>&1 || true
  case "$backup_dir" in
    */akasha-backup-restore.*) rm -rf -- "$backup_dir" ;;
    *) echo "refusing to remove unexpected backup directory: $backup_dir" >&2 ;;
  esac
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' HUP INT TERM

for command in "$container_cli" curl lsof; do
  require_command "$command"
done

assert_owned_name "$source_project" "akasha-backup-restore-"
assert_owned_name "$restore_project" "akasha-restore-"
assert_owned_name "$database_name" "akasha_backup_restore_"
assert_owned_backup_dir "$backup_dir"

seen_ports=" "
for port in \
  "$source_postgres_port" \
  "$source_qdrant_port" \
  "$restore_postgres_port" \
  "$restore_qdrant_port" \
  "$restore_app_port"; do
  assert_valid_port "$port"
  case "$seen_ports" in
    *" $port "*)
      echo "refusing duplicate localhost port: $port" >&2
      exit 1
      ;;
  esac
  seen_ports="${seen_ports}${port} "
  assert_port_free "$port"
done

# These are isolated, short-lived credentials. Export them before either
# compose project starts so neither project can inherit operator credentials.
unset BACKUP_TARGET_HOST BACKUP_TARGET_DIR
unset BACKUP_ENCRYPTION_KEY_FILE BACKUP_ENCRYPTION_KEEP_PLAINTEXT
unset OPENAI_API_KEY OPENAI_EMBEDDING_MODEL
export POSTGRES_USER=memory
export POSTGRES_PASSWORD=memory
export POSTGRES_DB=memory_os
export POSTGRES_PORT="$source_postgres_port"
export QDRANT_API_KEY=local-qdrant-key
export QDRANT_COLLECTION_NAME="$collection_name"
export QDRANT_URL="http://127.0.0.1:${source_qdrant_port}"
export DATABASE_URL="postgres://memory:memory@127.0.0.1:${source_postgres_port}/${database_name}"
export VECTOR_BACKEND=qdrant
export EMBEDDING_PROVIDER=transformers
export EMBEDDING_MODEL=local-deterministic-v1
export EMBEDDING_DIMENSIONS=384
export TRANSFORMERS_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
export BACKUP_DIR="$backup_dir"
export AKASHA_BACKUP_ORGANIZATION_ID="$organization_id"
export AKASHA_BACKUP_PROJECT_KEY="$project_key"
export AKASHA_BACKUP_PROOF_TEXT="$proof_text"
export AKASHA_BACKUP_CONTAINER_CLI="$container_cli"
export AKASHA_BACKUP_SOURCE_PROJECT="$source_project"
export AKASHA_BACKUP_SOURCE_DATABASE="$database_name"
export AKASHA_BACKUP_RESTORE_PROJECT="$restore_project"
export MEMORY_API_TOKENS="local-restore-token:$organization_id"
export RESTORE_SMOKE_API_TOKEN=local-restore-token
export RESTORE_SMOKE_EXPECTED_CONTENT="$proof_text"
export LEGACY_ANONYMOUS_SEARCH=false
export PORT="$restore_app_port"

mkdir -p "$wrapper_dir"
printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'exec "$AKASHA_BACKUP_CONTAINER_CLI" compose -f compose.yaml -p "$AKASHA_BACKUP_SOURCE_PROJECT" exec -T postgres pg_dump -U memory "$AKASHA_BACKUP_SOURCE_DATABASE"' \
  > "$wrapper_dir/pg_dump"
printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'exec "$AKASHA_BACKUP_CONTAINER_CLI" compose -f compose.yaml -f compose.restore-smoke.yaml -p "$AKASHA_BACKUP_RESTORE_PROJECT" exec -T postgres psql -X -v ON_ERROR_STOP=1 -U memory -d memory_os' \
  > "$wrapper_dir/psql"
chmod 700 "$wrapper_dir/pg_dump" "$wrapper_dir/psql"
PATH="$wrapper_dir:$PATH"
export PATH

cat > "$wrapper_dir/verify-qdrant.mjs" <<'VERIFY_QDRANT'
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = JSON.parse(await readFile(`${process.env.BACKUP_DIR}/source-points.json`, "utf8")).result.points;
assert.equal(source.length, 1, "the disposable source must contain its one seeded point");
assert.equal(source[0].payload.organization_id, process.env.AKASHA_BACKUP_ORGANIZATION_ID);
const response = await fetch(`${process.env.RESTORE_QDRANT_URL}/collections/${process.env.RESTORE_SMOKE_QDRANT_COLLECTION_NAME}/points/scroll`, {
  method: "POST", headers: { "api-key": process.env.QDRANT_API_KEY, "content-type": "application/json" },
  body: JSON.stringify({ limit: 2, with_payload: true, with_vector: true }), signal: AbortSignal.timeout(30000),
});
assert.equal(response.ok, true, "restored Qdrant scroll must succeed");
assert.deepEqual((await response.json()).result.points, source, "restored point ID, payload, and vector must match the source");
console.log("Qdrant restore proof: one source point recovered with identical ID, payload, and vector");
VERIFY_QDRANT

npm run build
source_compose up -d postgres qdrant

attempt=0
until source_compose exec -T postgres pg_isready -U memory -d memory_os >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "source Postgres did not become ready within 60 seconds" >&2
    exit 1
  fi
  sleep 1
done

attempt=0
until curl -fsS -H "api-key: $QDRANT_API_KEY" "$QDRANT_URL/collections" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "source Qdrant did not become ready within 60 seconds" >&2
    exit 1
  fi
  sleep 1
done

source_compose exec -T postgres createdb -U memory "$database_name"
npm run db:migrate
./node_modules/.bin/tsx -e '
  import { bootstrapCanonicalServices } from "./src/mcp/canonical-services.ts";
  import { createToolRegistry } from "./src/mcp/server.ts";
  async function seedBackupProof() {
    const registry = createToolRegistry({
      cwd: process.cwd(),
      resolveCanonicalServices: bootstrapCanonicalServices,
    });
    await registry.add_memory({
      organizationId: process.env.AKASHA_BACKUP_ORGANIZATION_ID,
      projectKey: process.env.AKASHA_BACKUP_PROJECT_KEY,
      kind: "decision",
      content: process.env.AKASHA_BACKUP_PROOF_TEXT,
    });
  }
  seedBackupProof().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
'

curl --max-time 30 -fsS -H "api-key: $QDRANT_API_KEY" -H "content-type: application/json" \
  -d '{"limit":2,"with_payload":true,"with_vector":true}' \
  "$QDRANT_URL/collections/$collection_name/points/scroll" > "$backup_dir/source-points.json"
npm run backup:create:qdrant

# compose.restore-smoke.yaml adds its host ports to compose.yaml rather than
# replacing them. Stop only our source project before the restore project binds
# the base Qdrant port, then align the duplicate Postgres mapping.
source_compose down -v --remove-orphans

export RESTORE_SMOKE_PROJECT="$restore_project"
export RESTORE_POSTGRES_PORT="$restore_postgres_port"
export RESTORE_QDRANT_PORT="$restore_qdrant_port"
export RESTORE_APP_PORT="$restore_app_port"
export POSTGRES_PORT="$restore_postgres_port"
export RESTORE_POSTGRES_URL="postgres://memory:memory@127.0.0.1:${restore_postgres_port}/memory_os"
export RESTORE_QDRANT_URL="http://127.0.0.1:${restore_qdrant_port}"
export RESTORE_SMOKE_PROJECT_KEY="$project_key"
export RESTORE_SMOKE_ORGANIZATION_ID="$organization_id"
export RESTORE_SMOKE_SEARCH_QUERY="$proof_text"
export RESTORE_SMOKE_PACK_TASK="What decision was stored for the disposable backup recovery drill?"
export RESTORE_SMOKE_POSTGRES_RESTORE_CMD='gunzip -c "$RESTORE_SMOKE_POSTGRES_ARTIFACT_PATH" > "$BACKUP_DIR/restore.sql" && "$BACKUP_DIR/bin/psql" < "$BACKUP_DIR/restore.sql"'
export RESTORE_SMOKE_QDRANT_RESTORE_CMD='curl -fsS -H "api-key: $QDRANT_API_KEY" -X POST "$RESTORE_QDRANT_URL/collections/$RESTORE_SMOKE_QDRANT_COLLECTION_NAME/snapshots/upload?priority=snapshot" -F "snapshot=@$RESTORE_SMOKE_QDRANT_ARTIFACT_PATH" && node "$BACKUP_DIR/bin/verify-qdrant.mjs"'

npm run restore:smoke
