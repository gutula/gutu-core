import postgres from "postgres";

export type PlatformDatabaseClient = {
  engine: "postgres";
  raw: ReturnType<typeof postgres>;
  close(): Promise<void>;
};

export function createDbClient(input: {
  engine: "postgres";
  connectionString: string;
  maxConnections?: number | undefined;
  role?: string | undefined;
}): PlatformDatabaseClient {
  if (input.engine !== "postgres") {
    throw new Error("Only postgres is supported by @platform/db-drizzle.");
  }

  const sql = postgres(input.connectionString, {
    max: input.maxConnections ?? 1
  });

  return {
    engine: "postgres",
    raw: sql,
    async close() {
      await sql.end({ timeout: 5 });
    }
  };
}

export async function executeSql(client: PlatformDatabaseClient, statement: string): Promise<void> {
  await client.raw.unsafe(statement);
}
