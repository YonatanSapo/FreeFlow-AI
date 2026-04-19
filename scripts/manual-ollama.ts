#!/usr/bin/env npx tsx
/**
 * Local-only CLI for exercising `src/core/` against a real Ollama daemon.
 * Not part of the published VS Code extension — for manual debugging only.
 *
 * Usage:
 *   npm run manual -- <command> [args...]
 *
 * Environment:
 *   OLLAMA_BASE_URL — default http://127.0.0.1:11434
 *
 * Examples:
 *   npm run manual -- health
 *   npm run manual -- list
 *   npm run manual -- ps
 *   npm run manual -- pull qwen2.5:0.5b
 *   npm run manual -- rm qwen2.5:0.5b
 *   npm run manual -- generate qwen2.5:0.5b "Say hi in one word"
 *   npm run manual -- models
 *   npm run manual -- chat ollama:qwen2.5:0.5b "Say hi in one word"
 */

import { OllamaClient, DEFAULT_OLLAMA_BASE_URL } from "../src/core/ollama/client.js";
import { ModelManager } from "../src/core/models/manager.js";
import { ChatManager } from "../src/core/chat/manager.js";

function baseUrl(): string {
	const fromEnv = (process.env.OLLAMA_BASE_URL ?? "").trim();
	return fromEnv ? fromEnv.replace(/\/$/, "") : DEFAULT_OLLAMA_BASE_URL;
}

function printHelp(): void {
	console.log(`manual-ollama — local Ollama CLI (uses src/core/)

  OLLAMA_BASE_URL   optional, default ${DEFAULT_OLLAMA_BASE_URL}

Commands:
  health              GET /api/tags probe (never throws)
  list                installed model tags from OllamaClient.list()
  ps                  in-memory models from OllamaClient.ps()
  models              merged catalog from ModelManager.list()
  pull <tag>          install / refresh a model (streaming progress to stderr)
  rm <tag>            delete a model
  generate <tag> <prompt>   one-shot generate (streams tokens to stderr)
  chat <modelId> <prompt>   ChatManager + ChatSession (e.g. ollama:qwen2.5:0.5b)
`);
}

function main(): void {
	const argv = process.argv.slice(2);
	const cmd = argv[0];

	if (!cmd || cmd === "-h" || cmd === "--help") {
		printHelp();
		process.exit(cmd ? 0 : 1);
	}

	const client = new OllamaClient({ baseUrl: baseUrl() });
	const models = new ModelManager(client);
	const chat = new ChatManager(client);

	const run = async (): Promise<void> => {
		switch (cmd) {
			case "health": {
				const h = await client.health();
				console.log(JSON.stringify(h, null, 2));
				return;
			}
			case "list": {
				const tags = await client.list();
				for (const t of tags) {
					console.log(`${t.name}\t${t.size}\t${t.modified}`);
				}
				return;
			}
			case "ps": {
				const rows = await client.ps();
				if (rows.length === 0) {
					console.log("(no models loaded in memory)");
					return;
				}
				for (const r of rows) {
					console.log(`${r.name}\t${r.model}\t${r.size}\t${r.digest}`);
				}
				return;
			}
			case "models": {
				const list = await models.list();
				for (const m of list) {
					console.log(`${m.id}\t${m.status}\t${m.displayName}`);
				}
				return;
			}
			case "pull": {
				const tag = argv[1];
				if (!tag) {
					console.error("usage: pull <tag>");
					process.exit(1);
				}
				await client.pull(tag, (p) => {
					const line = p.status
						? `${p.status}${p.completed !== undefined && p.total ? ` ${p.completed}/${p.total}` : ""}`
						: p.digest
							? `layer ${p.digest.slice(0, 12)}…`
							: JSON.stringify(p);
					console.error(line);
				});
				console.log("ok");
				return;
			}
			case "rm":
			case "delete": {
				const tag = argv[1];
				if (!tag) {
					console.error("usage: rm <tag>");
					process.exit(1);
				}
				await client.delete(tag);
				console.log("ok");
				return;
			}
			case "generate":
			case "run": {
				const tag = argv[1];
				const prompt = argv.slice(2).join(" ");
				if (!tag || !prompt) {
					console.error("usage: generate <tag> <prompt...>");
					process.exit(1);
				}
				process.stdout.write("<<<\n");
				const full = await client.generate(tag, prompt, (tok) => {
					process.stderr.write(tok);
				});
				process.stdout.write("\n>>>\n");
				process.stdout.write(full);
				process.stdout.write("\n");
				return;
			}
			case "chat": {
				const modelId = argv[1];
				const prompt = argv.slice(2).join(" ");
				if (!modelId || !prompt) {
					console.error("usage: chat <modelId> <prompt...>   e.g. chat ollama:qwen2.5:0.5b hello");
					process.exit(1);
				}
				const session = chat.createChat(modelId);
				try {
					process.stdout.write(`session ${session.id}\n<<<\n`);
					const full = await session.sendPrompt(prompt, (tok) => {
						process.stderr.write(tok);
					});
					process.stdout.write("\n>>>\n");
					process.stdout.write(full);
					process.stdout.write("\n");
				} finally {
					session.close();
				}
				return;
			}
			default:
				console.error(`unknown command: ${cmd}`);
				printHelp();
				process.exit(1);
		}
	};

	void run().catch((err: unknown) => {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	});
}

main();
