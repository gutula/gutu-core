/** Unified async database executor.
 *
 * Every route uses this interface so one code path supports:
 *   - SQLite (synchronous internally, async externally)
 *   - Postgres (natively async, schema-aware for multi-tenant)
 *
 * The adapter handles dialect translation (parameter placeholders, JSON
 * functions) so call sites write dialect-neutral SQL using `?` placeholders.
 */

export type SqlParam = string | number | bigint | boolean | null | Uint8Array;

export interface DbxExecResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export interface Dbx {
  kind: "sqlite" | "postgres";
  /** Execute a statement that does not return rows (DDL, INSERT/UPDATE/DELETE). */
  run(sql: string, params?: readonly SqlParam[]): Promise<DbxExecResult>;
  /** Fetch all rows. */
  all<T = Record<string, unknown>>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<T[]>;
  /** Fetch one row or null. */
  get<T = Record<string, unknown>>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<T | null>;
  /** Exec arbitrary multi-statement SQL (migrations). */
  exec(sql: string): Promise<void>;
  /** Run a function inside a transaction. Postgres uses BEGIN/COMMIT,
   *  SQLite uses IMMEDIATE for write-contention safety. */
  transaction<T>(fn: (tx: Dbx) => Promise<T>): Promise<T>;
  /** Close the underlying connection(s). */
  close(): Promise<void>;
}

/** Helper to translate `?` placeholders into the Postgres `$1, $2, ...` form.
 *  Kept here so adapters share it. Naive — does not touch `?` inside string
 *  literals. Our code never inlines string literals containing `?`, so this
 *  is safe for our call sites. */
export function translateQmarkToDollar(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

/** Rebind `json_extract(data, '$.field')` → Postgres `data->>'field'`.
 *  Used by the generic query builder. */
export function translateJsonExtract(sql: string): string {
  return sql.replace(/json_extract\(\s*data\s*,\s*'\$\.([\w.]+)'\s*\)/g, (_, path) => {
    const parts = (path as string).split(".");
    const last = parts.pop() as string;
    const mids = parts.map((p) => `->'${p}'`).join("");
    return `(data${mids}->>'${last}')`;
  });
}
