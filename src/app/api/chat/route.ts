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
} from "@/tools";
import systemPrompt from "@/prompts/system-prompt.md";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  logger.info("Chat API called", { 
    messageCount: messages.length,
    lastMessageRole: messages[messages.length - 1]?.role,
  });

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    messages: convertToModelMessages(messages),
    tools: {
      projectRetrieval: posthogProjectRetrievalTool,
      experimentCreation: posthogExperimentCreationTool,
      experimentCodeUpdate: experimentCodeUpdateTool,
    },
    system: systemPrompt,
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
