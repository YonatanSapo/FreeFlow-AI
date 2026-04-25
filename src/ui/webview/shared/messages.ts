/**
 * Typed postMessage protocol between the extension host and each webview.
 *
 * Keep this file free of any vscode imports — it is bundled for the browser by
 * webpack and also imported by the extension host for type safety.
 *
 * Domain types (ModelStatus, ModelInfo, RunningModel) are re-exported from
 * core/models/manager so the webview protocol always stays in sync with the
 * core domain model — a single source of truth.
 */

import type { ModelStatus, ModelInfo, RunningModel } from "../../../core/models/manager.js";
export type { ModelStatus, ModelInfo, RunningModel };

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
	| { type: "refreshing"; on: boolean }
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
