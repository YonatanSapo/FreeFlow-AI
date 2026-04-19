/**
 * Shared test helpers for extension-host (vscode-test-electron) e2e tests.
 * All helpers are pure TS — no mocha/assert imports, so they can be reused
 * across multiple test suites.
 */
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SecretsService } from "../../services/secretsService";
import type { ExtToModels, ModelsToExt, ExtToChat, ChatToExt } from "../../ui/webview/shared/messages";

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

export interface FetchCall {
	url: string;
	method: string;
	body: unknown;
	init?: RequestInit;
}

/** JSON 200/non-200 response. */
export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/** NDJSON response where each element of `lines` becomes one JSON line. */
export function ndjsonResponse(lines: object[], status = 200): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
			}
			controller.close();
		},
	});
	return new Response(stream, {
		status,
		headers: { "content-type": "application/x-ndjson" },
	});
}

/**
 * Build a `fetch` stub that dispatches to per-path handlers.
 * The path key is matched as a substring of the full URL (e.g. "/api/tags").
 * Records every call so tests can make assertions about what was called.
 */
export function routedFetch(
	routes: Record<string, (call: FetchCall) => Response | Promise<Response>>,
): { fn: typeof fetch; calls: FetchCall[] } {
	const calls: FetchCall[] = [];
	const fn = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: (input as Request).url;
		const method = init?.method ?? "GET";
		let body: unknown;
		try {
			body = init?.body ? JSON.parse(init.body as string) : undefined;
		} catch {
			body = init?.body;
		}
		const call: FetchCall = { url, method, body, init };
		calls.push(call);

		const matchedKey = Object.keys(routes).find((k) => url.includes(k));
		if (!matchedKey) {
			throw new Error(`routedFetch: no handler for ${method} ${url}`);
		}
		return routes[matchedKey](call);
	}) as unknown as typeof fetch;
	return { fn, calls };
}

// ---------------------------------------------------------------------------
// VS Code shims
// ---------------------------------------------------------------------------

export function makeSecrets(): SecretsService {
	const map = new Map<string, string>();
	const store: vscode.SecretStorage = {
		get: async (k) => map.get(k),
		store: async (k, v) => {
			map.set(k, v);
		},
		delete: async (k) => {
			map.delete(k);
		},
		keys: async () => Array.from(map.keys()),
		onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event,
	};
	return new SecretsService(store);
}

export function makeExtensionContext(extensionRoot: string): vscode.ExtensionContext {
	const uri = vscode.Uri.file(extensionRoot);
	return {
		extensionUri: uri,
		extensionPath: extensionRoot,
		subscriptions: [],
		asAbsolutePath: (rel: string) => path.join(extensionRoot, rel),
	} as unknown as vscode.ExtensionContext;
}

export function getExtensionRoot(): string {
	const root = path.resolve(__dirname, "../../..");
	assert.ok(
		fs.existsSync(path.join(root, "dist", "webview", "models", "models.html")),
		"dist/webview/models/models.html missing — run `npm run package` or `npm run compile` before `npm test`",
	);
	return root;
}

// ---------------------------------------------------------------------------
// Fake WebviewView
// ---------------------------------------------------------------------------

export function fakeWebviewView(): {
	view: vscode.WebviewView;
	posted: ExtToModels[];
	receive: (msg: ModelsToExt) => void;
} {
	const posted: ExtToModels[] = [];
	const listeners: Array<(m: ModelsToExt) => void> = [];

	const webview = {
		options: {} as vscode.WebviewOptions,
		html: "",
		cspSource: "vscode-resource:",
		asWebviewUri: (u: vscode.Uri) => u,
		postMessage: async (m: ExtToModels): Promise<boolean> => {
			posted.push(m);
			return true;
		},
		onDidReceiveMessage: (cb: (m: ModelsToExt) => void): vscode.Disposable => {
			listeners.push(cb);
			return new vscode.Disposable(() => {
				const i = listeners.indexOf(cb);
				if (i >= 0) {
					listeners.splice(i, 1);
				}
			});
		},
	} as unknown as vscode.Webview;

	const view = {
		webview,
		visible: true,
		title: "Models",
		onDidDispose: () => new vscode.Disposable(() => {}),
	} as unknown as vscode.WebviewView;

	const receive = (msg: ModelsToExt): void => {
		for (const cb of listeners) {
			cb(msg);
		}
	};

	return { view, posted, receive };
}

// ---------------------------------------------------------------------------
// Fake Chat WebviewView
// ---------------------------------------------------------------------------

export function fakeChatWebviewView(): {
	view: vscode.WebviewView;
	posted: ExtToChat[];
	receive: (msg: ChatToExt) => void;
} {
	const posted: ExtToChat[] = [];
	const listeners: Array<(m: ChatToExt) => void> = [];

	const webview = {
		options: {} as vscode.WebviewOptions,
		html: "",
		cspSource: "vscode-resource:",
		asWebviewUri: (u: vscode.Uri) => u,
		postMessage: async (m: ExtToChat): Promise<boolean> => {
			posted.push(m);
			return true;
		},
		onDidReceiveMessage: (cb: (m: ChatToExt) => void): vscode.Disposable => {
			listeners.push(cb);
			return new vscode.Disposable(() => {
				const i = listeners.indexOf(cb);
				if (i >= 0) {
					listeners.splice(i, 1);
				}
			});
		},
	} as unknown as vscode.Webview;

	const view = {
		webview,
		visible: true,
		title: "Chat",
		onDidDispose: () => new vscode.Disposable(() => {}),
	} as unknown as vscode.WebviewView;

	const receive = (msg: ChatToExt): void => {
		for (const cb of listeners) {
			cb(msg);
		}
	};

	return { view, posted, receive };
}

// ---------------------------------------------------------------------------
// Async wait helpers
// ---------------------------------------------------------------------------

/** Poll until `cond()` returns true or timeout expires. */
export async function waitUntil(
	cond: () => boolean,
	timeoutMs = 10_000,
	label = "waitUntil",
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (cond()) {
			return;
		}
		await new Promise<void>((r) => setImmediate(r));
	}
	throw new Error(`${label}: timeout after ${timeoutMs}ms`);
}

/** Wait until the last posted message is `refreshing:false`. */
export async function waitForEndRefresh(posted: ExtToModels[]): Promise<void> {
	await waitUntil(
		() => {
			const last = posted[posted.length - 1];
			return last?.type === "refreshing" && last.on === false;
		},
		10_000,
		`waitForEndRefresh; posted types so far=${posted.map((p) => p.type).join(",")}`,
	);
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function modelsFrames(
	posted: ExtToModels[],
): Array<Extract<ExtToModels, { type: "models" }>> {
	return posted.filter(
		(m): m is Extract<ExtToModels, { type: "models" }> => m.type === "models",
	);
}

export function chatModelsFrames(
	posted: ExtToChat[],
): Array<Extract<ExtToChat, { type: "models" }>> {
	return posted.filter(
		(m): m is Extract<ExtToChat, { type: "models" }> => m.type === "models",
	);
}
