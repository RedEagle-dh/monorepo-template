import type { CachePort } from "./port";

interface Entry {
	value: unknown;
	expiresAt: number;
}

export function createMemoryCache(): CachePort {
	const entries = new Map<string, Entry>();
	const generations = new Map<string, number>();

	const fullKey = (namespace: string, key: string): string =>
		`${namespace}:${generations.get(namespace) ?? 0}:${key}`;

	return {
		async get(namespace, key) {
			const entry = entries.get(fullKey(namespace, key));
			if (entry === undefined) return undefined;
			if (entry.expiresAt <= Date.now()) {
				entries.delete(fullKey(namespace, key));
				return undefined;
			}
			return entry.value;
		},
		async set(namespace, key, value, ttlSeconds) {
			entries.set(fullKey(namespace, key), {
				// JSON round-trip mirrors the Redis adapter's serialization, so a
				// dev-mode hit behaves like production (Dates become strings, …).
				value: JSON.parse(JSON.stringify(value)),
				expiresAt: Date.now() + ttlSeconds * 1000,
			});
		},
		async delete(namespace, key) {
			entries.delete(fullKey(namespace, key));
		},
		async invalidateNamespace(namespace) {
			generations.set(namespace, (generations.get(namespace) ?? 0) + 1);
		},
	};
}
