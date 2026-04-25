import { OllamaHttpError, OllamaUnreachableError } from "../errors.js";
import type { GenerateChunkHandler, OllamaTag, PullProgress, PullProgressHandler } from "./types.js";

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export interface OllamaClientOptions {
	/**
	 * Base URL for the Ollama HTTP API.
	 * Accepts a plain string or a zero-argument factory called before every
	 * request so the URL can follow a VS Code configuration setting at runtime.
	 */
	baseUrl?: string | (() => string);
	/**
	 * Inject a custom `fetch` implementation — used in tests to wrap the
	 * real fetch without replacing it entirely.
	 */
	fetch?: typeof fetch;
}

/**
 * Thin HTTP client for a locally running Ollama daemon.
 *
 * All methods except `health()` throw typed errors from `core/errors.ts`.
 * `health()` never throws; it always resolves to `{ ok, error? }`.
 */
export class OllamaClient {
	private readonly baseUrlSource: string | (() => string);
	private readonly fetchImpl: typeof fetch;

	constructor(options: OllamaClientOptions = {}) {
		this.baseUrlSource = options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
		this.fetchImpl = options.fetch ?? globalThis.fetch;
	}

	private resolveBaseUrl(): string {
		const raw = typeof this.baseUrlSource === "function"
			? this.baseUrlSource()
			: this.baseUrlSource;
		return (raw ?? "").trim().replace(/\/$/, "") || DEFAULT_OLLAMA_BASE_URL;
	}

	/**
	 * Wraps fetch so network errors become `OllamaUnreachableError`.
	 * AbortErrors are re-thrown as-is so callers can distinguish cancellation.
	 */
	private async doFetch(operation: string, url: string, init?: RequestInit): Promise<Response> {
		const base = this.resolveBaseUrl();
		try {
			return await this.fetchImpl(url, init);
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				throw err;
			}
			throw new OllamaUnreachableError(base, operation, err);
		}
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/** Probe the daemon. Never throws — always resolves to `{ ok, error? }`. */
	public async health(): Promise<{ ok: boolean; error?: string }> {
		const base = this.resolveBaseUrl();
		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), 8_000);
		try {
			const res = await this.fetchImpl(`${base}/api/tags`, { signal: ac.signal });
			return res.ok
				? { ok: true }
				: { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				return { ok: false, error: `Request timed out after 8 s — is Ollama running? Try: ollama serve` };
			}
			return { ok: false, error: new OllamaUnreachableError(base, "health", err).message };
		} finally {
			clearTimeout(timer);
		}
	}

	/** List all locally installed models (`GET /api/tags`). */
	public async list(): Promise<OllamaTag[]> {
		const base = this.resolveBaseUrl();
		const res = await this.doFetch("list", `${base}/api/tags`);
		if (!res.ok) {
			throw new OllamaHttpError("list", res.status, res.statusText);
		}
		const body = await res.json() as { models?: Array<{ name: string; size: number; modified_at: string }> };
		return (body.models ?? []).map((m) => ({ name: m.name, size: m.size, modified: m.modified_at }));
	}

	/**
	 * Pull (install) a model.
	 * Progress events are forwarded to `onProgress` if provided.
	 * Pass an `AbortSignal` to cancel the request.
	 */
	public async pull(tag: string, onProgress?: PullProgressHandler, signal?: AbortSignal): Promise<void> {
		const base = this.resolveBaseUrl();
		const res = await this.doFetch("pull", `${base}/api/pull`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: tag, stream: true }),
			signal,
		});
		if (!res.ok || !res.body) {
			throw new OllamaHttpError("pull", res.status, res.statusText);
		}

		let finished = false;
		await this.consumeNdjson<PullProgress>(res.body, (event) => {
			if (event.error) {
				throw new Error(`Ollama pull: ${event.error}`);
			}
			onProgress?.(event);
			if (event.status === "success") {
				finished = true;
			}
		});

		if (!finished) {
			throw new Error(`Ollama pull did not complete for model "${tag}"`);
		}
	}

	/** Delete a model (`DELETE /api/delete`). */
	public async delete(tag: string): Promise<void> {
		const base = this.resolveBaseUrl();
		const res = await this.doFetch("delete", `${base}/api/delete`, {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: tag }),
		});
		if (!res.ok) {
			throw new OllamaHttpError("delete", res.status, res.statusText);
		}
	}

	/**
	 * Run inference and stream tokens back.
	 * Pass an `AbortSignal` to cancel mid-stream.
	 */
	public async generate(
		tag: string,
		prompt: string,
		onChunk?: GenerateChunkHandler,
		signal?: AbortSignal,
	): Promise<string> {
		const base = this.resolveBaseUrl();
		const res = await this.doFetch("generate", `${base}/api/generate`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: tag, prompt, stream: true }),
			signal,
		});
		if (!res.ok || !res.body) {
			throw new OllamaHttpError("generate", res.status, res.statusText);
		}

		let full = "";
		await this.consumeNdjson<{ response?: string; done?: boolean; error?: string }>(res.body, (event) => {
			if (event.error) {
				throw new Error(`Ollama generate error: ${event.error}`);
			}
			const token = event.response ?? "";
			full += token;
			onChunk?.(token, Boolean(event.done));
		});
		return full;
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

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
			let idx: number;
			while ((idx = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, idx).trim();
				buffer = buffer.slice(idx + 1);
				if (line) {
					onEvent(JSON.parse(line) as T);
				}
			}
		}
		const tail = buffer.trim();
		if (tail) {
			onEvent(JSON.parse(tail) as T);
		}
	}
}
