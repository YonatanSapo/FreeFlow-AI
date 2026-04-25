/**
 * Pure unit tests for Ollama tag helpers — no network, no VS Code API.
 */

import * as assert from "assert";
import {
	canonicalTag,
	isOllamaId,
	ollamaModelId,
	tagFromOllamaId,
} from "../../core/ollama/tags.js";

suite("tags — unit", () => {
	test("canonicalTag: bare tag gets :latest", () => {
		assert.strictEqual(canonicalTag("phi3"), "phi3:latest");
	});

	test("canonicalTag: qualified tag unchanged", () => {
		assert.strictEqual(canonicalTag("llama3.2:3b"), "llama3.2:3b");
	});

	test("canonicalTag: multiple colons preserved", () => {
		assert.strictEqual(canonicalTag("registry.io/foo:bar:baz"), "registry.io/foo:bar:baz");
	});

	test("ollamaModelId: prefixes and canonicalises bare tag", () => {
		assert.strictEqual(ollamaModelId("phi"), "ollama:phi:latest");
	});

	test("isOllamaId: true for ollama-prefixed id", () => {
		assert.strictEqual(isOllamaId("ollama:phi3:latest"), true);
	});

	test("isOllamaId: false for non-ollama id", () => {
		assert.strictEqual(isOllamaId("openai:gpt-4"), false);
		assert.strictEqual(isOllamaId("phi3:latest"), false);
	});

	test("tagFromOllamaId: strips prefix", () => {
		assert.strictEqual(tagFromOllamaId("ollama:llama3.2:3b"), "llama3.2:3b");
	});

	test("tagFromOllamaId: throws on invalid id", () => {
		assert.throws(() => tagFromOllamaId("not-ollama"), /Not an Ollama model id/);
	});
});
