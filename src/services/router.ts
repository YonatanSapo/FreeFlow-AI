import { ModelProvider } from "../providers/modelProvider";
import { ModelRegistry } from "./modelRegistry";

/**
 * Thin facade so views don't need to know which concrete provider
 * class backs a given model id. Today it just delegates to the
 * registry, but it's the seam to add per-provider rate limiting,
 * retries, or logging in a single place.
 */
export class Router {
	constructor(private readonly registry: ModelRegistry) {}

	public resolve(modelId: string): Promise<ModelProvider> {
		return this.registry.resolve(modelId);
	}
}
