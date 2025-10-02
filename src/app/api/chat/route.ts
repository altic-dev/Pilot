import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
  stepCountIs,
} from "ai";
import { posthogProjectRetrievalTool } from "@/tools/posthog-project-retrieval";

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    messages: convertToModelMessages(messages),
    tools: {
      projectRetrieval: posthogProjectRetrievalTool,
    },
    system: "You are a helpful assistant.",
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
