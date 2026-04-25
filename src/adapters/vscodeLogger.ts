import * as vscode from "vscode";
import type { Logger } from "../core/logging/logger.js";

/**
 * `Logger` implementation backed by a VS Code `OutputChannel`.
 */
export class VSCodeLogger implements Logger {
	private readonly channel: vscode.OutputChannel;

	constructor(name = "PromptRouter") {
		this.channel = vscode.window.createOutputChannel(name);
	}

	public info(message: string): void {
		this.channel.appendLine(`[info]  ${message}`);
	}

	public warn(message: string): void {
		this.channel.appendLine(`[warn]  ${message}`);
	}

	public error(message: string, err?: unknown): void {
		const detail = err instanceof Error
			? `${err.message}\n${err.stack ?? ""}`
			: err !== undefined
				? String(err)
				: "";
		this.channel.appendLine(`[error] ${message}${detail ? `: ${detail}` : ""}`);
	}

	/** Reveal the output channel so the user can see live logs. */
	public show(preserveFocus = true): void {
		this.channel.show(preserveFocus);
	}

	public dispose(): void {
		this.channel.dispose();
	}
}
