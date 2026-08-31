// Seeds inert placeholders so importing env.ts (validated at import time)
// works in unit tests. DATABASE_URL points at a closed port so an accidental
// real connection fails loudly. Every new REQUIRED env var needs a line here.
process.env.DATABASE_URL ??=
	"postgres://placeholder:placeholder@127.0.0.1:9/placeholder";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret!";
