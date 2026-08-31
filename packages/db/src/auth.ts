import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as authSchema from "./auth-schema";
import type { Database } from "./index";
import * as schema from "./schema";

// Lives here (not in the api) so nothing has to depend on the api package
// to share the auth instance — the api already depends on this package.
export function createAuth(options: {
	db: Database;
	secret: string;
	baseURL: string;
	trustedOrigins: string[];
}) {
	return betterAuth({
		baseURL: options.baseURL,
		secret: options.secret,
		trustedOrigins: options.trustedOrigins,
		database: drizzleAdapter(options.db, {
			provider: "pg",
			schema: { ...schema, ...authSchema },
			usePlural: false,
		}),
		emailAndPassword: { enabled: true },
	});
}

export type Auth = ReturnType<typeof createAuth>;
