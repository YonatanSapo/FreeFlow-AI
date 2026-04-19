import * as vscode from "vscode";
import { DEFAULT_OLLAMA_BASE_URL, OllamaService } from "./services/ollamaService";
import { SecretsService, CloudProviderId } from "./services/secretsService";
import { ModelRegistry } from "./services/modelRegistry";
import { Router } from "./services/router";
import { Logger } from "./services/logger";
import { ChatViewProvider } from "./ui/chatViewProvider";
import { ModelsViewProvider } from "./ui/modelsViewProvider";
import { KNOWN_LOCAL_MODELS } from "./services/modelRegistry";
import { GEMINI_ID, OPENAI_ID, PERPLEXITY_ID } from "./providers/cloud";

export function activate(context: vscode.ExtensionContext): void {
	const logger = new Logger();
	context.subscriptions.push({ dispose: () => logger.dispose() });

	const ollamaBaseUrl = (): string => {
		const v = vscode.workspace.getConfiguration().get<string>("promptrouter.ollamaBaseUrl");
		const trimmed = (v ?? "").trim();
		if (!trimmed) {
			return DEFAULT_OLLAMA_BASE_URL;
		}
		return trimmed.replace(/\/$/, "");
	};
	const ollama = new OllamaService(ollamaBaseUrl);
	const secrets = new SecretsService(context.secrets);
	const registry = new ModelRegistry(ollama, secrets);
	const router = new Router(registry);

	context.subscriptions.push({ dispose: () => secrets.dispose() });
	context.subscriptions.push({ dispose: () => registry.dispose() });

	const chatProvider = new ChatViewProvider(context, registry, router, logger);
	const modelsProvider = new ModelsViewProvider(context, registry, ollama, secrets, logger);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider),
		vscode.window.registerWebviewViewProvider(ModelsViewProvider.viewType, modelsProvider),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("promptrouter.openChat", async () => {
			await vscode.commands.executeCommand("workbench.view.extension.promptrouter");
			await vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`);
		}),
		vscode.commands.registerCommand("promptrouter.refreshModels", async () => {
			logger.show();
			logger.info("refreshModels: triggered by command");
			await registry.refresh();
			logger.info("refreshModels: done");
		}),
		vscode.commands.registerCommand("promptrouter.installModel", async () => {
			const tag = await vscode.window.showQuickPick(
				[...KNOWN_LOCAL_MODELS, "$custom"].map((t) =>
					t === "$custom" ? { label: "Custom tag…", detail: "Enter any Ollama model tag" } : { label: t },
				),
				{ title: "Install Ollama model", placeHolder: "Select a model tag" },
			);
			if (!tag) {
				return;
			}
			let chosen = tag.label;
			if (chosen === "Custom tag…") {
				const custom = await vscode.window.showInputBox({
					title: "Ollama model tag",
					placeHolder: "e.g. llama3.2:3b",
				});
				if (!custom) {
					return;
				}
				chosen = custom;
			}
			await modelsProvider.installModel(chosen);
		}),
		vscode.commands.registerCommand("promptrouter.removeModel", async () => {
			const list = await registry.list();
			const installed = list.filter((m) => m.type === "local" && m.status === "running");
			const pick = await vscode.window.showQuickPick(
				installed.map((m) => ({ label: m.displayName, id: m.id, tag: m.tag })),
				{ title: "Remove Ollama model" },
			);
			if (!pick || !pick.tag) {
				return;
			}
			await modelsProvider.removeModel(pick.tag);
		}),
		vscode.commands.registerCommand("promptrouter.setCloudKey", async () => {
			const providers: { label: string; id: CloudProviderId }[] = [
				{ label: "GPT (OpenAI)", id: OPENAI_ID },
				{ label: "Gemini (Google)", id: GEMINI_ID },
				{ label: "Perplexity (Search AI)", id: PERPLEXITY_ID },
			];
			const pick = await vscode.window.showQuickPick(providers, {
				title: "Set cloud provider API key",
			});
			if (!pick) {
				return;
			}
			await modelsProvider.setKey(pick.id);
		}),
	);

	void registry.refresh();

	logger.info("PromptRouter activated");
}

export function deactivate(): void {
	// nothing to clean up beyond context.subscriptions
}
