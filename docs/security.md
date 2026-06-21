> **English** | [한국어](security.ko.md)

# Security model

This document summarizes the threat surface context-forge addresses, the
controls in place today, and the residual risks. For the vulnerability
reporting policy (where to send security reports), see
[../SECURITY.md](../SECURITY.md).

## Threat surface

| Surface | What's at risk |
|---------|----------------|
| HTTP API (`/v1/*`) | Unauthorized read/write of memory; cross-tenant access; destructive `compact_memory` apply |
| MCP stdio | Local-only (parent process invokes the binary); inherits parent's identity |
| Postgres | Direct DB access bypasses all app-layer controls; back up + restrict |
| Qdrant | Vector access bypasses scope/auth filters; backup separately, network-isolate |
| OpenAI calls | Content sent for embedding leaves your network; `EMBEDDING_PROVIDER=local` keeps it on-box |

## Controls

### Authentication

Bearer tokens via `MEMORY_API_TOKENS` (comma-separated, optional `:org`
binding). `timingSafeEqual` constant-time compare avoids timing leaks.
Multi-token rotation supported (deploy with old + new, rotate clients,
drop old).

`/healthz` and `/readyz` are unauthenticated by design — orchestrators
need to probe without holding credentials.

### Multi-tenant isolation

Every record-bearing table carries `organization_id`. SQL queries enforce
`WHERE organization_id = $org` in reads and writes. Token-org binding is
verified at the route layer (`src/app/routes/memory.ts`) — body /
`x-organization-id` header that disagrees with the bound org returns 403
before the handler runs.

The compaction apply path reads `organization_id` from the canonical
record itself (RETURNING from DELETE) when writing to `memory_archive`,
not from the caller token — defense-in-depth.

### Fail-closed startup gate

`startOperatorServer` refuses to bind to a non-loopback host
(`HOST=0.0.0.0`, `HOST=10.x.x.x`, etc.) when `MEMORY_API_TOKENS` is
empty. Loopback dev with empty tokens is permitted; accidental
zero-auth public exposure is not.

### HTTP body validation

`/v1/memory/compact` rejects `dryRun: "false"` (string), `dryRun: 0`,
and any other non-strict-boolean value. Only `true` / `false` /
omitted (defaults to `true`) reach the handler. Prevents accidental
type-coerced destructive runs.

### Secret scrubbing

Before a memory hits Postgres or Qdrant, `assertNoSecrets(content)` in
`src/store/secret-scrub.ts` scans for and rejects:

- OpenAI / Anthropic API key patterns (`sk-…`, `sk-ant-…`)
- AWS access key patterns (`AKIA…`)
- GitHub token patterns (`ghp_…`, `ghs_…`, etc.)
- GCP API key patterns (`AIza…`)
- Stripe secret key patterns (`sk_live_…`, `sk_test_…`)
- Slack token patterns (`xoxb-…`, `xoxp-…`, etc.)
- Database connection strings with embedded credentials (`://user:pass@host`)
- PEM blocks (private keys, certificates)
- Bearer-token-shaped strings (`Authorization: Bearer …`)
- JWT-shaped strings (header.body.sig)

A hit raises `SecretDetectedError` (HTTP 400) with category names but no
values. Existing records that predate scrubbing aren't re-scrubbed —
flag for an explicit cleanup pass if you suspect contamination.

### Rate limiting

Global per-token bucket via `RATE_LIMIT_PER_MINUTE` (token-bucket).
Apply path additionally limited to 1 per hour per organization (default,
configurable in `applyCompaction` deps).

### Audit log

Every tool invocation writes to `audit_log` (org, actor, tool, outcome,
duration, request id). Destructive operations attach structured `metadata`
JSONB (run id, archived ids, etc.). Read access scoped by org binding.

### Cascade-delete indexes

`relationships(from_memory_record_id)`, `relationships(to_memory_record_id)`,
and `ingest_jobs(memory_record_id)` are indexed. Without these, an apply
run deleting hundreds of `memory_records` would do sequential scans on
each child table — both a performance issue and a contention risk.

### TOCTOU guard on apply

The compact-apply CTE deletes only when `updated_at <= planGeneratedAt`.
If a record was modified after the dry-run plan was computed, the DELETE
returns 0 rows and the orchestrator counts it as `skipped` — preventing
silent data loss for records modified mid-flight.

## Residual risks

These are known limitations / risks the project does **not** currently
mitigate:

- **No HTTPS termination.** The HTTP server speaks plaintext. Pair with
  a reverse proxy that terminates TLS for any non-loopback bind. See
  [deployment.md](deployment.md).
- **No CSRF protection on the HTTP API.** The API is bearer-token-only;
  cookies aren't used. If you build a browser client that stores tokens,
  the browser environment becomes the attack surface (XSS = token theft).
  Use short-lived tokens + rotation.
- **Embedding provider sees content.** With `EMBEDDING_PROVIDER=openai`,
  every record's content is sent to OpenAI for embedding. If your
  compliance posture forbids that, switch to `local` and accept the
  quality trade-off.
- **Token storage at rest** is application-side (env vars, .env files).
  No KMS integration today.
- **Postgres backups contain plaintext content.** Encrypt at rest at
  the disk / volume level if your data classification requires it.
- **Qdrant payloads contain `organization_id`** — anyone with direct
  Qdrant access can read across orgs. Restrict Qdrant network access
  to the app process.

## Where the boundaries are

context-forge is **not** a substitute for OS-level / network-level
controls. It assumes:

1. The host is trusted (no malicious processes).
2. The Postgres / Qdrant containers are network-isolated to the app
   process.
3. Backups are stored with appropriate access controls.
4. TLS is provided by an upstream proxy when serving non-loopback.

Within those assumptions, the application layer enforces multi-tenant
isolation, audit, authentication, and content-level secret hygiene.
