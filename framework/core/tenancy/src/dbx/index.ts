import { SqliteDbx } from "./sqlite";
import { PostgresDbx } from "./postgres";
import type { Dbx } from "./types";

export type { Dbx, DbxExecResult, SqlParam } from "./types";
export { SqliteDbx } from "./sqlite";
export { PostgresDbx } from "./postgres";
export { translateJsonExtract, translateQmarkToDollar } from "./types";

/** Build the right Dbx for a config.
 *
 *  The host picks its config shape — this factory only needs the driver
 *  kind + connection info. Lets callers construct their own config object
 *  and inject it here. */
export interface DbxFactoryOptions {
  kind: "sqlite" | "postgres";
  /** SQLite file path. Required when kind === "sqlite". */
  sqlitePath?: string;
  /** Postgres connection URL. Required when kind === "postgres". */
  postgresUrl?: string;
  /** Postgres pool size. Default 10. */
  postgresMaxPool?: number;
}

export function createDbx(opts: DbxFactoryOptions): Dbx {
  if (opts.kind === "postgres") {
    if (!opts.postgresUrl) {
      throw new Error("createDbx: postgresUrl required when kind=postgres");
    }
    return new PostgresDbx(opts.postgresUrl, opts.postgresMaxPool ?? 10);
  }
  if (!opts.sqlitePath) {
    throw new Error("createDbx: sqlitePath required when kind=sqlite");
  }
  return new SqliteDbx(opts.sqlitePath);
}
