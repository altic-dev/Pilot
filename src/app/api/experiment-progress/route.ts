import { NextRequest, NextResponse } from "next/server";
import { progressStore } from "@/lib/progress-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { inputHash } = await request.json();

    if (!inputHash) {
      return NextResponse.json({ error: "inputHash is required" }, { status: 400 });
    }

    const executionId = progressStore.getExecutionIdByInputHash(inputHash);

    if (!executionId) {
      return NextResponse.json({ executionId: null }, { status: 200 });
    }

    logger.info("Execution ID lookup successful", { inputHash, executionId });
    return NextResponse.json({ executionId }, { status: 200 });
  } catch (error) {
    logger.error("Failed to lookup execution ID", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

