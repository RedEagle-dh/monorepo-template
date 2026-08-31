import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { Elysia, t } from "elysia";
import { ApiError } from "./errors";
import { observability } from "./observability";
import { assertPolicies, configurePolicies, policies } from "./policies";
import type { UserContext } from "./session";

// The whole pipeline is exercised through app.handle() — no HTTP, no DB.

const fakeUser = {
	user: { id: "user-1", name: "Test", email: "test@example.com" },
	session: { id: "session-1" },
} as unknown as UserContext;

function authed(path: string, init?: RequestInit): Request {
	return new Request(`http://localhost${path}`, init);
}

afterAll(() => configurePolicies());

describe("policies", () => {
	it("serves public routes without auth", async () => {
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.get("/open", () => ({ ok: true }), { public: true });
		const res = await app.handle(authed("/open"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it("puts the resolved user on the handler context", async () => {
		configurePolicies({ user: async () => fakeUser });
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.get("/me", ({ user }) => ({ id: user.id }), { user: true });
		const res = await app.handle(authed("/me"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: "user-1" });
	});

	it("answers 401 with the uniform envelope when unauthenticated", async () => {
		configurePolicies(); // real resolver, no session cookie
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.get("/me", ({ user }) => ({ id: user.id }), { user: true });
		const res = await app.handle(authed("/me"));
		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: string; requestId?: string };
		expect(body.error).toBe("unauthorized");
		expect(body.requestId).toBeDefined();
	});

	it("blocks routes without a policy at runtime (default-deny)", async () => {
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.get("/forgotten", () => "leaked");
		const res = await app.handle(authed("/forgotten"));
		expect(res.status).toBe(403);
		expect(((await res.json()) as { error: string }).error).toBe(
			"policy_missing",
		);
	});

	it("assertPolicies refuses to boot a route without a policy", () => {
		const app = new Elysia().use(policies).get("/forgotten", () => "leaked");
		expect(() => assertPolicies(app)).toThrow(/no policy/);
	});

	it("assertPolicies refuses cache on non-GET routes", () => {
		const app = new Elysia()
			.use(policies)
			.post("/x", () => "x", { public: true, cache: { ttlSeconds: 60 } });
		expect(() => assertPolicies(app)).toThrow(/GET-only/);
	});
});

describe("errors", () => {
	it("maps declared errors to their code", async () => {
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.get(
				"/gone",
				() => {
					throw new ApiError(404, "not_found");
				},
				{ public: true, errors: ["not_found"] },
			);
		const res = await app.handle(authed("/gone"));
		expect(res.status).toBe(404);
		expect(((await res.json()) as { error: string }).error).toBe("not_found");
	});

	it("treats undeclared error codes as bugs (500 INTERNAL)", async () => {
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.get(
				"/oops",
				() => {
					throw new ApiError(409, "conflict");
				},
				{ public: true }, // "conflict" not declared
			);
		const res = await app.handle(authed("/oops"));
		expect(res.status).toBe(500);
		expect(((await res.json()) as { error: string }).error).toBe("INTERNAL");
	});

	it("rejects invalid bodies with 422", async () => {
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.post("/things", ({ body }) => body, {
				public: true,
				body: t.Object({ name: t.String({ minLength: 1 }) }),
			});
		const res = await app.handle(
			authed("/things", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		);
		expect(res.status).toBe(422);
		expect(((await res.json()) as { error: string }).error).toBe(
			"VALIDATION_FAILED",
		);
	});
});

describe("cache", () => {
	beforeEach(() => configurePolicies({ user: async () => fakeUser }));

	it("serves the second identical GET from cache", async () => {
		let handlerRuns = 0;
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.get(
				"/expensive",
				() => {
					handlerRuns += 1;
					return { runs: handlerRuns };
				},
				{ user: true, cache: { ttlSeconds: 60, tag: "test-expensive" } },
			);
		const first = (await (await app.handle(authed("/expensive"))).json()) as {
			runs: number;
		};
		const second = (await (await app.handle(authed("/expensive"))).json()) as {
			runs: number;
		};
		expect(first.runs).toBe(1);
		expect(second.runs).toBe(1);
		expect(handlerRuns).toBe(1);
	});

	it("recomputes after a mutation that invalidates the tag", async () => {
		let handlerRuns = 0;
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.get(
				"/list",
				() => {
					handlerRuns += 1;
					return { runs: handlerRuns };
				},
				{ user: true, cache: { ttlSeconds: 60, tag: "test-list" } },
			)
			.post("/list", () => ({ ok: true }), {
				user: true,
				invalidates: ["test-list"],
			});
		await app.handle(authed("/list"));
		await app.handle(authed("/list"));
		expect(handlerRuns).toBe(1);
		await app.handle(authed("/list", { method: "POST" }));
		await app.handle(authed("/list"));
		expect(handlerRuns).toBe(2);
	});

	it("bypasses the cache when no identity is resolvable", async () => {
		let handlerRuns = 0;
		const app = new Elysia()
			.use(observability)
			.use(policies)
			.get(
				"/semi",
				() => {
					handlerRuns += 1;
					return { runs: handlerRuns };
				},
				// public + user-scoped cache → no partition → never cached, never shared
				{ public: true, cache: { ttlSeconds: 60, tag: "test-semi" } },
			);
		await app.handle(authed("/semi"));
		await app.handle(authed("/semi"));
		expect(handlerRuns).toBe(2);
	});
});
