import {
  convertToModelMessages,
  streamText,
  type UIMessage,
  stepCountIs,
} from "ai";
import {
  posthogProjectRetrievalTool,
  posthogExperimentCreationTool,
  experimentCodeUpdateTool,
  textVariationTool,
  repoSetupTool,
} from "@/tools";
import systemPrompt from "@/prompts/system-prompt.md";
import { logger } from "@/lib/logger";
import {
  getModel,
  isProviderValid,
  ModelProvider,
  MODEL_CONFIGS,
} from "@/lib/model-provider";

export async function POST(request: Request) {
  const body = await request.json();
  const {
    messages,
    modelProvider,
  }: {
    messages: UIMessage[];
    modelProvider?: string;
  } = body;

  // Validate and sanitize model provider
  const provider: ModelProvider =
    modelProvider && isProviderValid(modelProvider) ? modelProvider : "sonnet"; // default fallback

  logger.info("Chat API called", {
    messageCount: messages.length,
    lastMessageRole: messages[messages.length - 1]?.role,
    modelProvider: provider,
  });

  // Parse component context from the last user message if present
  let componentContext = null;
  let processedMessages = messages;

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    const textPart = lastMessage.parts?.find(
      (part: any) => part.type === "text",
    ) as any;
    const textContent = textPart?.text;

    if (textContent) {
      const componentMatch = textContent.match(
        /\[SELECTED COMPONENT\]\n([\s\S]*?)\n\n\[USER MESSAGE\]\n([\s\S]*)/,
      );

      if (componentMatch) {
        try {
          componentContext = JSON.parse(componentMatch[1]);
          const userMessage = componentMatch[2];

          // Replace the last message with the extracted user message
          processedMessages = [
            ...messages.slice(0, -1),
            {
              ...lastMessage,
              parts: [
                {
                  type: "text",
                  text: userMessage,
                },
              ],
            },
          ];

          logger.info("Component context extracted", {
            componentName: componentContext.componentName,
            hasText: !!componentContext.text,
          });
        } catch (error) {
          logger.error("Failed to parse component context", { error });
        }
      }
    }
  }

  // Augment system prompt with component context and model provider info
  let enhancedSystemPrompt = systemPrompt;

  // Add model provider context to system prompt
  enhancedSystemPrompt = `${systemPrompt}

## Model Provider Context

You are currently using the ${MODEL_CONFIGS[provider].displayName} model.

**IMPORTANT:** When calling the following tools, you MUST include the modelProvider parameter set to "${provider}":
- textVariation tool
- experimentCodeUpdate tool

This ensures sub-agents use the same model for consistency.
`;

  if (componentContext) {
    enhancedSystemPrompt += `

## Selected Component Context

The user has selected a React component from the preview panel:

**Component Name:** ${componentContext.componentName}
**Tag:** ${componentContext.tagName}
**Text Content:** ${componentContext.text || "(no text)"}
**CSS Selector:** ${componentContext.selector}
${componentContext.className ? `**Classes:** ${componentContext.className}` : ""}
${componentContext.id ? `**ID:** ${componentContext.id}` : ""}
${componentContext.ariaLabel ? `**ARIA Label:** ${componentContext.ariaLabel}` : ""}
${componentContext.hierarchy?.length ? `**Hierarchy:** ${componentContext.hierarchy.map((h: any) => h.name).join(" > ")}` : ""}

When the user asks you to:
- **Generate variations**: Create variations appropriate for this component type (e.g., button copy, heading text, etc.)
- **Create an experiment**: Use this component as the target for the A/B test
- **Modify code**: Target this specific component using the selector and hierarchy information

The selected component provides important context for understanding what the user wants to modify or experiment with.
`;
  }

  // Get the model instance based on provider
  const model = getModel(provider);

  const result = streamText({
    model, // Use selected model instead of hardcoded
    messages: convertToModelMessages(processedMessages),
    tools: {
      repoSetup: repoSetupTool,
      projectRetrieval: posthogProjectRetrievalTool,
      textVariation: textVariationTool,
      experimentCreation: posthogExperimentCreationTool,
      experimentCodeUpdate: experimentCodeUpdateTool,
    },
    system: enhancedSystemPrompt,
    stopWhen: stepCountIs(20),
    onStepFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
      logger.info("Main agent step completed", {
        textPreview: text ? text.substring(0, 200) : "(no text)",
        toolCallsCount: toolCalls?.length || 0,
        toolNames: toolCalls?.map((tc) => tc.toolName) || [],
        finishReason,
        usage,
        modelProvider: provider,
      });

      // Log each tool call in detail
      toolCalls?.forEach((call, idx) => {
        logger.info(`Main agent tool call ${idx + 1}`, {
          toolName: call.toolName,
          args: "args" in call ? call.args : call,
        });
      });

      // Log each tool result in detail
      toolResults?.forEach((result, idx) => {
        const resultValue = "result" in result ? result.result : result;
        const resultPreview =
          typeof resultValue === "string"
            ? resultValue.substring(0, 500)
            : JSON.stringify(resultValue).substring(0, 500);

        logger.info(`Main agent tool result ${idx + 1}`, {
          toolName: result.toolName,
          result: resultPreview,
        });
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
