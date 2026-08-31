import { RedisClient } from "bun";
import { describeError, type Logger } from "../../http/logger";
import type { CachePort } from "./port";

/**
 * CachePort adapter over Bun's native Redis client. Fails open: a Redis
 * outage degrades to uncached operation, it never takes requests down.
 */
export function createRedisCache(
	url: string,
	log: Logger,
): { cache: CachePort; close: () => void } {
	const client = new RedisClient(url);

	const warn = (op: string, error: unknown): undefined => {
		log.warn("cache backend failure", { op, ...describeError(error) });
		return undefined;
	};

	const generationKey = (namespace: string): string => `cachegen:${namespace}`;

	async function valueKey(namespace: string, key: string): Promise<string> {
		const generation = (await client.get(generationKey(namespace))) ?? "0";
		return `cache:${namespace}:${generation}:${key}`;
	}

	const cache: CachePort = {
		async get(namespace, key) {
			try {
				const raw = await client.get(await valueKey(namespace, key));
				return raw === null ? undefined : JSON.parse(raw);
			} catch (error) {
				return warn("get", error);
			}
		},
		async set(namespace, key, value, ttlSeconds) {
			try {
				await client.send("SET", [
					await valueKey(namespace, key),
					JSON.stringify(value),
					"EX",
					String(ttlSeconds),
				]);
			} catch (error) {
				warn("set", error);
			}
		},
		async delete(namespace, key) {
			try {
				await client.del(await valueKey(namespace, key));
			} catch (error) {
				warn("delete", error);
			}
		},
		async invalidateNamespace(namespace) {
			try {
				await client.incr(generationKey(namespace));
			} catch (error) {
				warn("invalidate", error);
			}
		},
	};

	return { cache, close: () => client.close() };
}
