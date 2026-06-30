// Lightweight dependency health probes. Each probe is independent and
// returns its own pass/fail so callers can surface a structured report.
// Valid probe failures are encoded in the result rather than thrown.

export type DependencyStatus = "ok" | "fail";

export type DependencyCheck = {
  name: string;
  status: DependencyStatus;
  message?: string;
  durationMs: number;
};

export type DependencyReport = {
  status: DependencyStatus;
  checks: DependencyCheck[];
};

export type DependencyProbes = {
  postgres?: () => Promise<void>;
  qdrant?: () => Promise<void>;
  openai?: () => Promise<void>;
};

type DependencyProbeName = keyof DependencyProbes;

type PostgresProbePool = {
  query: (sql: string) => Promise<unknown>;
};

type QdrantProbeInput = {
  url: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type OpenAiProbeInput = {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const KNOWN_DEPENDENCY_PROBES = new Set<DependencyProbeName>([
  "postgres",
  "qdrant",
  "openai",
]);

export async function checkDependencies(
  probes: DependencyProbes,
): Promise<DependencyReport> {
  assertDependencyProbes(probes);

  const checks: DependencyCheck[] = [];

  await Promise.all(
    Object.entries(probes).map(async ([name, probe]) => {
      if (!probe) {
        return;
      }
      checks.push(await runProbe(name, probe));
    }),
  );

  // Sort for stable output across runs.
  checks.sort((a, b) => a.name.localeCompare(b.name));

  const status: DependencyStatus = checks.every((c) => c.status === "ok")
    ? "ok"
    : "fail";

  return { status, checks };
}

async function runProbe(
  name: string,
  probe: () => Promise<void>,
): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    await probe();
    return { name, status: "ok", durationMs: Date.now() - start };
  } catch (error: unknown) {
    return {
      name,
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}

// Convenience builders that wrap a runtime client into a probe. Kept simple:
// each one issues a single tiny request that should succeed when the service
// is reachable and authenticated.

export function buildPostgresProbe(
  pool: PostgresProbePool,
): () => Promise<void> {
  assertPostgresProbePool(pool);

  return async () => {
    await pool.query("SELECT 1");
  };
}

export function buildQdrantProbe(input: QdrantProbeInput): () => Promise<void> {
  assertQdrantProbeInput(input);

  return async () => {
    const f = input.fetch ?? fetch;
    const controller = new AbortController();
    const timeoutMs = input.timeoutMs ?? 2_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await f(`${input.url.replace(/\/$/, "")}/healthz`, {
        method: "GET",
        headers: { "api-key": input.apiKey },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`qdrant /healthz returned ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  };
}

// OpenAI probe is opt-in: a real embedding call costs quota. Default uses a
// lightweight `models` GET which is free. Caller can swap in a stricter
// embedding test if needed.
export function buildOpenAiProbe(input: OpenAiProbeInput): () => Promise<void> {
  assertOpenAiProbeInput(input);

  return async () => {
    const f = input.fetch ?? fetch;
    const controller = new AbortController();
    const timeoutMs = input.timeoutMs ?? 3_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await f("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { authorization: `Bearer ${input.apiKey}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`openai /v1/models returned ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  };
}

function assertDependencyProbes(
  value: unknown,
): asserts value is DependencyProbes {
  const candidate = assertObject(value, "dependency probes");

  for (const [name, probe] of Object.entries(candidate)) {
    if (!isKnownDependencyProbeName(name)) {
      throw new Error(`dependency probe "${name}" is not supported`);
    }
    if (probe !== undefined && typeof probe !== "function") {
      throw new Error(`dependencyProbes.${name} must be a function`);
    }
  }
}

function isKnownDependencyProbeName(name: string): name is DependencyProbeName {
  return KNOWN_DEPENDENCY_PROBES.has(name as DependencyProbeName);
}

function assertPostgresProbePool(
  value: unknown,
): asserts value is PostgresProbePool {
  const candidate = assertObject(value, "postgres probe pool");
  assertFunction(candidate.query, "postgres probe pool.query");
}

function assertQdrantProbeInput(
  value: unknown,
): asserts value is QdrantProbeInput {
  const candidate = assertObject(value, "qdrant probe input");
  assertNonBlankString(candidate.url, "qdrant probe input.url");
  assertNonBlankString(candidate.apiKey, "qdrant probe input.apiKey");
  assertOptionalFunction(candidate.fetch, "qdrant probe input.fetch");
  assertOptionalPositiveFiniteNumber(
    candidate.timeoutMs,
    "qdrant probe input.timeoutMs",
  );
}

function assertOpenAiProbeInput(
  value: unknown,
): asserts value is OpenAiProbeInput {
  const candidate = assertObject(value, "openai probe input");
  assertNonBlankString(candidate.apiKey, "openai probe input.apiKey");
  assertOptionalFunction(candidate.fetch, "openai probe input.fetch");
  assertOptionalPositiveFiniteNumber(
    candidate.timeoutMs,
    "openai probe input.timeoutMs",
  );
}

function assertObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertFunction(value: unknown, fieldName: string): void {
  if (typeof value !== "function") {
    throw new Error(`${fieldName} must be a function`);
  }
}

function assertOptionalFunction(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  assertFunction(value, fieldName);
}

function assertNonBlankString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function assertOptionalPositiveFiniteNumber(
  value: unknown,
  fieldName: string,
): asserts value is number | undefined {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive finite number`);
  }
}
