import * as vscode from "vscode";
import { DEFAULT_OLLAMA_BASE_URL } from "../core/ollama/client.js";

/**
 * Returns the Ollama base URL from VS Code settings, falling back to the
 * default IPv4 loopback address.  Intended to be passed as the `baseUrl`
 * factory to `OllamaClient` so the URL is re-read before every request.
 */
export function getOllamaBaseUrl(): string {
	const configured = vscode.workspace
		.getConfiguration()
		.get<string>("freeflow-ai.ollamaBaseUrl");
	const trimmed = (configured ?? "").trim();
	return trimmed ? trimmed.replace(/\/$/, "") : DEFAULT_OLLAMA_BASE_URL;
}
