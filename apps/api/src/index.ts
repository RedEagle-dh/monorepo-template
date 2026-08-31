import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "./env";
import { observability } from "./http/observability";
import { assertPolicies, policies } from "./http/policies";
import { auth, log, shutdown } from "./http/runtime";
import { accountsRoutes } from "./modules/accounts/routes";

const app = new Elysia()
	.use(cors({ origin: env.WEB_ORIGIN, credentials: true }))
	// better-auth owns /api/auth/* — mounted before observability on purpose,
	// so the policy_missing guard does not apply to it.
	.mount(auth.handler)
	.use(observability)
	.use(policies)
	.get("/health", () => ({ status: "ok" }), { public: true })
	.use(accountsRoutes);

// Boot-time contract check: refuses to start if any route lacks a policy.
assertPolicies(app);

app.listen(env.PORT);
log.info("api started", { port: env.PORT });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		void shutdown().finally(() => process.exit(0));
	});
}

export type App = typeof app;
