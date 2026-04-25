#!/usr/bin/env bash
# context-forge — one-command setup.
#
# Brings up Postgres + Qdrant via docker compose, installs Node deps, runs
# migrations, builds the TypeScript output, and prints the MCP client
# config snippet. Idempotent: re-running it is safe (compose up reuses
# existing containers; migrations are CREATE … IF NOT EXISTS).
#
# Required: Docker, Node.js ≥ 20, npm.
# Required env: .env file with MEMORY_API_TOKENS set.
# Optional env: OPENAI_API_KEY (only when EMBEDDING_PROVIDER=openai). The
# default provider is "transformers" (free local ONNX), which needs no key.

set -euo pipefail

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

step() { printf '\n\033[1;34m▸\033[0m %s\n' "$1"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$1" >&2; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

# ─────────────────────────────────────────────────────────────────────
# 1. Pre-flight
# ─────────────────────────────────────────────────────────────────────

step "Checking prerequisites"

command -v docker >/dev/null 2>&1 \
  || fail "Docker not found. Install from https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 \
  || fail "Docker daemon not running. Start Docker Desktop or 'sudo systemctl start docker'."
ok "Docker is running"

command -v node >/dev/null 2>&1 \
  || fail "Node.js not found. Install Node.js ≥ 20 from https://nodejs.org/"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js ≥ 20 required (found $(node -v))"
fi
ok "Node.js $(node -v) is available"

# docker compose v2 (subcommand) vs legacy docker-compose
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  fail "Neither 'docker compose' nor 'docker-compose' available."
fi
ok "Compose: $COMPOSE"

# ─────────────────────────────────────────────────────────────────────
# 2. Env file
# ─────────────────────────────────────────────────────────────────────

step "Checking .env"

if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env did not exist; copied .env.example → .env"
  warn "EDIT .env now and set at minimum: MEMORY_API_TOKENS"
  warn "(OPENAI_API_KEY is only needed if you set EMBEDDING_PROVIDER=openai)"
  warn "Then re-run ./install.sh"
  exit 1
fi

# Sanity-check: when the user opted into openai, the placeholder must be replaced.
if grep -qE '^EMBEDDING_PROVIDER=openai' .env \
   && grep -qE '^OPENAI_API_KEY=sk-replace-me' .env; then
  fail "EMBEDDING_PROVIDER=openai requires a real OPENAI_API_KEY. Edit .env first."
fi
ok ".env looks set up"

# ─────────────────────────────────────────────────────────────────────
# 3. Bring up infra
# ─────────────────────────────────────────────────────────────────────

step "Starting Postgres + Qdrant"
$COMPOSE up -d postgres qdrant
ok "Compose services up"

# ─────────────────────────────────────────────────────────────────────
# 4. Node install + build + migrate
# ─────────────────────────────────────────────────────────────────────

step "Installing Node deps"
npm install
ok "Node modules installed"

step "Building TypeScript"
npm run build
ok "Build complete"

step "Running database migrations"
# migrate.ts uses DATABASE_URL or POSTGRES_* — reads from process.env.
# Pull the .env into the env explicitly for this step.
set -a
# shellcheck disable=SC1091
source .env
set +a
# When running migrate.ts from the host (not inside compose), the bundled
# default uses host "postgres" (compose-internal hostname). Prefer DATABASE_URL.
export DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB}}"
npm run db:migrate
ok "Migrations applied"

# ─────────────────────────────────────────────────────────────────────
# 5. Print MCP client config
# ─────────────────────────────────────────────────────────────────────

step "Done — point your MCP client at this server"

cat <<JSON
Add the following to your Claude Desktop config
(typical paths: ~/Library/Application Support/Claude/claude_desktop_config.json on macOS,
                %APPDATA%\\Claude\\claude_desktop_config.json on Windows):

{
  "mcpServers": {
    "context-forge": {
      "command": "node",
      "args": ["${REPO_DIR}/dist/src/cli.js"]
    }
  }
}

For Codex CLI or other MCP clients, point them at:
  ${REPO_DIR}/dist/src/cli.js

HTTP API also available at: http://${HOST:-127.0.0.1}:${PORT:-8787}
  (run 'npm run start:server' to start it; 'npm run dev:server' for watch mode)
JSON
