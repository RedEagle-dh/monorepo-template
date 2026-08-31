// Production server (Bun): serves the static client build and hands
// everything else to the TanStack Start fetch handler.
// Requires `bun run build` first; excluded from tsconfig because it
// imports the build artifact.
import handler from "./dist/server/server.js";

const port = Number(process.env.PORT ?? 3001);

Bun.serve({
	port,
	async fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname !== "/") {
			const file = Bun.file(`./dist/client${pathname}`);
			if (await file.exists()) {
				return new Response(file, {
					headers: pathname.startsWith("/assets/")
						? { "cache-control": "public, max-age=31536000, immutable" }
						: undefined,
				});
			}
		}
		return handler.fetch(request);
	},
});

console.log(`web running at http://localhost:${port}`);
