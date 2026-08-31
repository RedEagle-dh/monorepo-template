import { Elysia } from "elysia";
import { ApiError, PolicyError } from "./errors";
import type { Marked } from "./policies";
import { errorSink, log, metrics } from "./runtime";

const startedAt = new WeakMap<Request, number>();

type Resolved = Marked & { user?: { id: string } };

function requestIdOf(
	headers: Record<string, string | number | undefined>,
): string | undefined {
	const value = headers["x-request-id"];
	return typeof value === "string" ? value : undefined;
}

export const observability = new Elysia({ name: "observability" })
	.onRequest(({ request, set }) => {
		set.headers["x-request-id"] = crypto.randomUUID();
		set.headers["x-content-type-options"] = "nosniff";
		set.headers["cache-control"] = "no-store";
		startedAt.set(request, performance.now());
	})
	// Runtime half of default-deny: even a route that slipped past
	// assertPolicies() (e.g. registered after boot) answers 403.
	.onBeforeHandle((ctx) => {
		if (ctx.request.method === "OPTIONS") return;
		if ((ctx as unknown as Resolved).policy === undefined) {
			throw new PolicyError(
				403,
				"policy_missing",
				"Route declares no access policy",
			);
		}
	})
	.onAfterResponse(({ request, route, set }) => {
		const status = typeof set.status === "number" ? set.status : 200;
		const durationMs =
			performance.now() - (startedAt.get(request) ?? performance.now());
		const routeId = `${request.method} ${route}`;
		metrics.observe("http_request_duration_ms", durationMs, { route: routeId });
		metrics.increment("http_requests_total", {
			route: routeId,
			status: `${Math.floor(status / 100)}xx`,
		});
		log.debug("request", {
			requestId: requestIdOf(set.headers),
			route: routeId,
			status,
			durationMs: Math.round(durationMs),
		});
	})
	// The single error boundary: uniform envelope { error, message?, requestId }.
	.onError((ctx) => {
		const { error, code, set, request } = ctx;
		const requestId = requestIdOf(set.headers);
		const resolved = ctx as unknown as Resolved;
		const where = ctx as unknown as { route?: string; path?: string };
		const routeId = `${request.method} ${where.route ?? where.path ?? ""}`;

		const bug = (failure: unknown): object => {
			errorSink.capture(failure, {
				requestId,
				route: routeId,
				userId: resolved.user?.id,
			});
			set.status = 500;
			return { error: "INTERNAL", requestId };
		};

		if (error instanceof ApiError) {
			const declared = resolved.declaredErrors ?? [];
			if (!(error instanceof PolicyError) && !declared.includes(error.code)) {
				return bug(
					new Error(
						`undeclared error "${error.code}" (${error.status}): ${error.message}`,
						{
							cause: error,
						},
					),
				);
			}
			set.status = error.status;
			if (error.headers !== undefined)
				Object.assign(set.headers, error.headers);
			if (error.status === 401 || error.status === 403) {
				log.warn("request denied", {
					requestId,
					route: routeId,
					code: error.code,
				});
			}
			return {
				error: error.code,
				message: error.expose ? error.detail : undefined,
				requestId,
			};
		}
		if (code === "VALIDATION") {
			const failure = error as { type?: string; message?: string };
			// A response-schema violation is a handler bug, not a caller error.
			if (failure.type === "response") {
				return bug(
					new Error(`handler violated its response schema: ${failure.message}`),
				);
			}
			set.status = 422;
			return { error: "VALIDATION_FAILED", message: failure.type, requestId };
		}
		if (code === "NOT_FOUND") {
			set.status = 404;
			return { error: "NOT_FOUND", requestId };
		}
		if (code === "PARSE") {
			set.status = 400;
			return { error: "BAD_REQUEST", requestId };
		}
		return bug(error);
	})
	.as("global");
