import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { logger } from "@/lib/logger";

export type ModelProvider = "claude" | "lmstudio";

export interface ModelConfig {
  provider: ModelProvider;
  displayName: string;
  modelId: string;
}

export const MODEL_CONFIGS: Record<ModelProvider, ModelConfig> = {
  claude: {
    provider: "claude",
    displayName: "Claude Sonnet 4.5",
    modelId: "claude-sonnet-4-5",
  },
  lmstudio: {
    provider: "lmstudio",
    displayName: "gpt-oss-20b (LM Studio)",
    modelId: "openai/gpt-oss-20b",
  },
};

// Initialize LM Studio provider (singleton)
const lmstudioProvider = createOpenAICompatible({
  name: "lmstudio",
  baseURL: "http://127.0.0.1:1234/v1",
});

/**
 * Get the appropriate model instance based on provider selection
 */
export function getModel(provider: ModelProvider) {
  logger.info("Getting model provider", { provider });

  switch (provider) {
    case "claude":
      return anthropic("claude-sonnet-4-5");
    case "lmstudio":
      return lmstudioProvider("openai/gpt-oss-20b");
    default:
      logger.warn("Unknown provider, defaulting to Claude", { provider });
      return anthropic("claude-sonnet-4-5");
  }
}

/**
 * Validate that the selected provider is available
 */
export function isProviderValid(provider: string): provider is ModelProvider {
  return provider === "claude" || provider === "lmstudio";
}

/**
 * Health check for LM Studio (optional, for future use)
 */
export async function checkLMStudioHealth(): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:1234/v1/models", {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    logger.error("LM Studio health check failed", { error });
    return false;
  }
}
