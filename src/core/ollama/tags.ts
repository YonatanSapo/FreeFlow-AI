/**
 * Normalise a bare tag like "phi3" to "phi3:latest" so it compares equal
 * to what Ollama's /api/tags endpoint actually returns.
 * Tags that already contain ":" (e.g. "llama3.2:3b", "phi3:latest") are
 * returned unchanged.
 */
export function canonicalTag(tag: string): string {
	return tag.includes(":") ? tag : `${tag}:latest`;
}

/** Build the stable model identifier used everywhere in this extension. */
export const OLLAMA_ID_PREFIX = "ollama:" as const;

export function ollamaModelId(tag: string): string {
	return `${OLLAMA_ID_PREFIX}${canonicalTag(tag)}`;
}

export function isOllamaId(id: string): boolean {
	return id.startsWith(OLLAMA_ID_PREFIX);
}

/** Extract the raw tag from an ollama model id. Throws if the id is not an ollama id. */
export function tagFromOllamaId(id: string): string {
	if (!isOllamaId(id)) {
		throw new Error(`Not an Ollama model id: "${id}"`);
	}
	return id.slice(OLLAMA_ID_PREFIX.length);
}
