import { Database } from "bun:sqlite";
import type { Dbx, DbxExecResult, SqlParam } from "./types";

/** Wraps bun:sqlite with an async-shaped API so route code only depends on
 *  the unified Dbx interface. All calls are synchronous internally; we return
 *  resolved Promises for interface uniformity with the Postgres adapter.
 *
 *  Transactions use `IMMEDIATE` so concurrent writers get `SQLITE_BUSY`
 *  instead of corrupting data. WAL + `PRAGMA synchronous=NORMAL` gives good
 *  throughput for admin workloads. */
export class SqliteDbx implements Dbx {
  readonly kind = "sqlite" as const;
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
  }

  async run(sql: string, params: readonly SqlParam[] = []): Promise<DbxExecResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params as SqlParam[]));
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid:
        typeof result.lastInsertRowid === "bigint"
          ? result.lastInsertRowid
          : Number(result.lastInsertRowid ?? 0),
    };
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    params: readonly SqlParam[] = [],
  ): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params as SqlParam[])) as T[];
  }

  async get<T = Record<string, unknown>>(
    sql: string,
    params: readonly SqlParam[] = [],
  ): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...(params as SqlParam[]));
    return (row as T | null) ?? null;
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: (tx: Dbx) => Promise<T>): Promise<T> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      try { this.db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw err;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }

  /** Escape-hatch for legacy code that still imports the raw handle. */
  raw(): Database {
    return this.db;
  }
}
