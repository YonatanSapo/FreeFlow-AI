import { OllamaClient } from "../ollama/client.js";
import { OllamaUnreachableError, SessionClosedError } from "../errors.js";
import { tagFromOllamaId, isOllamaId } from "../ollama/tags.js";
import type { GenerateChunkHandler } from "../ollama/types.js";

export { SessionClosedError, OllamaUnreachableError };

let sessionCounter = 0;

/**
 * A single chat conversation bound to one model.
 *
 * - `sendPrompt` streams tokens to `onChunk` and resolves to the full response.
 * - `close` aborts any in-flight request; subsequent `sendPrompt` calls throw `SessionClosedError`.
 */
export class ChatSession {
	private _closed = false;
	private _controller: AbortController | null = null;

	/** @internal — created by ChatManager */
	constructor(
		readonly id: string,
		readonly modelId: string,
		private readonly client: OllamaClient,
	) {}

	/** `true` after `close()` has been called. */
	public get closed(): boolean {
		return this._closed;
	}

	/**
	 * Send a prompt and stream the response.
	 *
	 * @throws {SessionClosedError} if the session is already closed.
	 * @throws {OllamaUnreachableError} if the daemon is not reachable.
	 */
	public async sendPrompt(text: string, onChunk?: GenerateChunkHandler): Promise<string> {
		if (this._closed) {
			throw new SessionClosedError(this.id);
		}

		const ac = new AbortController();
		this._controller = ac;
		try {
			const tag = isOllamaId(this.modelId)
				? tagFromOllamaId(this.modelId)
				: this.modelId;
			return await this.client.generate(tag, text, onChunk, ac.signal);
		} finally {
			// Only clear our own controller; if close() ran concurrently it already aborted.
			if (this._controller === ac) {
				this._controller = null;
			}
		}
	}

	/**
	 * Close the session. Aborts any in-flight `sendPrompt`; further calls to
	 * `sendPrompt` will throw `SessionClosedError`.
	 */
	public close(): void {
		this._closed = true;
		this._controller?.abort();
		this._controller = null;
	}
}

/**
 * Manages the set of active chat sessions.
 *
 * Each session is bound to one Ollama model. Multiple sessions for the same
 * model can coexist.
 */
export class ChatManager {
	private readonly sessions = new Map<string, ChatSession>();

	constructor(private readonly client: OllamaClient) {}

	/** Create a new chat session for `modelId`. */
	public createChat(modelId: string): ChatSession {
		const id = `session-${++sessionCounter}`;
		const session = new ChatSession(id, modelId, this.client);
		this.sessions.set(id, session);
		return session;
	}

	/** Return the session with the given id, or `undefined` if it does not exist. */
	public getSession(id: string): ChatSession | undefined {
		return this.sessions.get(id);
	}

	/**
	 * Close and discard the session with the given id.
	 * No-op if the id is unknown.
	 */
	public closeChat(id: string): void {
		const session = this.sessions.get(id);
		if (session) {
			session.close();
			this.sessions.delete(id);
		}
	}

	/** Close and discard all active sessions. */
	public closeAll(): void {
		for (const session of this.sessions.values()) {
			session.close();
		}
		this.sessions.clear();
	}
}
