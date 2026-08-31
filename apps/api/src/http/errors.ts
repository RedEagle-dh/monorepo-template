/**
 * The one error type route handlers and services throw. A route must list the
 * codes it may answer with in its `errors: [...]` option — an undeclared code
 * is treated as a bug (500 + error sink), which keeps the tracker signal-only.
 */
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly detail: string | undefined;
	/** false → the detail is never sent to the client (only the code is). */
	readonly expose: boolean;
	readonly headers: Record<string, string> | undefined;

	constructor(
		status: number,
		code: string,
		detail?: string,
		options?: { expose?: boolean; headers?: Record<string, string> },
	) {
		super(detail ?? code);
		this.status = status;
		this.code = code;
		this.detail = detail;
		this.expose = options?.expose ?? true;
		this.headers = options?.headers;
	}
}

/**
 * Raised by the pipeline itself (401 unauthorized, 403 policy_missing, …).
 * Always mapped to a response, never requires declaration, never hits the
 * error sink.
 */
export class PolicyError extends ApiError {}
