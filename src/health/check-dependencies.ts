// Lightweight dependency health probes. Each probe is independent and
// returns its own pass/fail so callers can surface a structured report.
// Probes never throw — failure is encoded in the result.

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

export async function checkDependencies(
  probes: DependencyProbes,
): Promise<DependencyReport> {
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
  pool: { query: (sql: string) => Promise<unknown> },
): () => Promise<void> {
  return async () => {
    await pool.query("SELECT 1");
  };
}

export function buildQdrantProbe(input: {
  url: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): () => Promise<void> {
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
export function buildOpenAiProbe(input: {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): () => Promise<void> {
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
