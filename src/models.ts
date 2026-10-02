import type { Api, Model } from "@earendil-works/pi-ai";
import { DEFAULT_ENDPOINT } from "pi-antigravity/src/client/index.ts";
import {
  applyAntigravityCatalog,
  getCurrentAntigravityModels,
  loadInitialAntigravityCatalog,
} from "pi-antigravity/src/models/index.ts";
import { discoverAntigravityModels } from "pi-antigravity/src/models/discovery.ts";
import { ANTIGRAVITY_API } from "pi-antigravity/src/types/types.ts";

loadInitialAntigravityCatalog();

export type OpenAIModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: "antigravity";
};

export function currentModels(): OpenAIModel[] {
  return getCurrentAntigravityModels().map((model) => ({
    id: model.id,
    object: "model",
    created: 0,
    owned_by: "antigravity",
  }));
}

export async function refreshModels(apiKey: string): Promise<OpenAIModel[]> {
  const discovered = await discoverAntigravityModels(apiKey);
  if (discovered.models.length) applyAntigravityCatalog(discovered);
  return currentModels();
}

export async function resolveModel(modelId: string, apiKey: string): Promise<Model<Api>> {
  let found = getCurrentAntigravityModels().find((model) => model.id === modelId);
  if (!found) {
    await refreshModels(apiKey);
    found = getCurrentAntigravityModels().find((model) => model.id === modelId);
  }
  if (!found) throw new Error(`Unknown or unavailable model: ${modelId}`);
  return {
    ...found,
    api: ANTIGRAVITY_API,
    provider: "antigravity",
    baseUrl: DEFAULT_ENDPOINT,
  } as Model<Api>;
}
