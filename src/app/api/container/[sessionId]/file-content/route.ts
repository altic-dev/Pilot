import { NextRequest, NextResponse } from 'next/server';
import { readFile } from '@/lib/docker';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    logger.info('Reading file', { sessionId, path });

    const content = await readFile(sessionId, path);

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  } catch (error) {
    logger.error('Failed to read file', { error });
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 500 }
    );
  }
}
