> **English** | [한국어](deployment.ko.md)

# Deployment

This document covers production deployment of Akasha. For local
development setup, see [README.md](../README.md). For ops procedures
(backup, restore, compaction), see [operations.md](operations.md).

## Topology

The smallest production deployment is one host running three containers:
Postgres, Qdrant, and the app. The bundled `compose.yaml` is exactly that.

```
┌─────────── host ────────────┐
│  reverse-proxy (nginx/caddy)│ ← TLS, optional
│            │                │
│   port 8787│                │
│            ▼                │
│         ┌─app─┐             │
│         │     │             │
│  ┌──────┼─────┼──────┐      │
│  │      │     │      │      │
│  ▼      ▼     ▼      ▼      │
│ pg    qdrant ⌷⌷⌷ disk       │
└─────────────────────────────┘
```

For multi-replica deploys, use external Postgres + Qdrant (managed or
self-hosted) and run multiple `app` instances behind a load balancer.

## Pre-deployment checklist

- [ ] **Strong secrets** — change `POSTGRES_PASSWORD`, `QDRANT_API_KEY`,
      `MEMORY_API_TOKENS` from the defaults. Use a password manager.
- [ ] **Bind / TLS** — `HOST=0.0.0.0` only behind a reverse proxy that
      terminates TLS. Direct internet exposure with `0.0.0.0` and no proxy
      is not supported.
- [ ] **Token-org binding** — production `MEMORY_API_TOKENS` should bind
      tokens to orgs (`token:org` syntax) to enforce multi-tenant isolation.
- [ ] **Rate limit** — set `RATE_LIMIT_PER_MINUTE` to a sane production
      value (e.g., 300). Unset = unlimited, not recommended.
- [ ] **Compaction sweeper** — enable on exactly one continuously-running
      replica: `COMPACTION_SWEEP_ENABLED=true`.
- [ ] **Backups** — schedule `npm run backup:create` (cron / systemd timer)
      and verify with `npm run restore:smoke` periodically.
- [ ] **Monitoring** — wire `/readyz` to your orchestrator's readiness probe
      and the pino logs (stderr) to your log aggregator. `/readyz` probes
      Postgres and Qdrant on every request; it also probes OpenAI when
      `EMBEDDING_PROVIDER=openai`. Returns 503 if any dependency is
      unreachable, so your orchestrator will drain traffic automatically.

## Single-host compose deployment

The bundled `compose.yaml` is production-grade for single-host deployments:

```bash
# 1. Clone
git clone https://github.com/YouSangSon/akasha.git
cd akasha

# 2. Production .env (don't reuse dev values!)
cp .env.example .env
${EDITOR:-vim} .env
#   - HOST=0.0.0.0  (or 127.0.0.1 if behind same-host reverse proxy)
#   - MEMORY_API_TOKENS with token:org bindings
#   - Strong POSTGRES_PASSWORD, QDRANT_API_KEY
#   - RATE_LIMIT_PER_MINUTE=300
#   - COMPACTION_SWEEP_ENABLED=true
#   - NODE_ENV=production

# 3. Build + run
docker compose up -d
docker compose exec app npm run db:migrate
docker compose logs -f app

# 4. Verify
curl http://localhost:8787/readyz | jq
```

## Behind a reverse proxy

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name memory.example.com;

  ssl_certificate     /etc/letsencrypt/live/memory.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/memory.example.com/privkey.pem;

  location / {
    proxy_pass         http://127.0.0.1:8787;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;

    # Health probes don't need rate limiting at proxy layer.
    # The MCP/HTTP API has its own per-token bucket.
  }
}
```

Set `HOST=127.0.0.1` in `.env` so the app only listens on loopback; the
proxy forwards external traffic.

### Caddy

```caddy
memory.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

Caddy handles TLS automatically.

## Migrating from existing data

If you're moving an existing memory store into Akasha:

1. **Format your records** as `add_memory` calls (CSV → script → API).
2. **Bulk insert** via the HTTP API or by direct Postgres COPY (followed by
   `reindex_memory` to populate Qdrant).
3. **Apply compaction in dry-run first** to see what would be archived;
   then `dryRun=false` once you're satisfied.

For database-level migrations (schema changes), all migrations are
idempotent and safe to run on populated databases. Just deploy the new
version and the bootstrap will apply pending migrations.

## Scaling notes

The app process is stateless except for the per-token rate limiter
(in-memory). Multiple replicas behind a round-robin load balancer work
fine; clients may see slightly looser rate limiting because each replica
has its own bucket.

**Sweeper coordination**: enable `COMPACTION_SWEEP_ENABLED=true` on **only
one** replica today. The sweeper uses `FOR UPDATE SKIP LOCKED` so it's
multi-replica-safe at the SQL level, but each replica also fires its own
setInterval — running multiple sweepers means more Qdrant calls per cycle
than necessary. A future release may add leader election; until then, pick
one replica.

**Postgres scaling**: read replicas are not yet supported (`searchMemory`
and `listMemory` always read from the primary). For high read volume,
scale vertically.

**Qdrant scaling**: Qdrant supports clustering. The current single-instance
client doesn't fan out to a cluster, but `QDRANT_URL` accepts any
Qdrant-compatible endpoint.

## Off-host backups

`BACKUP_TARGET_HOST` activates an rsync push to a remote host after the
local snapshot completes. Set up an SSH key with no passphrase scoped to
that host's `/var/lib/developer-memory-os/backups` directory:

```bash
BACKUP_DIR=/var/lib/developer-memory-os/backups
BACKUP_TARGET_HOST=backup@backup.example.com
```

The `npm run backup:create` script handles the rsync invocation. See
[docs/operations.md](operations.md) for the schedule + retention policy.

## Disaster recovery

**Note:** `/readyz` actively probes Postgres and Qdrant (plus OpenAI when
`EMBEDDING_PROVIDER=openai`) and returns 503 if any dependency is unreachable.
Once dependencies recover from a transient failure, the next request
bootstraps the canonical-services singleton again (no app restart needed).

If a host goes away entirely, restore from the latest backup:

1. Spin up new host with same compose stack.
2. Restore Postgres from `pg_dump` snapshot.
3. Restore Qdrant from snapshot.
4. Run `npm run restore:smoke` to validate.
5. Cut traffic to the new host.

See [docs/operations.md](operations.md) for the recovery runbook.
