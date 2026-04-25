/**
 * Models webview — thin controller.
 *
 * Boots the UI modules, signals "ready" to the extension host, then
 * handles incoming ExtToModels messages by delegating to modules.
 *
 * NO timers, NO polling, NO visibility guessing.  The extension host
 * pushes state once it receives the "ready" handshake.
 */

import type { ExtToModels, ModelsToExt } from "../shared/messages";
import { createStatusIndicator } from "./modules/statusIndicator";
import { createModelList } from "./modules/modelList";
import { createToast } from "./modules/toast";

interface VsCodeApi {
	postMessage(msg: ModelsToExt): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

function post(msg: ModelsToExt): void {
	vscodeApi.postMessage(msg);
}

// Platform is stamped into the HTML element by the extension host so the
// install instructions section can render instantly before the first `models`
// frame arrives.
const platform = document.documentElement.dataset.platform ?? "linux";

const statusIndicator = createStatusIndicator(
	document.getElementById("ollamaDot") as HTMLSpanElement,
	document.getElementById("ollamaStatus") as HTMLSpanElement,
	document.getElementById("ollamaInstructions") as HTMLElement,
);

const modelList = createModelList(
	document.getElementById("localList") as HTMLUListElement,
	(tag) => post({ type: "install", tag }),
	(tag) => post({ type: "remove", tag }),
);

const toast = createToast(document.getElementById("toast") as HTMLElement);

window.addEventListener("message", (event: MessageEvent<ExtToModels>) => {
	const msg = event.data;
	switch (msg.type) {
		case "models":
			modelList.render(msg.list);
			if (msg.health.reachable) {
				statusIndicator.setRunning();
			} else {
				statusIndicator.setDown(msg.health.platform ?? platform, msg.health.lastError);
			}
			return;

		case "pullProgress":
			modelList.setProgress(msg.modelId, msg.status, msg.completed, msg.total);
			return;

		case "pullDone":
			modelList.clearProgress(msg.modelId);
			toast.show("Installation complete");
			return;

		case "pullError":
			modelList.clearProgress(msg.modelId);
			toast.show(`Installation failed: ${msg.message}`, "error");
			return;

		case "info":
			toast.show(msg.message, "info");
			return;

		case "error":
			toast.show(msg.message, "error");
			return;
	}
});

// Show "Checking…" immediately — the real status arrives in the first `models`
// frame after the extension host handles our "ready" message below.
statusIndicator.setInitializing();

// Canonical handshake: tell the extension host our listeners are attached.
post({ type: "ready" });

// Signal for E2E tests: the script has fully initialised.
document.documentElement.setAttribute("data-models-ready", "1");
