import { NextResponse } from "next/server";
import { cleanupOrphanedContainers } from "@/lib/docker";
import { logger } from "@/lib/logger";

/**
 * POST /api/cleanup
 * Cleanup all orphaned Docker containers
 */
export async function POST() {
  try {
    logger.info("Cleanup endpoint called");

    await cleanupOrphanedContainers();

    logger.info("Cleanup completed successfully");

    return NextResponse.json({
      success: true,
      message: "Orphaned containers cleaned up successfully",
    });
  } catch (error) {
    logger.error("Cleanup failed", {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
      } : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
