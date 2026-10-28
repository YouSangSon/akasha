import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type PgQueryRow = Record<string, unknown>;

export type PgQueryResult<TRow extends PgQueryRow = PgQueryRow> = {
  rows: TRow[];
};

export type PgQueryable = {
  query<TRow extends PgQueryRow = PgQueryRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResult<TRow>>;
};

export type PgPoolClient = PgQueryable & {
  release(error?: Error | boolean): void;
  on?(event: "error", listener: (error: Error) => void): unknown;
  removeListener?(event: "error", listener: (error: Error) => void): unknown;
  assertUsable?(): void;
};

export type PgPool = PgQueryable & {
  connect(): Promise<PgPoolClient>;
  end(): Promise<void>;
};

type PgPoolConstructor = new (config: {
  connectionString: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}) => PgPool;

const { Pool: NodePostgresPool } = require("pg") as {
  Pool: PgPoolConstructor;
};

export type PgPoolOptions = {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
};

export type CreatePgPoolInput = {
  connectionString: string;
} & Partial<PgPoolOptions>;

export const DEFAULT_PG_POOL_OPTIONS: PgPoolOptions = {
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

export function createPgPool(input: CreatePgPoolInput): PgPool {
  assertCreatePgPoolInput(input);
  const options = resolvePgPoolOptions(input);

  return new NodePostgresPool({
    connectionString: input.connectionString.trim(),
    ...options,
  });
}

function assertCreatePgPoolInput(
  value: unknown,
): asserts value is CreatePgPoolInput {
  const candidate = assertObject(value, "pg pool input");
  assertNonBlankText(candidate.connectionString, "connectionString");
  assertOptionalPositiveSafeInteger(candidate.max, "max");
  assertOptionalPositiveSafeInteger(
    candidate.idleTimeoutMillis,
    "idleTimeoutMillis",
  );
  assertOptionalPositiveSafeInteger(
    candidate.connectionTimeoutMillis,
    "connectionTimeoutMillis",
  );
}

function resolvePgPoolOptions(input: CreatePgPoolInput): PgPoolOptions {
  return {
    max: input.max ?? DEFAULT_PG_POOL_OPTIONS.max,
    idleTimeoutMillis:
      input.idleTimeoutMillis ?? DEFAULT_PG_POOL_OPTIONS.idleTimeoutMillis,
    connectionTimeoutMillis:
      input.connectionTimeoutMillis ??
      DEFAULT_PG_POOL_OPTIONS.connectionTimeoutMillis,
  };
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

function assertNonBlankText(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must contain non-whitespace text`);
  }
}

function assertOptionalPositiveSafeInteger(
  value: unknown,
  fieldName: string,
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}
