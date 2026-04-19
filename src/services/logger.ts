import * as vscode from "vscode";

export class Logger {
	private readonly channel: vscode.OutputChannel;

	constructor(name = "PromptRouter") {
		this.channel = vscode.window.createOutputChannel(name);
	}

	public info(message: string): void {
		this.channel.appendLine(`[info] ${message}`);
	}

	public warn(message: string): void {
		this.channel.appendLine(`[warn] ${message}`);
	}

	public error(message: string, err?: unknown): void {
		const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : err ? String(err) : "";
		this.channel.appendLine(`[error] ${message}${detail ? `: ${detail}` : ""}`);
	}

	/** Reveal the PromptRouter output channel so the user sees live logs. */
	public show(preserveFocus = true): void {
		this.channel.show(preserveFocus);
	}

	public dispose(): void {
		this.channel.dispose();
	}
}
