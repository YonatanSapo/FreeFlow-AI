import type { ModelInfo } from "../../../services/modelRegistry";

export type { ModelInfo };

export interface HealthState {
	readonly reachable: boolean;
	/** Node process.platform value, e.g. "darwin" | "win32" | "linux" */
	readonly platform: string;
}

export type ExtToChat =
	| { type: "models"; list: ModelInfo[]; health: HealthState }
	| { type: "chunk"; id: string; delta: string }
	| { type: "done"; id: string }
	| { type: "error"; id: string; message: string };

export type ChatToExt =
	| { type: "ready" }
	| { type: "prompt"; id: string; modelId: string; text: string }
	| { type: "cancel"; id: string }
	| { type: "refresh" };

export type ExtToModels =
	| { type: "models"; list: ModelInfo[]; health: HealthState }
	| { type: "pullProgress"; modelId: string; status: string; completed?: number; total?: number }
	| { type: "pullDone"; modelId: string }
	| { type: "pullError"; modelId: string; message: string }
	| { type: "info"; message: string }
	| { type: "error"; message: string };

export type ModelsToExt =
	| { type: "ready" }
	| { type: "refresh" }
	| { type: "install"; tag: string }
	| { type: "remove"; tag: string }
	| { type: "setKey"; modelId: string }
	| { type: "clearKey"; modelId: string };
