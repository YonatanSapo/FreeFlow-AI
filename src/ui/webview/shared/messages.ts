/**
 * Typed postMessage protocol between the extension host and each webview.
 *
 * Keep this file free of any vscode imports — it is bundled for the browser by
 * webpack and also imported by the extension host for type safety.
 */

export type ModelStatus = "installed" | "not-installed" | "unavailable";

export interface ModelInfo {
	readonly id: string;
	readonly displayName: string;
	readonly tag: string;
	readonly status: ModelStatus;
}

export interface RunningModel {
	readonly name: string;
	readonly model: string;
	readonly size: number;
}

export interface HealthState {
	readonly reachable: boolean;
	/** Node `process.platform` value — "darwin" | "win32" | "linux" */
	readonly platform: string;
	/** Last health-check failure message, persisted until the next successful check. */
	readonly lastError?: string;
}

// ---------------------------------------------------------------------------
// Chat webview
// ---------------------------------------------------------------------------

/** Messages sent from the extension host to the Chat webview. */
export type ExtToChat =
	| { type: "models"; list: ModelInfo[]; health: HealthState }
	| { type: "chunk"; id: string; delta: string }
	| { type: "done"; id: string }
	| { type: "error"; id: string; message: string };

/** Messages sent from the Chat webview to the extension host. */
export type ChatToExt =
	| { type: "ready" }
	| { type: "prompt"; id: string; modelId: string; text: string }
	| { type: "cancel"; id: string }
	| { type: "refresh" };

// ---------------------------------------------------------------------------
// Models webview
// ---------------------------------------------------------------------------

/** Messages sent from the extension host to the Models webview. */
export type ExtToModels =
	| { type: "models"; list: ModelInfo[]; running: RunningModel[]; health: HealthState }
	| { type: "refreshing"; on: boolean }
	| { type: "pullProgress"; modelId: string; status?: string; completed?: number; total?: number }
	| { type: "pullDone"; modelId: string }
	| { type: "pullError"; modelId: string; message: string }
	| { type: "info"; message: string }
	| { type: "error"; message: string };

/** Messages sent from the Models webview to the extension host. */
export type ModelsToExt =
	| { type: "ready" }
	| { type: "refresh" }
	| { type: "install"; tag: string }
	| { type: "remove"; tag: string };
