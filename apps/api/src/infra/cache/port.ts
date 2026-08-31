/**
 * Layer between the app and whatever cache backend is configured.
 * Adapters: memory.ts (default), redis.ts (when REDIS_URL is set).
 *
 * Namespaces group entries that are invalidated together; invalidation is a
 * generation bump (O(1)), old-generation entries simply expire via their TTL.
 */
export interface CachePort {
	get(namespace: string, key: string): Promise<unknown | undefined>;
	set(
		namespace: string,
		key: string,
		value: unknown,
		ttlSeconds: number,
	): Promise<void>;
	delete(namespace: string, key: string): Promise<void>;
	invalidateNamespace(namespace: string): Promise<void>;
}

/** Deterministic JSON: object keys recursively sorted, for stable cache keys. */
export function stableStringify(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === "object" && !(value instanceof Date)) {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, entry]) => [key, sortKeys(entry)]),
		);
	}
	return value;
}
