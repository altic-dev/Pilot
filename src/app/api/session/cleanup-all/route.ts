import { NextResponse } from 'next/server';
import { sessionStore } from '@/lib/session-store';
import { destroyContainer } from '@/lib/docker';
import { logger } from '@/lib/logger';
import { DirectPickerInjection } from '@/lib/direct-picker-injection';

export async function POST() {
  try {
    // Cleanup stale sessions (inactive for more than 1 hour)
    const staleSessionIds = sessionStore.cleanupStaleSessions();

    // Destroy corresponding containers and cleanup injections
    const destroyPromises = staleSessionIds.map(async (sessionId) => {
      try {
        const session = sessionStore.getSession(sessionId);

        // Clean up picker injection first (if it was injected)
        if (session?.pickerInjected) {
          await DirectPickerInjection.cleanupInjection(sessionId);
        }

        // Then destroy container
        await destroyContainer(sessionId);
      } catch (error) {
        logger.error('Failed to destroy resources during cleanup', { sessionId, error });
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
