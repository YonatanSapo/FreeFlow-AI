import * as vscode from "vscode";
import { ChatManager } from "../core/chat/manager.js";
import { ModelManager } from "../core/models/manager.js";
import type { Logger } from "../core/logging/logger.js";
import { buildWebviewHtml } from "./webviewUtils.js";
import type { ChatToExt, ExtToChat } from "./webview/shared/messages.js";

export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "freeflow-ai.chat";

	private view?: vscode.WebviewView;
	/** Maps in-flight request id → AbortController so Cancel works. */
	private readonly inFlight = new Map<string, AbortController>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly chatManager: ChatManager,
		private readonly modelManager: ModelManager,
		private readonly logger: Logger & { show(): void },
	) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview")],
		};

		// Register listener BEFORE setting HTML — see ModelsViewProvider for rationale.
		webviewView.webview.onDidReceiveMessage((msg: ChatToExt) => {
			this.handleMessage(msg).catch((err) => {
				this.logger.error("chat.handleMessage", err);
			});
		});

		webviewView.webview.html = this.renderHtml(webviewView.webview);
	}

	/** Push a fresh model list to the Chat webview. Called by the host command and on ready/refresh. */
	public async refresh(): Promise<void> {
		this.post({ type: "refreshing", on: true });
		try {
			await this.pushModels();
		} finally {
			this.post({ type: "refreshing", on: false });
		}
	}

	private async handleMessage(msg: ChatToExt): Promise<void> {
		switch (msg.type) {
			case "ready":
			case "refresh": {
				this.logger.show();
				this.logger.info(`chat ${msg.type}: start`);
				await this.refresh();
				this.logger.info(`chat ${msg.type}: done`);
				return;
			}

			case "cancel": {
				const controller = this.inFlight.get(msg.id);
				if (controller) {
					controller.abort();
					this.inFlight.delete(msg.id);
				}
				return;
			}

			case "prompt":
				await this.handlePrompt(msg.id, msg.modelId, msg.text);
				return;
		}
	}

	private async handlePrompt(id: string, modelId: string, text: string): Promise<void> {
		const controller = new AbortController();
		this.inFlight.set(id, controller);

		const session = this.chatManager.createChat(modelId);
		try {
			await session.sendPrompt(text, (token) => {
				if (controller.signal.aborted) { return; }
				if (token) {
					this.post({ type: "chunk", id, delta: token });
				}
			});
			this.post({ type: "done", id });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`chat.prompt modelId=${modelId}`, err);
			this.post({ type: "error", id, message });
		} finally {
			session.close();
			this.inFlight.delete(id);
		}
	}

	private async pushModels(): Promise<void> {
		if (!this.view) { return; }
		try {
			const [models, probe] = await Promise.all([
				this.modelManager.list(),
				this.modelManager.healthProbe(),
			]);
			this.post({
				type: "models",
				list: models,
				health: {
					reachable: probe.ok,
					platform: process.platform,
					lastError: probe.error,
				},
			});
		} catch (err) {
			this.logger.error("chat.pushModels", err);
			this.post({
				type: "models",
				list: [],
				health: { reachable: false, platform: process.platform, lastError: String(err) },
			});
		}
	}

	private post(message: ExtToChat): void {
		if (!this.view) {
			this.logger.warn(`chat: dropping ${message.type} — webview not yet resolved`);
			return;
		}
		this.view.webview.postMessage(message).then(
			(ok) => {
				if (!ok) {
					this.logger.warn(`chat: postMessage(${message.type}) returned false — panel hidden`);
				}
			},
			(err) => {
				this.logger.error(`chat: postMessage(${message.type}) rejected`, err);
			},
		);
	}

	private renderHtml(webview: vscode.Webview): string {
		return buildWebviewHtml(this.context, webview, "chat");
	}
}
