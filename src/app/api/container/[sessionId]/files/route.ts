import { NextRequest, NextResponse } from 'next/server';
import { listDirectory } from '@/lib/docker';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '/workspace';

    logger.info('Listing directory', { sessionId, path });

    const entries = await listDirectory(sessionId, path);

    return NextResponse.json(entries);
  } catch (error) {
    logger.error('Failed to list directory', { error });
    return NextResponse.json(
      { error: 'Failed to list directory' },
      { status: 500 }
    );
  }
}
