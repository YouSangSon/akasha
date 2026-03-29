import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);

export type PgQueryRow = Record<string, unknown>;

export type PgQueryResult<TRow extends PgQueryRow = PgQueryRow> = {
  rows: TRow[];
};

export type PgPool = {
  query<TRow extends PgQueryRow = PgQueryRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResult<TRow>>;
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

export function createMemoryDb(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  return db;
}

export function createPgPool(input: CreatePgPoolInput): PgPool {
  return new NodePostgresPool({
    connectionString: input.connectionString,
    max: 10,
  });
}
