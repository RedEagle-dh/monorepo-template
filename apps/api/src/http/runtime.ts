import { createDb } from "@repo/db";
import { createAuth } from "@repo/db/auth";
import { env } from "../env";
import { createMemoryCache } from "../infra/cache/memory";
import type { CachePort } from "../infra/cache/port";
import { createRedisCache } from "../infra/cache/redis";
import { createLogger, describeError, type Logger } from "./logger";

// Process-wide ports. This file is the only place a backend is chosen —
// everything else depends on the interfaces.

export const log: Logger = createLogger(env.LOG_LEVEL);

export const db = createDb(env.DATABASE_URL);

export const auth = createAuth({
	db,
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	trustedOrigins: [env.WEB_ORIGIN],
});

export interface Metrics {
	/** Labels must stay low-cardinality: route, status class — never a user id. */
	increment(name: string, labels?: Record<string, string>): void;
	observe(name: string, valueMs: number, labels?: Record<string, string>): void;
}

/** No-op until a metrics backend is wired; call sites stay unconditional. */
export const metrics: Metrics = { increment() {}, observe() {} };

export interface ErrorContext {
	requestId?: string;
	route?: string;
	userId?: string;
}

/**
 * Receives every error no route contract anticipated: undeclared ApiErrors,
 * response-schema violations, plain exceptions. Logs today — point it at
 * Sentry/GlitchTip here and only genuine bugs reach the tracker.
 */
export interface ErrorSink {
	capture(error: unknown, context: ErrorContext): void;
}

export const errorSink: ErrorSink = {
	capture(error, context) {
		log.error("unhandled error", { ...context, error: describeError(error) });
	},
};

const redis =
	env.REDIS_URL !== undefined ? createRedisCache(env.REDIS_URL, log) : null;
export const cache: CachePort = redis?.cache ?? createMemoryCache();

export async function shutdown(): Promise<void> {
	redis?.close();
}
