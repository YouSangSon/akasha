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
  return new NodePostgresPool({
    connectionString: input.connectionString,
    max: 10,
  });
}
