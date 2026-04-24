import {
  translateJsonExtract,
  translateQmarkToDollar,
  type Dbx,
  type DbxExecResult,
  type SqlParam,
} from "./types";

/** Postgres adapter using Bun's native `Bun.SQL`.
 *
 *  `Bun.SQL` gives us a pooled connection. For multi-tenant schema routing
 *  we embed the schema name into every query via the `withSchema()` helper
 *  in the application layer — NOT via `SET search_path`, because search_path
 *  is per-session and doesn't play well with connection pools.
 *
 *  Translation from dialect-neutral SQL to Postgres:
 *   - `?` → `$1, $2, ...`
 *   - `json_extract(data, '$.x')` → `(data->>'x')`
 *   - `INTEGER NOT NULL DEFAULT 0` → `integer NOT NULL DEFAULT 0` (pg tolerant)
 *   - Booleans are stored as integer 0/1 by convention in this codebase; pg
 *     accepts them transparently via the `integer` column type.
 */
export class PostgresDbx implements Dbx {
  readonly kind = "postgres" as const;
  private readonly sql: {
    unsafe: (text: string, values?: readonly SqlParam[]) => Promise<unknown[]> & {
      execute: () => Promise<unknown[]>;
    };
    close: () => Promise<void>;
    begin: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  };

  constructor(url: string, _maxPool: number) {
    // Bun.SQL constructor — untyped in our TS setup; cast narrowly.
    // deno-lint-ignore no-explicit-any
    const BunSQL = (Bun as unknown as { SQL: new (u: string, o?: unknown) => unknown }).SQL;
    this.sql = new BunSQL(url, { max: _maxPool }) as typeof this.sql;
  }

  private translate(sql: string): string {
    return translateQmarkToDollar(translateJsonExtract(sql));
  }

  async run(sql: string, params: readonly SqlParam[] = []): Promise<DbxExecResult> {
    const rows = (await this.sql.unsafe(this.translate(sql), params)) as unknown[];
    // Bun.SQL's `unsafe()` for INSERT/UPDATE/DELETE returns the command tag
    // object with `.count`. In the array-style it's just the affected rows.
    const meta = (rows as unknown as { count?: number }).count;
    return { changes: typeof meta === "number" ? meta : rows.length };
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    params: readonly SqlParam[] = [],
  ): Promise<T[]> {
    const rows = (await this.sql.unsafe(
      this.translate(sql),
      params,
    )) as unknown as T[];
    return rows;
  }

  async get<T = Record<string, unknown>>(
    sql: string,
    params: readonly SqlParam[] = [],
  ): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows[0] ?? null;
  }

  async exec(sql: string): Promise<void> {
    // Bun.SQL `.unsafe()` handles multi-statement DDL when we don't pass params.
    await this.sql.unsafe(this.translate(sql));
  }

  async transaction<T>(fn: (tx: Dbx) => Promise<T>): Promise<T> {
    // Bun.SQL exposes `.begin(fn)` which returns a transaction-scoped sql
    // tag. Since our Dbx interface is string-based, we build a wrapper adapter.
    return await this.sql.begin(async (txSql) => {
      const tx: Dbx = {
        kind: "postgres",
        run: async (q, p = []) => {
          const rows = (await (txSql as typeof this.sql).unsafe(
            this.translate(q),
            p,
          )) as unknown[];
          const meta = (rows as unknown as { count?: number }).count;
          return { changes: typeof meta === "number" ? meta : rows.length };
        },
        all: async <R = Record<string, unknown>>(q: string, p: readonly SqlParam[] = []) =>
          (await (txSql as typeof this.sql).unsafe(this.translate(q), p)) as unknown as R[],
        get: async <R = Record<string, unknown>>(q: string, p: readonly SqlParam[] = []) => {
          const rows = (await (txSql as typeof this.sql).unsafe(
            this.translate(q),
            p,
          )) as unknown as R[];
          return rows[0] ?? null;
        },
        exec: async (q) => {
          await (txSql as typeof this.sql).unsafe(this.translate(q));
        },
        transaction: () => {
          throw new Error("nested transactions not supported");
        },
        close: async () => {
          /* no-op on tx handle */
        },
      };
      return fn(tx);
    });
  }

  async close(): Promise<void> {
    await this.sql.close();
  }
}
