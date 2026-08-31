import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

const schema = { ...appSchema, ...authSchema };

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
	const client = postgres(connectionString);
	return drizzle(client, { schema });
}

// Re-exported so consumers don't need their own drizzle-orm dependency.
export { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
export * from "./auth-schema";
export * from "./schema";
