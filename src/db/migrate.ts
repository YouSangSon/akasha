import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type Database from "better-sqlite3";

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "schema.sql",
);

export function runMigrations(db: Database.Database) {
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  db.exec(schemaSql);
}
