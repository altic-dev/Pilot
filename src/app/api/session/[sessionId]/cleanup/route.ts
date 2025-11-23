import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/lib/session-store';
import { destroyContainer } from '@/lib/docker';
import { logger } from '@/lib/logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Destroy the Docker container
    await destroyContainer(sessionId);

    // Remove from session store
    sessionStore.deleteSession(sessionId);

    logger.info('Session cleaned up successfully', { sessionId });

    return NextResponse.json({
      success: true,
      message: 'Session cleaned up successfully'
    });
  } catch (error) {
    logger.error('Failed to cleanup session', { error });
    return NextResponse.json(
      { error: 'Failed to cleanup session' },
      { status: 500 }
    );
  }
}
