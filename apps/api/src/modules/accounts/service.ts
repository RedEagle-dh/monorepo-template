import { accounts, desc, eq } from "@repo/db";
import { ApiError } from "../../http/errors";
import { db } from "../../http/runtime";

function serialize(row: typeof accounts.$inferSelect) {
	return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
}

export async function listAccounts() {
	const rows = await db
		.select()
		.from(accounts)
		.orderBy(desc(accounts.createdAt));
	return rows.map(serialize);
}

export async function getAccount(id: string) {
	const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
	if (row === undefined) throw new ApiError(404, "not_found");
	return serialize(row);
}

export async function createAccount(name: string) {
	const [row] = await db.insert(accounts).values({ name }).returning();
	if (row === undefined) throw new Error("insert returned no row");
	return serialize(row);
}
