import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function createMemoryDb(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  return db;
}
