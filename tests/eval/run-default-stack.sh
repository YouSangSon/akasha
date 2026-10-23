#!/bin/sh
set -eu

container_cli=${CONTAINER_CLI:-docker}
eval_mode=${AKASHA_EVAL_MODE:-retrieval}
project_name="akasha-retrieval-eval-$$"
database_name="akasha_eval_$$"
collection_name="akasha_eval_$$"
postgres_port=${AKASHA_EVAL_POSTGRES_PORT:-55432}

if ! command -v "$container_cli" >/dev/null 2>&1; then
  echo "missing container CLI: $container_cli" >&2
  exit 1
fi

case "$eval_mode" in
  retrieval|client-ab) ;;
  *)
    echo "AKASHA_EVAL_MODE must be retrieval or client-ab" >&2
    exit 1
    ;;
esac

compose() {
  "$container_cli" compose -f compose.yaml -p "$project_name" "$@"
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

export POSTGRES_USER=memory
export POSTGRES_PASSWORD=memory
export POSTGRES_DB=memory_os
export POSTGRES_PORT="$postgres_port"
export QDRANT_API_KEY=local-qdrant-key
compose up -d postgres qdrant

attempt=0
until compose exec -T postgres pg_isready -U memory -d memory_os >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Postgres did not become ready within 60 seconds" >&2
    exit 1
  fi
  sleep 1
done

attempt=0
until curl --max-time 5 -fsS -H "api-key: local-qdrant-key" \
  http://127.0.0.1:6333/collections >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Qdrant did not become ready after 60 attempts" >&2
    exit 1
  fi
  sleep 1
done

compose exec -T postgres createdb -U memory "$database_name"

if [ "$eval_mode" = "retrieval" ]; then
  RUN_EVAL=1 \
  DATABASE_URL="postgres://memory:memory@127.0.0.1:${postgres_port}/${database_name}" \
  QDRANT_URL=http://127.0.0.1:6333 \
  QDRANT_API_KEY=local-qdrant-key \
  QDRANT_COLLECTION_NAME="$collection_name" \
  VECTOR_BACKEND=qdrant \
  EMBEDDING_PROVIDER=transformers \
  npx vitest run tests/eval/retrieval.eval.test.ts --reporter=verbose
  exit 0
fi

sha=$(git rev-parse HEAD)
result_dir=${AKASHA_CLIENT_AB_RESULT_DIR:-artifacts/client-ab}
if [ "${AKASHA_CLIENT_AB_EXECUTE_PAID:-0}" = "1" ]; then
  : "${AKASHA_ALLOW_PAID_CLIENT_EVAL:?set AKASHA_ALLOW_PAID_CLIENT_EVAL=1 for paid client A/B evaluation}"
  : "${AKASHA_CLIENT_AB_CLIENT:?set AKASHA_CLIENT_AB_CLIENT to codex or claude}"
  : "${AKASHA_CLIENT_AB_MODEL:?set AKASHA_CLIENT_AB_MODEL for paid client A/B evaluation}"
  npm run build
  DMO_CWD="$PWD" \
  DATABASE_URL="postgres://memory:memory@127.0.0.1:${postgres_port}/${database_name}" \
  QDRANT_URL=http://127.0.0.1:6333 \
  QDRANT_API_KEY=local-qdrant-key \
  QDRANT_COLLECTION_NAME="$collection_name" \
  VECTOR_BACKEND=qdrant \
  EMBEDDING_PROVIDER=transformers \
  ./node_modules/.bin/tsx tests/eval/client-ab-runner.ts --sha "$sha" --preflight --execute-paid --client "$AKASHA_CLIENT_AB_CLIENT" --model "$AKASHA_CLIENT_AB_MODEL" --result-dir "$result_dir"
  exit 0
fi

DMO_CWD="$PWD" \
DATABASE_URL="postgres://memory:memory@127.0.0.1:${postgres_port}/${database_name}" \
QDRANT_URL=http://127.0.0.1:6333 \
QDRANT_API_KEY=local-qdrant-key \
QDRANT_COLLECTION_NAME="$collection_name" \
VECTOR_BACKEND=qdrant \
EMBEDDING_PROVIDER=transformers \
./node_modules/.bin/tsx tests/eval/client-ab-runner.ts --sha "$sha" --preflight --result-dir "$result_dir"
