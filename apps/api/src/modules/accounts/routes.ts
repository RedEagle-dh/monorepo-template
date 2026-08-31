import { Elysia, t } from "elysia";
import { policies } from "../../http/policies";
import { accountResponse, createAccountBody } from "./model";
import * as svc from "./service";

// The reference module: policy, cache, invalidation and declared errors are
// all route options — handlers contain domain logic only.
export const accountsRoutes = new Elysia({ name: "accounts" })
	.use(policies)
	.get("/accounts", () => svc.listAccounts(), {
		user: true,
		cache: { ttlSeconds: 300, tag: "accounts" },
		response: t.Array(accountResponse),
	})
	.get("/accounts/:id", ({ params }) => svc.getAccount(params.id), {
		user: true,
		errors: ["not_found"],
		params: t.Object({ id: t.String({ format: "uuid" }) }),
		response: accountResponse,
	})
	.post(
		"/accounts",
		async ({ body, set }) => {
			set.status = 201;
			return svc.createAccount(body.name);
		},
		{
			user: true,
			invalidates: ["accounts"],
			body: createAccountBody,
			response: { 201: accountResponse },
		},
	);
