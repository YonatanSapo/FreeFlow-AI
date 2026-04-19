/**
 * Thrown when the Ollama daemon cannot be reached (connection refused, timeout, DNS failure).
 * `health()` never throws this; every other OllamaClient method does.
 */
export class OllamaUnreachableError extends Error {
	readonly baseUrl: string;
	readonly operation: string;

	constructor(baseUrl: string, operation: string, cause?: unknown) {
		super(buildConnectionMessage(baseUrl, operation, cause));
		this.name = "OllamaUnreachableError";
		this.baseUrl = baseUrl;
		this.operation = operation;
		if (cause !== undefined) {
			(this as { cause?: unknown }).cause = cause;
		}
	}
}

/**
 * Thrown when the Ollama HTTP API returns a non-2xx status code.
 */
export class OllamaHttpError extends Error {
	constructor(
		readonly operation: string,
		readonly status: number,
		readonly statusText: string,
	) {
		super(`Ollama ${operation} failed: ${status} ${statusText}`);
		this.name = "OllamaHttpError";
	}
}

/**
 * Thrown when a pull/generate references a model tag that Ollama does not know.
 */
export class ModelNotFoundError extends Error {
	constructor(readonly tag: string) {
		super(`Model not found: ${tag}`);
		this.name = "ModelNotFoundError";
	}
}

/**
 * Thrown when `sendPrompt` is called on a session that has already been closed.
 */
export class SessionClosedError extends Error {
	constructor(readonly sessionId: string) {
		super(`Chat session "${sessionId}" is closed`);
		this.name = "SessionClosedError";
	}
}

// ---------------------------------------------------------------------------
// Internal helper — not exported; used by OllamaUnreachableError constructor
// ---------------------------------------------------------------------------

function getErrnoCode(err: unknown, depth = 0): string | undefined {
	if (depth > 6 || err === null || typeof err !== "object") {
		return undefined;
	}
	const o = err as { code?: unknown; cause?: unknown };
	if (typeof o.code === "string") {
		return o.code;
	}
	if (o.cause !== undefined && o.cause !== null) {
		return getErrnoCode(o.cause, depth + 1);
	}
	return undefined;
}

function buildConnectionMessage(baseUrl: string, operation: string, err: unknown): string {
	const prefix = `Cannot reach Ollama at ${baseUrl} (${operation}).`;
	const errno = getErrnoCode(err);
	if (errno === "ECONNREFUSED") {
		return `${prefix} Connection refused — start the daemon with: ollama serve`;
	}
	if (errno === "ENOTFOUND" || errno === "EAI_AGAIN") {
		return `${prefix} Host lookup failed (${errno}). Check the Ollama Base URL setting.`;
	}
	const msg = err instanceof Error ? err.message : String(err);
	if (msg === "fetch failed") {
		return `${prefix} Request failed (fetch failed). Verify Ollama is running on ${baseUrl} and run: ollama serve`;
	}
	return `${prefix} ${msg}`;
}
