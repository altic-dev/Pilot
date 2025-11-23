import { anthropic } from "@ai-sdk/anthropic";
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

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  logger.info("Chat API called", {
    messageCount: messages.length,
    lastMessageRole: messages[messages.length - 1]?.role,
  });

  // Parse component context from the last user message if present
  let componentContext = null;
  let processedMessages = messages;

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    const textContent = lastMessage.parts
      ?.find((part: any) => part.type === "text")
      ?.text;

    if (textContent) {
      const componentMatch = textContent.match(
        /\[SELECTED COMPONENT\]\n([\s\S]*?)\n\n\[USER MESSAGE\]\n([\s\S]*)/
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

  // Augment system prompt with component context if available
  let enhancedSystemPrompt = systemPrompt;
  if (componentContext) {
    enhancedSystemPrompt = `${systemPrompt}

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

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
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
        toolNames: toolCalls?.map(tc => tc.toolName) || [],
        finishReason,
        usage,
      });

      // Log each tool call in detail
      toolCalls?.forEach((call, idx) => {
        logger.info(`Main agent tool call ${idx + 1}`, {
          toolName: call.toolName,
          args: 'args' in call ? call.args : call,
        });
      });

      // Log each tool result in detail  
      toolResults?.forEach((result, idx) => {
        const resultValue = 'result' in result ? result.result : result;
        const resultPreview = typeof resultValue === 'string'
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
