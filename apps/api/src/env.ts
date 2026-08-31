import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.url(),
		PORT: z.coerce.number().int().positive().default(3000),
		/** Origin allowed by CORS and trusted by better-auth. */
		WEB_ORIGIN: z.url().default("http://localhost:3001"),
		/** Generate with: openssl rand -base64 32 */
		BETTER_AUTH_SECRET: z
			.string()
			.min(32, "at least 32 chars (openssl rand -base64 32)"),
		BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
		/** Unset → the in-memory CachePort is used instead of Redis. */
		REDIS_URL: z.url().optional(),
		LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
