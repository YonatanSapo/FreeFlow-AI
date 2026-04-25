import * as vscode from "vscode";
import { ModelManager } from "../core/models/manager.js";
import type { Logger } from "../core/logging/logger.js";
import { buildWebviewHtml } from "./webviewUtils.js";
import type { ExtToModels, ModelsToExt } from "./webview/shared/messages.js";

export class ModelsViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "promptrouter.models";

	private view?: vscode.WebviewView;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly modelManager: ModelManager,
		private readonly logger: Logger & { show(): void },
	) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview")],
		};

		// Register the message listener BEFORE setting HTML so no messages are
		// dropped.  The webview script sends "ready" once all its own listeners
		// are attached — that is the authoritative signal that it is safe to push
		// state.  No timers, no visibility polling, no retry hacks.
		webviewView.webview.onDidReceiveMessage((msg: ModelsToExt) => {
			this.handleMessage(msg).catch((err) => {
				this.logger.error("models.handleMessage", err);
			});
		});

		webviewView.webview.html = this.renderHtml(webviewView.webview);
	}

	private async handleMessage(msg: ModelsToExt): Promise<void> {
		switch (msg.type) {
			case "ready":
			case "refresh": {
				this.logger.show();
				this.logger.info(`models ${msg.type}: start`);
				this.post({ type: "refreshing", on: true });
				try {
					await this.pushModels();
				} finally {
					this.post({ type: "refreshing", on: false });
					this.logger.info(`models ${msg.type}: done`);
				}
				return;
			}
			case "install":
				await this.installModel(msg.tag);
				return;
			case "remove":
				await this.removeModel(msg.tag);
				return;
		}
	}

	/** Trigger a models refresh from a VS Code command. */
	public async refresh(): Promise<void> {
		this.post({ type: "refreshing", on: true });
		try {
			await this.pushModels();
		} finally {
			this.post({ type: "refreshing", on: false });
		}
	}

	public async installModel(tag: string): Promise<void> {
		const modelId = `ollama:${tag}`;
		this.logger.show();
		this.logger.info(`install: requesting pull for ${tag}`);

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Installing Ollama model: ${tag}`,
					cancellable: true,
				},
				async (progress, token) => {
					let lastPct = 0;
					let lastLabel = "";
					await this.modelManager.install(tag, (p) => {
						if (token.isCancellationRequested) { return; }
						const pct = p.total && p.completed !== undefined
							? Math.round((p.completed / p.total) * 100)
							: undefined;
						const increment = pct !== undefined ? Math.max(0, pct - lastPct) : undefined;
						if (pct !== undefined) { lastPct = pct; }
						const label = p.status ?? (p.digest ? `downloading ${p.digest.slice(7, 19)}` : "downloading");
						const message = pct !== undefined ? `${label} (${pct}%)` : label;
						progress.report({ message, increment });
						if (label !== lastLabel || pct !== undefined) {
							this.logger.info(`pull ${tag}: ${message}`);
							lastLabel = label;
						}
						this.post({ type: "pullProgress", modelId, status: p.status, completed: p.completed, total: p.total });
					});
					if (token.isCancellationRequested) {
						this.logger.warn(`pull ${tag}: cancel requested`);
					}
				},
			);
			this.logger.info(`install: ${tag} complete`);
			this.post({ type: "pullDone", modelId });
			await this.pushModels();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`models.install tag=${tag}`, err);
			this.post({ type: "pullError", modelId, message });
			void vscode.window.showErrorMessage(`PromptRouter: ${message}`);
		} finally {
			await this.pushModels().catch(() => {});
		}
	}

	public async removeModel(tag: string): Promise<void> {
		this.logger.show();
		this.logger.info(`remove: deleting ${tag}`);
		try {
			await this.modelManager.remove(tag);
			this.logger.info(`remove: ${tag} done`);
			this.post({ type: "info", message: `Removed ${tag}` });
			await this.pushModels();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`models.remove tag=${tag}`, err);
			this.post({ type: "error", message });
			void vscode.window.showErrorMessage(`PromptRouter: ${message}`);
		}
	}

	private async pushModels(): Promise<void> {
		if (!this.view) { return; }
		try {
			const [models, running, probe] = await Promise.all([
				this.modelManager.list(),
				this.modelManager.ps(),
				this.modelManager.healthProbe(),
			]);
			this.post({
				type: "models",
				list: models,
				running,
				health: {
					reachable: probe.ok,
					platform: process.platform,
					lastError: probe.error,
				},
			});
		} catch (err) {
			this.logger.error("models.pushModels failed", err);
			this.post({
				type: "models",
				list: [],
				running: [],
				health: {
					reachable: false,
					platform: process.platform,
					lastError: err instanceof Error ? err.message : String(err),
				},
			});
		}
	}

	private post(message: ExtToModels): void {
		if (!this.view) {
			this.logger.warn(`models: dropping ${message.type} — webview not yet resolved`);
			return;
		}
		this.view.webview.postMessage(message).then(
			(ok) => {
				if (!ok) {
					this.logger.warn(`models: postMessage(${message.type}) returned false — panel hidden`);
				}
			},
			(err) => {
				this.logger.error(`models: postMessage(${message.type}) rejected`, err);
			},
		);
	}

	private renderHtml(webview: vscode.Webview): string {
		return buildWebviewHtml(this.context, webview, "models");
	}
}
