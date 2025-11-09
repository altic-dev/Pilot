import { NextRequest } from "next/server";
import { progressStore, type ProgressMessage } from "@/lib/progress-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const { executionId } = await params;

  logger.info("SSE connection requested", { executionId });

  // Check if execution exists
  if (!progressStore.exists(executionId)) {
    logger.warn("Execution not found", { executionId });
    return new Response("Execution not found", { status: 404 });
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send SSE message helper
      const sendMessage = (message: ProgressMessage) => {
        const data = JSON.stringify(message);
        const sseMessage = `data: ${data}\n\n`;
        controller.enqueue(encoder.encode(sseMessage));
      };

      // Send all existing messages first
      const existingMessages = progressStore.getMessages(executionId);
      existingMessages.forEach(sendMessage);

      // Subscribe to new progress updates only (don't send existing again)
      const unsubscribe = progressStore.subscribe(executionId, sendMessage, false);

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        logger.info("SSE connection closed by client", { executionId });
        unsubscribe();
        controller.close();
      });

      // Check if already completed and close connection
      if (progressStore.isCompleted(executionId)) {
        logger.info("Execution already completed, closing SSE", { executionId });
        setTimeout(() => {
          unsubscribe();
          controller.close();
        }, 100);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

