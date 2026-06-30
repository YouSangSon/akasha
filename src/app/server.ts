import http, {
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
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
  authenticateBearer,
  loadBearerTokens,
  type BearerToken,
  type OAuthTokenVerifier,
} from "./middleware/bearer-auth.js";
import {
  createOAuthTokenVerifier,
  loadOAuthTokenVerifierConfig,
} from "./middleware/oauth-token-auth.js";
import { sendError, sendOk } from "./middleware/envelope.js";
import {
  createMetricsRegistry,
  METRICS_CONTENT_TYPE,
  type MetricsRegistry,
} from "./metrics.js";
import {
  createBackgroundQueueMetricsCollector,
  type BackgroundQueueBacklogSnapshot,
  type BackgroundQueueMetricsCollector,
} from "./background-queue-metrics.js";
import {
  createTokenBucketLimiter,
  loadRateLimitFromEnv,
  type RateLimiter,
} from "./middleware/rate-limit.js";
import { handleMcpHttpRequest } from "./mcp-http.js";
import {
  isOAuthProtectedResourceMetadataPath,
  assertOAuthProtectedResourceConfig,
  loadOAuthProtectedResourceConfig,
  sendOAuthProtectedResourceMetadata,
  setOAuthWwwAuthenticateHeader,
  type OAuthProtectedResourceConfig,
} from "./oauth-protected-resource.js";
import { createMemoryRoutes, type Route } from "./routes/memory.js";
import {
  createCanonicalServicesResolver,
  createServiceBackedAuditLog,
} from "../mcp/canonical-services.js";
import {
  assertFunction,
  assertObject,
} from "../mcp/tool-registry-validation.js";
import {
  startBackgroundWorkers,
  type BackgroundWorkersHandle,
} from "./background-workers.js";
import { renderMemoryAdminPage } from "./admin-memory-page.js";

const operatorServerCleanup = new WeakMap<HttpServer, () => Promise<void>>();
const LOOPBACK_MCP_ALLOWED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "[::1]",
] as const;

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
  // Optional OAuth protected-resource discovery metadata for MCP HTTP.
  // Undefined loads env config; null disables discovery explicitly.
  oauthProtectedResource?: OAuthProtectedResourceConfig | null;
  // Optional OAuth/OIDC JWT verifier. Undefined builds one from OAuth env
  // config when protected-resource metadata is enabled; null disables OAuth
  // token validation explicitly.
  oauthTokenVerifier?: OAuthTokenVerifier | null;
  // Optional shared registry. startOperatorServer passes one through so
  // background sweeper loops and the /metrics endpoint report to the same
  // in-process counters.
  metrics?: MetricsRegistry;
  // Optional live backlog collector for /metrics. startOperatorServer wires
  // this to the probe Postgres pool; tests can inject or disable it.
  backgroundQueueMetrics?: BackgroundQueueMetricsCollector | null;
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
  oauthTokenValidationEnabled?: boolean;
}): void {
  if (args.tokenCount > 0) return;
  if (args.oauthTokenValidationEnabled) return;
  if (isLoopbackHost(args.host)) return;
  throw new Error(
    `MEMORY_API_TOKENS or OAuth token validation must be set when binding to a non-loopback host ` +
      `(got host=${args.host}). Set MEMORY_API_TOKENS=<comma-separated> or ` +
      `configure MCP_OAUTH_AUTHORIZATION_SERVERS + MCP_OAUTH_RESOURCE_URL, or ` +
      `bind to 127.0.0.1 / localhost / ::1 for local dev.`,
  );
}

export function createOperatorServer(
  options: CreateOperatorServerOptions = {},
) {
  assertOperatorServerOptions(options, "create");

  // Don't resolve service config eagerly — that requires OPENAI_API_KEY etc.
  // Tests inject registry and skip config; only startOperatorServer needs
  // host/port for binding.
  const config = options.config;
  const log = options.logger ?? rootLogger;
  const tokens: BearerToken[] = options.bearerTokens
    ? normalizeTokens(options.bearerTokens)
    : loadBearerTokens(process.env);
  const oauthProtectedResource =
    options.oauthProtectedResource === undefined
      ? loadOAuthProtectedResourceConfig(process.env)
      : options.oauthProtectedResource;
  const oauthTokenVerifier =
    options.oauthTokenVerifier === undefined
      ? createOAuthTokenVerifier(
          loadOAuthTokenVerifierConfig(process.env, oauthProtectedResource),
        )
      : options.oauthTokenVerifier;
  const registry = options.registry ?? createDefaultToolRegistry(log);
  const mcpAllowedHostnames =
    config && isLoopbackHost(config.host)
      ? LOOPBACK_MCP_ALLOWED_HOSTNAMES
      : undefined;
  const routes: Route[] = createMemoryRoutes({
    registry,
    logger: log,
    oauthProtectedResource,
  });
  const metrics = options.metrics ?? createMetricsRegistry();
  const backgroundQueueMetrics = options.backgroundQueueMetrics ?? null;

  let rateLimiter: RateLimiter | null = options.rateLimiter ?? null;
  if (!rateLimiter) {
    const envLimit = loadRateLimitFromEnv(process.env);
    if (envLimit) {
      rateLimiter = createTokenBucketLimiter(envLimit);
    }
  }

  if (tokens.length === 0 && !oauthTokenVerifier) {
    log.warn(
      { event: "auth.disabled" },
      "MEMORY_API_TOKENS not set — bearer auth is disabled",
    );
  }

  return http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const requestPath = parseRequestPath(req.url);
      observeRequestMetrics(req, res, metrics, routeLabelForMetrics({
        path: requestPath,
        routes,
        oauthProtectedResource,
      }));

      try {
        if (
          req.method === "GET" &&
          oauthProtectedResource &&
          isOAuthProtectedResourceMetadataPath(req.url)
        ) {
          sendOAuthProtectedResourceMetadata(res, oauthProtectedResource);
          return;
        }

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
          metrics.setDependencyReport(report);
          if (report.status === "ok") {
            sendOk(res, 200, report);
          } else {
            res.writeHead(503, { "content-type": "application/json" });
            res.end(JSON.stringify({ success: false, data: report }));
          }
          return;
        }

        if (requestPath === "/metrics" && req.method === "GET") {
          const backgroundQueueBacklog = await collectBackgroundQueueBacklog({
            collector: backgroundQueueMetrics,
            logger: log,
          });
          res.writeHead(200, { "content-type": METRICS_CONTENT_TYPE });
          res.end(metrics.render(backgroundQueueBacklog));
          return;
        }

        if (requestPath === "/admin/memory" && req.method === "GET") {
          res.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "x-content-type-options": "nosniff",
          });
          res.end(renderMemoryAdminPage());
          return;
        }

        if (req.url === "/mcp") {
          await handleMcpHttpRequest({
            req,
            res,
            registry,
            bearerTokens: tokens,
            oauthTokenVerifier,
            rateLimiter,
            logger: log,
            oauthProtectedResource,
            allowedHostnames: mcpAllowedHostnames,
          });
          return;
        }

        // Bearer auth gate (only when tokens are configured). When matched,
        // we keep the BearerToken so the route can enforce its org binding.
        let matchedToken: BearerToken | null = null;
        if (tokens.length > 0 || oauthTokenVerifier) {
          matchedToken = await authenticateBearer(
            typeof req.headers.authorization === "string"
              ? req.headers.authorization
              : undefined,
            tokens,
            oauthTokenVerifier,
          );
          if (!matchedToken) {
            if (isV1Request(req.url)) {
              setOAuthWwwAuthenticateHeader(res, oauthProtectedResource);
            }
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

function observeRequestMetrics(
  req: IncomingMessage,
  res: ServerResponse,
  metrics: MetricsRegistry,
  route: string,
): void {
  const start = process.hrtime.bigint();
  res.once("finish", () => {
    const durationSeconds =
      Number(process.hrtime.bigint() - start) / 1_000_000_000;
    metrics.observeHttpRequest({
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationSeconds,
    });
  });
}

function routeLabelForMetrics(input: {
  path: string;
  routes: readonly Route[];
  oauthProtectedResource: OAuthProtectedResourceConfig | null;
}): string {
  if (
    input.oauthProtectedResource &&
    isOAuthProtectedResourceMetadataPath(input.path)
  ) {
    return input.path;
  }

  if (input.path === "/healthz") return "/healthz";
  if (input.path === "/readyz") return "/readyz";
  if (input.path === "/metrics") return "/metrics";
  if (input.path === "/admin/memory") return "/admin/memory";
  if (input.path === "/mcp") return "/mcp";

  const staticRoute = input.routes.find((route) => route.path === input.path);
  return staticRoute?.path ?? "unknown";
}

function isV1Request(url: string | undefined): boolean {
  return parseRequestPath(url).startsWith("/v1/");
}

function parseRequestPath(url: string | undefined): string {
  if (!url) {
    return "";
  }
  return new URL(url, "http://localhost").pathname;
}

function createDefaultToolRegistry(log: Logger): ToolRegistry {
  const withCanonicalServices = createCanonicalServicesResolver({});
  const auditLog = createServiceBackedAuditLog(withCanonicalServices);

  return createToolRegistry({
    logger: log,
    defaultActor: "http-api",
    withCanonicalServices,
    auditLog,
  });
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
  };

  if (config.vectorBackend === "qdrant") {
    probes.qdrant = buildQdrantProbe({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
    });
  }

  if (config.embedding.provider === "openai") {
    probes.openai = buildOpenAiProbe({ apiKey: config.openai.apiKey });
  }

  return probes;
}

export function startOperatorServer(
  options: CreateOperatorServerOptions = {},
) {
  assertOperatorServerOptions(options, "start");

  const config = options.config ?? resolveServiceConfig();
  const log = options.logger ?? rootLogger;

  // Resolve tokens here (separately from createOperatorServer's own
  // resolution) so we can fail-closed BEFORE listen() opens a port. Without
  // this gate, a misconfigured production deploy (no MEMORY_API_TOKENS,
  // bind 0.0.0.0) would silently expose every endpoint to the internet.
  const tokens: BearerToken[] = options.bearerTokens
    ? normalizeTokens(options.bearerTokens)
    : loadBearerTokens(process.env);
  const oauthProtectedResource =
    options.oauthProtectedResource === undefined
      ? loadOAuthProtectedResourceConfig(process.env)
      : options.oauthProtectedResource;
  const oauthTokenVerifier =
    options.oauthTokenVerifier === undefined
      ? createOAuthTokenVerifier(
          loadOAuthTokenVerifierConfig(process.env, oauthProtectedResource),
        )
      : options.oauthTokenVerifier;
  assertSafeAuthConfig({
    tokenCount: tokens.length,
    host: config.host,
    oauthTokenValidationEnabled: oauthTokenVerifier !== null,
  });

  // Dedicated pool for /readyz dependency probes. Kept separate from
  // canonical-services so /readyz works before (or without) any tool call
  // bootstrapping the singleton. Only one `SELECT 1` is issued per probe, so
  // it stays at a single live connection in practice (uses the pool default).
  const probePool = createPgPool({ connectionString: config.databaseUrl });
  const dependencyProbes =
    options.dependencyProbes ?? selectDependencyProbes(config, probePool);

  const metrics = options.metrics ?? createMetricsRegistry();
  const backgroundQueueMetrics =
    options.backgroundQueueMetrics === undefined
      ? createBackgroundQueueMetricsCollector(probePool)
      : options.backgroundQueueMetrics;

  const server = createOperatorServer({
    ...options,
    config,
    logger: log,
    dependencyProbes,
    oauthProtectedResource,
    oauthTokenVerifier,
    metrics,
    backgroundQueueMetrics,
  });

  let backgroundWorkers: BackgroundWorkersHandle | null = null;
  let backgroundWorkerStartup: Promise<BackgroundWorkersHandle | null> =
    Promise.resolve(null);
  const startWorkers = (): void => {
    backgroundWorkerStartup = Promise.resolve()
      .then(() =>
        startBackgroundWorkers({
          logger: log,
          metrics,
          failFast: false,
        }),
      )
      .then((handle) => {
        backgroundWorkers = handle;
        return handle;
      })
      .catch((err: unknown) => {
        log.error(
          { event: "background_workers.start_failed", err },
          "failed to start background workers; continuing without them",
        );
        return null;
      });
  };
  let cleanupPromise: Promise<void> | null = null;
  const cleanup = (): Promise<void> => {
    if (!cleanupPromise) {
      cleanupPromise = settleCleanup([
        probePool.end(),
        backgroundWorkerStartup.then((handle) =>
          (handle ?? backgroundWorkers)?.stop(),
        ),
      ]);
    }
    return cleanupPromise;
  };
  operatorServerCleanup.set(server, cleanup);

  server.listen(config.port, config.host, () => {
    log.info(
      {
        event: "http.listening",
        host: config.host,
        port: config.port,
      },
      `developer-memory-os listening on http://${config.host}:${config.port}`,
    );
    startWorkers();
  });

  server.on("close", () => {
    void cleanup().catch((err: unknown) => {
      log.error(
        { event: "http.shutdown_cleanup_failed", err },
        "failed to clean up HTTP server resources",
      );
    });
  });
  server.on("error", (err: unknown) => {
    void cleanup().catch((cleanupError: unknown) => {
      log.error(
        { event: "http.shutdown_cleanup_failed", err: cleanupError },
        "failed to clean up HTTP server resources",
      );
    });
    log.error(
      { event: "http.listen_failed", err },
      "HTTP server failed; cleaning up resources",
    );
  });

  return server;
}

export async function closeOperatorServer(server: HttpServer): Promise<void> {
  await closeHttpServer(server);
  await operatorServerCleanup.get(server)?.();
}

function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err?: Error) => {
      if (!err || isServerNotRunningError(err)) {
        resolve();
        return;
      }
      reject(err);
    });
  });
}

function isServerNotRunningError(err: Error): boolean {
  return (err as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING";
}

async function settleCleanup(tasks: readonly Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(tasks);
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (rejected.length === 0) {
    return;
  }
  if (rejected.length === 1) {
    throw rejected[0].reason;
  }
  throw new AggregateError(
    rejected.map((result) => result.reason),
    "multiple HTTP server cleanup steps failed",
  );
}

async function collectBackgroundQueueBacklog(input: {
  collector: BackgroundQueueMetricsCollector | null;
  logger: Logger;
}): Promise<BackgroundQueueBacklogSnapshot | undefined> {
  if (!input.collector) {
    return undefined;
  }

  try {
    return await input.collector.collect();
  } catch (err: unknown) {
    input.logger.error(
      { event: "background_queue_metrics.collect_failed", err },
      "failed to collect background queue backlog metrics",
    );
    return {
      collectSuccess: false,
      rows: [],
    };
  }
}

function assertOperatorServerOptions(
  value: unknown,
  mode: "create" | "start",
): asserts value is CreateOperatorServerOptions {
  const candidate = assertObject(value, "operator server options");

  assertOptionalServiceConfig(candidate.config);
  assertOptionalObject(candidate.registry, "registry");
  assertOptionalLogger(
    candidate.logger,
    mode,
    canAuthBeDisabled(candidate),
  );
  assertOptionalBearerTokens(candidate.bearerTokens);
  assertOptionalObject(candidate.dependencyProbes, "dependencyProbes");
  assertOptionalRateLimiter(candidate.rateLimiter);
  assertOptionalOAuthProtectedResource(
    candidate.oauthProtectedResource,
  );
  assertOptionalNullableOAuthTokenVerifier(candidate.oauthTokenVerifier);
  assertOptionalMetrics(candidate.metrics);
  assertOptionalBackgroundQueueMetrics(candidate.backgroundQueueMetrics);
}

function assertOptionalObject(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  assertObject(value, fieldName);
}

function assertOptionalOAuthProtectedResource(value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  assertOAuthProtectedResourceConfig(value);
}

function assertOptionalLogger(
  value: unknown,
  mode: "create" | "start",
  authCanBeDisabled: boolean,
): void {
  if (value === undefined) {
    return;
  }
  const logger = assertObject(value, "logger");
  assertFunction(logger.error, "logger.error");
  if (mode === "create") {
    if (authCanBeDisabled || logger.warn !== undefined) {
      assertFunction(logger.warn, "logger.warn");
    }
    return;
  }
  assertFunction(logger.warn, "logger.warn");
  assertFunction(logger.info, "logger.info");
}

function canAuthBeDisabled(
  options: Record<string, unknown>,
): boolean {
  const bearerTokens = options.bearerTokens;
  const oauthTokenVerifier = options.oauthTokenVerifier;
  if (Array.isArray(bearerTokens) && bearerTokens.length > 0) {
    return false;
  }
  if (oauthTokenVerifier !== undefined && oauthTokenVerifier !== null) {
    return false;
  }
  return true;
}

function assertOptionalServiceConfig(value: unknown): void {
  if (value === undefined) {
    return;
  }
  const config = assertObject(value, "config");
  assertString(config.host, "config.host");
  assertNumber(config.port, "config.port");
  assertString(config.databaseUrl, "config.databaseUrl");
  if (config.vectorBackend !== "qdrant" && config.vectorBackend !== "pgvector") {
    throw new Error('config.vectorBackend must be "qdrant" or "pgvector"');
  }
  if (config.vectorBackend === "qdrant") {
    const qdrant = assertObject(config.qdrant, "config.qdrant");
    assertString(qdrant.url, "config.qdrant.url");
    assertString(qdrant.apiKey, "config.qdrant.apiKey");
  }
  const embedding = assertObject(config.embedding, "config.embedding");
  if (
    embedding.provider !== "openai" &&
    embedding.provider !== "local" &&
    embedding.provider !== "transformers"
  ) {
    throw new Error(
      'config.embedding.provider must be "openai", "local", or "transformers"',
    );
  }
  if (embedding.provider === "openai") {
    const openai = assertObject(config.openai, "config.openai");
    assertString(openai.apiKey, "config.openai.apiKey");
  }
}

function assertOptionalBearerTokens(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new Error("bearerTokens must be an array");
  }
  for (const [index, token] of value.entries()) {
    if (typeof token === "string") {
      continue;
    }
    const entry = assertObject(token, `bearerTokens[${index}]`);
    if (typeof entry.token !== "string") {
      throw new Error(`bearerTokens[${index}].token must be a string`);
    }
    if (
      entry.organizationId !== undefined &&
      typeof entry.organizationId !== "string"
    ) {
      throw new Error(
        `bearerTokens[${index}].organizationId must be a string`,
      );
    }
  }
}

function assertOptionalRateLimiter(value: unknown): void {
  if (value === undefined) {
    return;
  }
  const rateLimiter = assertObject(value, "rateLimiter");
  assertFunction(rateLimiter.check, "rateLimiter.check");
}

function assertOptionalNullableOAuthTokenVerifier(value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  const verifier = assertObject(value, "oauthTokenVerifier");
  assertFunction(verifier.verify, "oauthTokenVerifier.verify");
}

function assertOptionalMetrics(value: unknown): void {
  if (value === undefined) {
    return;
  }
  const metrics = assertObject(value, "metrics");
  assertFunction(metrics.observeHttpRequest, "metrics.observeHttpRequest");
  assertFunction(metrics.observeSweeperTick, "metrics.observeSweeperTick");
  assertFunction(metrics.setDependencyReport, "metrics.setDependencyReport");
  assertFunction(metrics.render, "metrics.render");
}

function assertOptionalBackgroundQueueMetrics(value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  const collector = assertObject(value, "backgroundQueueMetrics");
  assertFunction(collector.collect, "backgroundQueueMetrics.collect");
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function assertNumber(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = startOperatorServer();
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    void closeOperatorServer(server)
      .then(() => {
        process.exit(0);
      })
      .catch((err: unknown) => {
        rootLogger.error(
          { event: "http.shutdown_failed", err },
          "failed to shut down HTTP server cleanly",
        );
        process.exit(1);
      });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
