import { Elysia } from "elysia";
import { stableStringify } from "../infra/cache/port";
import { cache, metrics } from "./runtime";
import { resolveUser, type UserContext } from "./session";

// Every route must declare exactly one access policy. Undeclared routes are
// rejected twice: at boot by assertPolicies() and at runtime by the
// policy_missing guard in observability.ts. Whitelist, blocked by default.

export type PolicyName = "public" | "user";

export type Marked = {
	policy?: PolicyName;
	declaredErrors?: readonly string[];
};

type RequestOnly = { request: Request };

export interface Resolvers {
	user(request: Request): Promise<UserContext>;
}

const defaults: Resolvers = { user: resolveUser };
let resolvers: Resolvers = defaults;

/** Test seam: inject fake resolvers; calling with no argument restores the real ones. */
export function configurePolicies(overrides?: Partial<Resolvers>): void {
	resolvers = { ...defaults, ...overrides };
}

/** Stamps the ctx (runtime whitelist check) AND the hook fn (boot check). */
function mark(policy: PolicyName) {
	return Object.assign(
		(ctx: object) => {
			(ctx as Marked).policy = policy;
		},
		{ policy },
	);
}

export interface CacheSpec {
	ttlSeconds: number;
	/** Groups routes into one invalidation namespace; defaults to the route id. */
	tag?: string;
	/** "user" (default) partitions by user id; "global" shares across users — an explicit data-leak review decision. */
	scope?: "user" | "global";
}

type CacheCtx = {
	request: Request;
	route: string;
	params: Record<string, unknown> | undefined;
	query: Record<string, unknown> | undefined;
	user?: { id: string };
	response?: unknown;
};

const cacheSlot = new WeakMap<Request, { namespace: string; key: string }>();

function partitionOf(ctx: CacheCtx): string | undefined {
	return ctx.user?.id;
}

export const policies = new Elysia({ name: "policies" }).macro({
	public: { transform: mark("public") },
	user: {
		transform: mark("user"),
		resolve: ({ request }: RequestOnly) => resolvers.user(request),
	},
	/** Error codes this route may answer with; anything else is a bug (500 + sink). */
	errors: (codes: readonly string[]) => ({
		transform: (ctx: object) => {
			(ctx as Marked).declaredErrors = codes;
		},
	}),
	/** Declarative response cache, GET only (enforced by assertPolicies). */
	cache: (spec: CacheSpec) => ({
		// Runs AFTER the policy's resolve (Elysia orders resolve first), so a
		// cache hit still went through auth — caching never bypasses policy.
		beforeHandle: Object.assign(
			async (ctx: CacheCtx) => {
				const partition = spec.scope === "global" ? "global" : partitionOf(ctx);
				if (partition === undefined) return; // no identity → bypass, never share
				const routeId = `${ctx.request.method} ${ctx.route}`;
				const namespace = `${spec.tag ?? routeId}:${partition}`;
				const key = stableStringify({
					route: routeId,
					params: ctx.params,
					query: ctx.query,
				});
				const hit = await cache.get(namespace, key);
				metrics.increment("http_cache_total", {
					route: routeId,
					outcome: hit === undefined ? "miss" : "hit",
				});
				// A hit is returned as the response and still passes the response schema.
				if (hit !== undefined) return hit;
				cacheSlot.set(ctx.request, { namespace, key });
			},
			{ cache: true }, // ← the tag assertPolicies() reads
		),
		afterHandle: async (ctx: CacheCtx) => {
			const slot = cacheSlot.get(ctx.request);
			// Raw Response objects (files, streams) are never stored.
			if (slot === undefined || ctx.response instanceof Response) return;
			await cache.set(slot.namespace, slot.key, ctx.response, spec.ttlSeconds);
		},
	}),
	/** Bump these cache tags after a successful mutation. */
	invalidates: (tags: readonly string[]) => ({
		// afterHandle is skipped on error → only successful mutations invalidate.
		afterHandle: async (ctx: CacheCtx) => {
			const partition = partitionOf(ctx);
			await Promise.all(
				tags.flatMap((tag) => [
					cache.invalidateNamespace(`${tag}:global`),
					...(partition === undefined
						? []
						: [cache.invalidateNamespace(`${tag}:${partition}`)]),
				]),
			);
		},
	}),
});

type BootRoute = {
	method: string;
	path: string;
	hooks?: object;
};

function hookList(hooks: object | undefined, name: string): unknown[] {
	const value = (hooks as Record<string, unknown> | undefined)?.[name];
	return Array.isArray(value) ? value : value !== undefined ? [value] : [];
}

/** Elysia stores hooks either as the bare fn or wrapped in { fn }. */
function hookFn(hook: unknown): Record<string, unknown> {
	const wrapped = (hook as { fn?: unknown }).fn;
	return (wrapped ?? hook) as Record<string, unknown>;
}

/**
 * Boot-time contract check — call before listen(). Throws if any route
 * declares no policy, or declares `cache` on a non-GET route.
 */
export function assertPolicies(app: { routes: BootRoute[] }): void {
	const problems: string[] = [];
	for (const route of app.routes) {
		// "ALL" routes come from .mount()ed sub-apps (better-auth) that own
		// their own pipeline; OPTIONS preflights are registered by the CORS
		// plugin and are exempt at runtime too.
		if (route.method === "ALL" || route.method === "OPTIONS") continue;
		const id = `${route.method} ${route.path}`;
		const hasPolicy = hookList(route.hooks, "transform").some(
			(hook) => hookFn(hook).policy !== undefined,
		);
		if (!hasPolicy) problems.push(`${id}: no policy declared (public / user)`);
		const hasCache = hookList(route.hooks, "beforeHandle").some(
			(hook) => hookFn(hook).cache === true,
		);
		if (hasCache && route.method !== "GET")
			problems.push(`${id}: cache is GET-only`);
	}
	if (problems.length > 0) {
		throw new Error(`Route contract violations:\n- ${problems.join("\n- ")}`);
	}
}
