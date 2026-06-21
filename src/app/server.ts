import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { resolveServiceConfig, type ServiceConfig } from "../config.js";
import { createPgPool, type PgPool } from "../db/connection.js";
import { rootLogger, type Logger } from "../logger.js";
import { createToolRegistry } from "../mcp/server.js";
import type { ToolRegistry } from "../mcp/types.js";
import {
  buildOpenAiProbe,
  buildPostgresProbe,
  buildQdrantProbe,
  checkDependencies,
  type DependencyProbes,
} from "../health/check-dependencies.js";
import {
  loadBearerTokens,
  matchBearerFromRequest,
  type BearerToken,
} from "./middleware/bearer-auth.js";
import { sendError, sendOk } from "./middleware/envelope.js";
import {
  createTokenBucketLimiter,
  loadRateLimitFromEnv,
  type RateLimiter,
} from "./middleware/rate-limit.js";
import { createMemoryRoutes, type Route } from "./routes/memory.js";
import { bootstrapCanonicalServices } from "../mcp/canonical-services.js";
import {
  loadSweeperEnabled,
  loadSweeperIntervalMs,
  startBackgroundSweeper,
  type BackgroundSweeperHandle,
} from "../compact/sweeper-loop.js";

export type CreateOperatorServerOptions = {
  config?: ServiceConfig;
  registry?: ToolRegistry;
  logger?: Logger;
  // Override env-derived tokens. Pass [] to explicitly disable auth in tests.
  // Accepts either raw token strings (legacy: no org binding) or full
  // BearerToken objects with optional org binding.
  bearerTokens?: readonly (string | BearerToken)[];
  // Dependency probes for /readyz. When provided, /readyz checks each probe
  // and returns 200 if all pass, 503 otherwise. Tests inject mocked probes.
  dependencyProbes?: DependencyProbes;
  // When provided, every non-health request is rate-limited per-token. Tests
  // inject a precomputed limiter; production reads RATE_LIMIT_PER_MINUTE.
  rateLimiter?: RateLimiter;
};

function normalizeTokens(
  tokens: readonly (string | BearerToken)[],
): BearerToken[] {
  return tokens.map((t) => (typeof t === "string" ? { token: t } : t));
}

// Loopback hosts are safe to expose without auth — only processes on the
// same machine can reach them. Anything else (0.0.0.0, public IP, hostname)
// must require bearer tokens, otherwise an unauthenticated remote can
// trigger destructive operations once compaction-apply ships in P17.
export function isLoopbackHost(host: string): boolean {
  if (host === "127.0.0.1") return true;
  if (host === "localhost") return true;
  if (host === "::1") return true;
  if (host.startsWith("::ffff:127.")) return true;
  return false;
}

// Fail-closed startup gate. When auth is disabled (no MEMORY_API_TOKENS) AND
// the bind host is reachable from off-box, refuse to start. Local dev keeps
// working because `127.0.0.1` / `localhost` / `::1` are loopback. Tests that
// drive `createOperatorServer` directly bypass this check (intentional —
// they bind to ephemeral loopback ports via server.listen).
export function assertSafeAuthConfig(args: {
  tokenCount: number;
  host: string;
}): void {
  if (args.tokenCount > 0) return;
  if (isLoopbackHost(args.host)) return;
  throw new Error(
    `MEMORY_API_TOKENS must be set when binding to a non-loopback host ` +
      `(got host=${args.host}). Set MEMORY_API_TOKENS=<comma-separated> or ` +
      `bind to 127.0.0.1 / localhost / ::1 for local dev.`,
  );
}

export function createOperatorServer(
  options: CreateOperatorServerOptions = {},
) {
  // Don't resolve service config eagerly — that requires OPENAI_API_KEY etc.
  // Tests inject registry and skip config; only startOperatorServer needs
  // host/port for binding.
  const config = options.config;
  const log = options.logger ?? rootLogger;
  const tokens: BearerToken[] = options.bearerTokens
    ? normalizeTokens(options.bearerTokens)
    : loadBearerTokens(process.env);
  const registry = options.registry ?? createToolRegistry({ logger: log });
  const routes: Route[] = createMemoryRoutes({ registry, logger: log });

  let rateLimiter: RateLimiter | null = options.rateLimiter ?? null;
  if (!rateLimiter) {
    const envLimit = loadRateLimitFromEnv(process.env);
    if (envLimit) {
      rateLimiter = createTokenBucketLimiter(envLimit);
    }
  }

  if (tokens.length === 0) {
    log.warn(
      { event: "auth.disabled" },
      "MEMORY_API_TOKENS not set — bearer auth is disabled",
    );
  }

  return http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        // Liveness: process is up. Unauthenticated, no dependency check.
        if (req.url === "/healthz" && req.method === "GET") {
          sendOk(res, 200, {
            ok: true,
            host: config?.host ?? "0.0.0.0",
            port: config?.port ?? 0,
          });
          return;
        }

        // Readiness: dependencies are reachable. Returns 503 on any failure
        // so a load balancer can drain traffic until the underlying issue
        // resolves. Unauthenticated by design — orchestrators (k8s, ALB)
        // should be able to probe without holding a credential.
        if (req.url === "/readyz" && req.method === "GET") {
          if (!options.dependencyProbes) {
            sendOk(res, 200, {
              ok: true,
              checks: [],
              message: "no probes configured",
            });
            return;
          }
          const report = await checkDependencies(options.dependencyProbes);
          if (report.status === "ok") {
            sendOk(res, 200, report);
          } else {
            res.writeHead(503, { "content-type": "application/json" });
            res.end(JSON.stringify({ success: false, data: report }));
          }
          return;
        }

        // Bearer auth gate (only when tokens are configured). When matched,
        // we keep the BearerToken so the route can enforce its org binding.
        let matchedToken: BearerToken | null = null;
        if (tokens.length > 0) {
          matchedToken = matchBearerFromRequest(req, tokens);
          if (!matchedToken) {
            sendError(res, 401, "unauthorized");
            return;
          }
        }

        // Rate-limit gate. /healthz and /readyz are handled above and exempt.
        // Key by token (or "anonymous" if auth disabled) so each caller has
        // its own bucket — a single noisy client cannot drain everyone else.
        if (rateLimiter) {
          const key = matchedToken?.token ?? "anonymous";
          const decision = rateLimiter.check(key);
          if (!decision.allowed) {
            res.writeHead(429, {
              "content-type": "application/json",
              "retry-after": Math.ceil(decision.retryAfterMs / 1000).toString(),
            });
            res.end(
              JSON.stringify({
                success: false,
                error: { message: "rate limit exceeded" },
              }),
            );
            return;
          }
        }

        // Route dispatch.
        const route = routes.find(
          (entry) => entry.method === req.method && entry.path === req.url,
        );
        if (!route) {
          sendError(res, 404, "not found");
          return;
        }

        await route.handle(req, res, matchedToken);
      } catch (error: unknown) {
        log.error(
          { event: "http.unhandled", err: error },
          "unhandled error in HTTP request",
        );
        if (!res.headersSent) {
          sendError(res, 500, "internal server error");
        }
      }
    },
  );
}

// Pure helper: select which dependency probes to register based on config
// and the dedicated probe PG pool. OpenAI probe is included only when
// EMBEDDING_PROVIDER=openai — otherwise the probe would fail on zero-key
// (transformers / local) deployments.
export function selectDependencyProbes(
  config: ServiceConfig,
  probePool: PgPool,
): DependencyProbes {
  const probes: DependencyProbes = {
    postgres: buildPostgresProbe(probePool),
    qdrant: buildQdrantProbe({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
    }),
  };

  if (config.embedding.provider === "openai") {
    probes.openai = buildOpenAiProbe({ apiKey: config.openai.apiKey });
  }

  return probes;
}

export function startOperatorServer(
  options: CreateOperatorServerOptions = {},
) {
  const config = options.config ?? resolveServiceConfig();
  const log = options.logger ?? rootLogger;

  // Resolve tokens here (separately from createOperatorServer's own
  // resolution) so we can fail-closed BEFORE listen() opens a port. Without
  // this gate, a misconfigured production deploy (no MEMORY_API_TOKENS,
  // bind 0.0.0.0) would silently expose every endpoint to the internet.
  const tokens: BearerToken[] = options.bearerTokens
    ? normalizeTokens(options.bearerTokens)
    : loadBearerTokens(process.env);
  assertSafeAuthConfig({ tokenCount: tokens.length, host: config.host });

  // Dedicated pool for /readyz dependency probes. Kept separate from
  // canonical-services so /readyz works before (or without) any tool call
  // bootstrapping the singleton. Only one `SELECT 1` is issued per probe, so
  // it stays at a single live connection in practice (uses the pool default).
  const probePool = createPgPool({ connectionString: config.databaseUrl });
  const dependencyProbes =
    options.dependencyProbes ?? selectDependencyProbes(config, probePool);

  const server = createOperatorServer({
    ...options,
    config,
    logger: log,
    dependencyProbes,
  });

  // Optional: background outbox sweeper for P17 compaction-apply Qdrant
  // cleanup. Opt-in via COMPACTION_SWEEP_ENABLED=true so existing deploys
  // don't get a surprise worker. Stopped on server.close().
  let sweeper: BackgroundSweeperHandle | null = null;
  if (loadSweeperEnabled(process.env)) {
    void startSweeperOnce(log, sweeperHandle => {
      sweeper = sweeperHandle;
    }).catch((err: unknown) => {
      log.error(
        { event: "compact.sweep_start_failed", err },
        "failed to start outbox sweeper; continuing without it",
      );
    });
  }

  server.listen(config.port, config.host, () => {
    log.info(
      {
        event: "http.listening",
        host: config.host,
        port: config.port,
      },
      `developer-memory-os listening on http://${config.host}:${config.port}`,
    );
  });

  server.on("close", () => {
    void probePool.end();
    if (sweeper) {
      void sweeper.stop();
    }
  });

  return server;
}

async function startSweeperOnce(
  log: Logger,
  attach: (handle: BackgroundSweeperHandle) => void,
): Promise<void> {
  // Eager bootstrap so the loop has somewhere to call. The canonical
  // services bootstrap also runs migrations — same as the lazy path.
  const services = await bootstrapCanonicalServices();
  const handle = startBackgroundSweeper({
    archiveRepository: services.archiveRepository,
    vectorIndex: services.vectorIndex,
    logger: log,
    intervalMs: loadSweeperIntervalMs(process.env),
  });
  attach(handle);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = startOperatorServer();
  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
