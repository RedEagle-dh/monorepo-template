import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Placeholder table so drizzle-kit has a schema to work with.
// Replace with the real domain model.
export const accounts = pgTable("accounts", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
