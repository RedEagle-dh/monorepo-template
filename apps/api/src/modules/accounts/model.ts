import { t } from "elysia";

export const accountResponse = t.Object({
	id: t.String(),
	name: t.String(),
	createdAt: t.String(),
});

export const createAccountBody = t.Object({
	name: t.String({ minLength: 1, maxLength: 200 }),
});
