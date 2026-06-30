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
  release(): void;
};

export type PgPool = PgQueryable & {
  connect(): Promise<PgPoolClient>;
  end(): Promise<void>;
};

type PgPoolConstructor = new (config: {
  connectionString: string;
  max: number;
}) => PgPool;

const { Pool: NodePostgresPool } = require("pg") as {
  Pool: PgPoolConstructor;
};

export type CreatePgPoolInput = {
  connectionString: string;
};

export function createPgPool(input: CreatePgPoolInput): PgPool {
  assertCreatePgPoolInput(input);

  return new NodePostgresPool({
    connectionString: input.connectionString,
    max: 10,
  });
}

function assertCreatePgPoolInput(
  value: unknown,
): asserts value is CreatePgPoolInput {
  const candidate = assertObject(value, "pg pool input");
  assertNonBlankText(candidate.connectionString, "connectionString");
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
