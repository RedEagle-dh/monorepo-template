import { PolicyError } from "./errors";
import { auth } from "./runtime";

type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

// Type alias, not interface: macro resolve return values must satisfy
// Record<string, unknown> for Elysia to merge them into the handler context.
export type UserContext = {
	user: SessionData["user"];
	session: SessionData["session"];
};

export async function resolveUser(request: Request): Promise<UserContext> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) throw new PolicyError(401, "unauthorized");
	return { user: session.user, session: session.session };
}
