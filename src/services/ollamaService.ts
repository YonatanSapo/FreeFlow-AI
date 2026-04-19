export interface OllamaTag {
	readonly name: string;
	readonly size: number;
	readonly modified: string;
}

export interface PullProgress {
	/** Terminal status strings: "pulling manifest", "verifying sha256 digest", "writing manifest", "success", etc.
	 *  Omitted on layer-download progress events in Ollama >= 0.3 (those use `digest` instead). */
	readonly status?: string;
	readonly completed?: number;
	readonly total?: number;
	/** SHA-256 digest of the layer being downloaded — present on layer-download events (no `status`). */
	readonly digest?: string;
	/** Inline stream error from Ollama (e.g. model not found, registry rate limit). */
	readonly error?: string;
}

export type PullProgressHandler = (progress: PullProgress) => void;
export type GenerateChunkHandler = (token: string, done: boolean) => void;

/** Default Ollama HTTP API base. Prefer IPv4 loopback — `localhost` can resolve to ::1 while Ollama listens on IPv4 only, which surfaces as `fetch failed`. */
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export type OllamaBaseUrlSource = string | (() => string);

/**
 * Normalize a bare tag like "phi3" to "phi3:latest" so it compares equal
 * to what Ollama's /api/tags endpoint actually returns.
 * Tags that already contain ":" (e.g. "llama3.2:3b", "phi3:latest") are
 * returned unchanged.
 */
export function canonicalOllamaTag(tag: string): string {
	return tag.includes(":") ? tag : `${tag}:latest`;
}

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

/**
 * Human-readable explanation for undici/Node `fetch` failures talking to Ollama.
 */
export function formatOllamaConnectionError(baseUrl: string, operation: string, err: unknown): string {
	const errno = getErrnoCode(err);
	const prefix = `Cannot reach Ollama at ${baseUrl} (${operation}).`;
	if (errno === "ECONNREFUSED") {
		return `${prefix} Connection refused — start the daemon with: ollama serve`;
	}
	if (errno === "ENOTFOUND" || errno === "EAI_AGAIN") {
		return `${prefix} Host lookup or DNS failed (${errno}). Check **PromptRouter: Ollama Base URL** in settings.`;
	}
	const msg = err instanceof Error ? err.message : String(err);
	if (msg === "fetch failed") {
		return `${prefix} Request failed (fetch failed). If Ollama is running, set **PromptRouter: Ollama Base URL** to the URL it prints (often http://127.0.0.1:11434) and run ollama serve.`;
	}
	return `${prefix} ${msg}`;
}

/**
 * Thin HTTP client for a locally running Ollama daemon.
 *
 * Uses the global `fetch` and WHATWG streams that ship with Node 18+.
 * Never throws from `health()`; every other method surfaces network
 * failures explicitly so callers can log/report them.
 */
export class OllamaService {
	constructor(
		private readonly baseUrl: OllamaBaseUrlSource = DEFAULT_OLLAMA_BASE_URL,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	private resolveBaseUrl(): string {
		const raw = typeof this.baseUrl === "function" ? this.baseUrl() : this.baseUrl;
		const trimmed = (raw ?? "").trim() || DEFAULT_OLLAMA_BASE_URL;
		return trimmed.replace(/\/$/, "");
	}

	private async request(operation: string, url: string, init?: RequestInit): Promise<Response> {
		const base = this.resolveBaseUrl();
		try {
			return await this.fetchImpl(url, init);
		} catch (err) {
			throw new Error(formatOllamaConnectionError(base, operation, err), { cause: err });
		}
	}

	/** Returns an AbortSignal that fires after `timeoutMs` and a `clear` function to cancel the timer. */
	private timeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), timeoutMs);
		return { signal: ac.signal, clear: () => clearTimeout(timer) };
	}

	public async health(): Promise<boolean> {
		return (await this.healthProbe()).ok;
	}

	/**
	 * Probe the daemon and return both the ok flag and any error message.
	 * Useful so the UI can surface the last failure reason persistently.
	 */
	public async healthProbe(): Promise<{ ok: boolean; error?: string }> {
		const base = this.resolveBaseUrl();
		const { signal, clear } = this.timeoutSignal(8_000);
		try {
			const res = await this.fetchImpl(`${base}/api/tags`, { signal });
			if (res.ok) {
				return { ok: true };
			}
			return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
		} catch (err) {
			const msg = err instanceof Error && err.name === "AbortError"
				? `Cannot reach Ollama at ${base} (health). Request timed out after 8 s — is the daemon running? Try: ollama serve`
				: formatOllamaConnectionError(base, "health", err);
			return { ok: false, error: msg };
		} finally {
			clear();
		}
	}

	public async listModels(): Promise<OllamaTag[]> {
		const base = this.resolveBaseUrl();
		const { signal, clear } = this.timeoutSignal(10_000);
		let res: Response;
		try {
			res = await this.request("list models", `${base}/api/tags`, { signal });
		} finally {
			clear();
		}
		if (!res.ok) {
			throw new Error(`Ollama listModels failed: ${res.status} ${res.statusText}`);
		}
		const body = (await res.json()) as { models?: Array<{ name: string; size: number; modified_at: string }> };
		const models = body.models ?? [];
		return models.map((m) => ({ name: m.name, size: m.size, modified: m.modified_at }));
	}

	public async delete(model: string): Promise<void> {
		const base = this.resolveBaseUrl();
		const res = await this.request("delete model", `${base}/api/delete`, {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: model }),
		});
		if (!res.ok) {
			throw new Error(`Ollama delete failed: ${res.status} ${res.statusText}`);
		}
	}

	public async pull(model: string, onProgress?: PullProgressHandler): Promise<void> {
		const base = this.resolveBaseUrl();
		const res = await this.request("pull model", `${base}/api/pull`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: model, stream: true }),
		});
		if (!res.ok || !res.body) {
			throw new Error(`Ollama pull failed: ${res.status} ${res.statusText}`);
		}

		let finished = false;
		await this.consumeNdjson<PullProgress>(res.body, (event) => {
			if (event.error) {
				throw new Error(`Ollama pull: ${event.error}`);
			}
			if (onProgress) {
				onProgress(event);
			}
			if (event.status === "success") {
				finished = true;
			}
		});

		if (!finished) {
			throw new Error(`Ollama pull did not complete for model "${model}"`);
		}
	}

	public async generate(model: string, prompt: string, onChunk?: GenerateChunkHandler): Promise<string> {
		const base = this.resolveBaseUrl();
		const res = await this.request("generate", `${base}/api/generate`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model, prompt, stream: true }),
		});
		if (!res.ok || !res.body) {
			throw new Error(`Ollama generate failed: ${res.status} ${res.statusText}`);
		}

		let full = "";
		await this.consumeNdjson<{ response?: string; done?: boolean; error?: string }>(res.body, (event) => {
			if (event.error) {
				throw new Error(`Ollama generate error: ${event.error}`);
			}
			const token = event.response ?? "";
			full += token;
			if (onChunk) {
				onChunk(token, Boolean(event.done));
			}
		});
		return full;
	}

	private async consumeNdjson<T>(
		body: ReadableStream<Uint8Array>,
		onEvent: (event: T) => void,
	): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { value, done } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			let newlineIdx: number;
			while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
				const rawLine = buffer.slice(0, newlineIdx).trim();
				buffer = buffer.slice(newlineIdx + 1);
				if (!rawLine) {
					continue;
				}
				onEvent(JSON.parse(rawLine) as T);
			}
		}
		const tail = buffer.trim();
		if (tail) {
			onEvent(JSON.parse(tail) as T);
		}
	}
}
