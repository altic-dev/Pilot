import { NextResponse } from 'next/server';
import { sessionStore } from '@/lib/session-store';
import { destroyContainer } from '@/lib/docker';
import { logger } from '@/lib/logger';

export async function POST() {
  try {
    // Cleanup stale sessions (inactive for more than 1 hour)
    const staleSessionIds = sessionStore.cleanupStaleSessions();

    // Destroy corresponding containers
    const destroyPromises = staleSessionIds.map(async (sessionId) => {
      try {
        await destroyContainer(sessionId);
      } catch (error) {
        logger.error('Failed to destroy container during cleanup', { sessionId, error });
      }
    });

    await Promise.all(destroyPromises);

    logger.info('Stale sessions cleaned up', { count: staleSessionIds.length });

    return NextResponse.json({
      success: true,
      cleaned: staleSessionIds.length,
      sessionIds: staleSessionIds
    });
  } catch (error) {
    logger.error('Failed to cleanup stale sessions', { error });
    return NextResponse.json(
      { error: 'Failed to cleanup stale sessions' },
      { status: 500 }
    );
  }
}
