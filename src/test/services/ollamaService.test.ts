import * as assert from "assert";
import { OllamaService } from "../../services/ollamaService";

type FetchCall = { url: string; init?: RequestInit };

function streamFromLines(lines: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(line + "\n"));
			}
			controller.close();
		},
	});
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function streamResponse(lines: string[], status = 200): Response {
	return new Response(streamFromLines(lines), {
		status,
		headers: { "content-type": "application/x-ndjson" },
	});
}

function stubFetch(handlers: Array<(call: FetchCall) => Response | Promise<Response>>): {
	fn: typeof fetch;
	calls: FetchCall[];
} {
	const calls: FetchCall[] = [];
	let i = 0;
	const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
		calls.push({ url, init });
		const handler = handlers[Math.min(i, handlers.length - 1)];
		i++;
		return handler({ url, init });
	}) as unknown as typeof fetch;
	return { fn, calls };
}

suite("OllamaService", () => {
	test("health returns true on 200", async () => {
		const { fn } = stubFetch([() => jsonResponse({ models: [] })]);
		const svc = new OllamaService("http://localhost:11434", fn);
		assert.strictEqual(await svc.health(), true);
	});

	test("health returns false when fetch throws", async () => {
		const throwingFetch = (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch;
		const svc = new OllamaService("http://localhost:11434", throwingFetch);
		assert.strictEqual(await svc.health(), false);
	});

	test("listModels surfaces a clearer message when fetch fails (e.g. ECONNREFUSED)", async () => {
		const cause = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
		const fn = (async () => {
			throw new TypeError("fetch failed", { cause });
		}) as unknown as typeof fetch;
		const svc = new OllamaService("http://127.0.0.1:11434", fn);
		await assert.rejects(
			async () => svc.listModels(),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.match((err as Error).message, /Connection refused/);
				assert.match((err as Error).message, /ollama serve/);
				return true;
			},
		);
	});

	test("listModels maps the /api/tags payload", async () => {
		const { fn } = stubFetch([
			() =>
				jsonResponse({
					models: [
						{ name: "llama3.2:3b", size: 1000, modified_at: "2024-01-01" },
						{ name: "phi-3", size: 2000, modified_at: "2024-02-02" },
					],
				}),
		]);
		const svc = new OllamaService("http://localhost:11434", fn);
		const list = await svc.listModels();
		assert.deepStrictEqual(list, [
			{ name: "llama3.2:3b", size: 1000, modified: "2024-01-01" },
			{ name: "phi-3", size: 2000, modified: "2024-02-02" },
		]);
	});

	test("generate streams NDJSON tokens, concatenates, and calls onChunk", async () => {
		const { fn } = stubFetch([
			() =>
				streamResponse([
					JSON.stringify({ response: "Hello", done: false }),
					JSON.stringify({ response: ", ", done: false }),
					JSON.stringify({ response: "world!", done: true }),
				]),
		]);
		const svc = new OllamaService("http://localhost:11434", fn);
		const chunks: Array<{ token: string; done: boolean }> = [];
		const full = await svc.generate("llama3.2:3b", "hi", (token, done) => {
			chunks.push({ token, done });
		});
		assert.strictEqual(full, "Hello, world!");
		assert.deepStrictEqual(chunks, [
			{ token: "Hello", done: false },
			{ token: ", ", done: false },
			{ token: "world!", done: true },
		]);
	});

	test("pull forwards progress and resolves on status success", async () => {
		const { fn } = stubFetch([
			() =>
				streamResponse([
					JSON.stringify({ status: "pulling manifest" }),
					JSON.stringify({ status: "downloading", completed: 50, total: 100 }),
					JSON.stringify({ status: "success" }),
				]),
		]);
		const svc = new OllamaService("http://localhost:11434", fn);
		const events: (string | undefined)[] = [];
		await svc.pull("phi-3", (progress) => {
			events.push(progress.status);
		});
		assert.deepStrictEqual(events, ["pulling manifest", "downloading", "success"]);
	});

	test("pull throws when stream ends without success", async () => {
		const { fn } = stubFetch([
			() => streamResponse([JSON.stringify({ status: "downloading", completed: 10, total: 100 })]),
		]);
		const svc = new OllamaService("http://localhost:11434", fn);
		await assert.rejects(() => svc.pull("phi-3"), /did not complete/);
	});

	test("delete issues DELETE with model name", async () => {
		const { fn, calls } = stubFetch([() => new Response(null, { status: 200 })]);
		const svc = new OllamaService("http://localhost:11434", fn);
		await svc.delete("phi-3");
		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].init?.method, "DELETE");
		assert.ok(typeof calls[0].init?.body === "string" && calls[0].init!.body.includes("phi-3"));
	});
});
