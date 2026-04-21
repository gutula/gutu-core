import { describe, expect, it } from "bun:test";

import { createDbClient, executeSql } from "../../src";

describe("@platform/db-drizzle", () => {
  it("creates a postgres client with a stable runtime shape", async () => {
    const client = createDbClient({
      engine: "postgres",
      connectionString: "postgres://postgres:postgres@127.0.0.1:5432/gutu",
      maxConnections: 2
    });

    expect(client.engine).toBe("postgres");
    expect(typeof client.raw.unsafe).toBe("function");
    await client.close();
  });

  it("rejects unsupported engines", () => {
    expect(() =>
      createDbClient({
        engine: "sqlite" as never,
        connectionString: "file:demo.db"
      })
    ).toThrow("Only postgres is supported");
  });

  it("executes raw SQL through the underlying postgres client", async () => {
    const statements: string[] = [];

    await executeSql(
      {
        engine: "postgres",
        raw: {
          unsafe(statement: string) {
            statements.push(statement);
            return Promise.resolve();
          }
        } as never,
        close: async () => undefined
      },
      "select 1"
    );

    expect(statements).toEqual(["select 1"]);
  });
});
