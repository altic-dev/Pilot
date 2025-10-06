import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
  stepCountIs,
} from "ai";
import { posthogProjectRetrievalTool, posthogExperimentCreationTool } from "@/tools";
import systemPrompt from "@/prompts/system-prompt.md";

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    messages: convertToModelMessages(messages),
    tools: {
      projectRetrieval: posthogProjectRetrievalTool,
      experimentCreation: posthogExperimentCreationTool,
    },
    system: systemPrompt,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
