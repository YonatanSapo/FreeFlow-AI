/** A model entry from `GET /api/tags`. */
export interface OllamaTag {
	readonly name: string;
	readonly size: number;
	readonly modified: string;
}

/** One event in the streaming NDJSON response for `POST /api/pull`. */
export interface PullProgress {
	/** Terminal status strings: "pulling manifest", "verifying sha256 digest", "writing manifest", "success". */
	readonly status?: string;
	readonly completed?: number;
	readonly total?: number;
	/** SHA-256 digest of the layer being downloaded (present on layer-download events). */
	readonly digest?: string;
	/** Inline stream error from Ollama (e.g. "model not found", registry rate limit). */
	readonly error?: string;
}

export type PullProgressHandler = (progress: PullProgress) => void;
export type GenerateChunkHandler = (token: string, done: boolean) => void;
