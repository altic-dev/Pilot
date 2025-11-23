import { logger } from './logger';

export interface SessionData {
  sessionId: string;
  containerId: string;
  repoUrl?: string;
  repoName?: string;
  framework?: string;
  previewPort?: number;
  buildStatus: 'idle' | 'cloning' | 'building' | 'running' | 'failed';
  previewReady: boolean;
  createdAt: number;
  lastActivity: number;
}

type SessionSubscriber = (session: SessionData) => void;

class SessionStore {
  private sessions = new Map<string, SessionData>();
  private subscribers = new Map<string, Set<SessionSubscriber>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start automatic cleanup every 5 minutes
    this.startAutoCleanup();
  }

  /**
   * Create a new session
   */
  createSession(sessionId: string, containerId: string): SessionData {
    const session: SessionData = {
      sessionId,
      containerId,
      buildStatus: 'idle',
      previewReady: false,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.sessions.set(sessionId, session);
    logger.info(`Session created: ${sessionId} (container: ${containerId})`);

    return session;
  }

  /**
   * Get session data by sessionId
   */
  getSession(sessionId: string): SessionData | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Update last activity
      session.lastActivity = Date.now();
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * Update session data
   */
  updateSession(sessionId: string, updates: Partial<SessionData>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Attempted to update non-existent session: ${sessionId}`);
      return;
    }

    const updatedSession = {
      ...session,
      ...updates,
      lastActivity: Date.now(),
    };

    this.sessions.set(sessionId, updatedSession);
    logger.info(`Session updated: ${sessionId}`, updates);

    // Notify subscribers
    this.notifySubscribers(sessionId, updatedSession);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.subscribers.delete(sessionId);
    logger.info(`Session deleted: ${sessionId}`);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): SessionData[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Subscribe to session updates
   */
  subscribe(sessionId: string, callback: SessionSubscriber): () => void {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }

    this.subscribers.get(sessionId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(sessionId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(sessionId);
        }
      }
    };
  }

  /**
   * Notify subscribers of session updates
   */
  private notifySubscribers(sessionId: string, session: SessionData): void {
    const subs = this.subscribers.get(sessionId);
    if (subs) {
      subs.forEach((callback) => callback(session));
    }
  }

  /**
   * Start automatic cleanup of stale sessions
   */
  private startAutoCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up sessions that haven't been active for 1 hour
   */
  cleanupStaleSessions(maxInactivityMs = 60 * 60 * 1000): string[] {
    const now = Date.now();
    const staleSessionIds: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > maxInactivityMs) {
        staleSessionIds.push(sessionId);
        this.deleteSession(sessionId);
      }
    }

    if (staleSessionIds.length > 0) {
      logger.info(`Cleaned up ${staleSessionIds.length} stale sessions`, {
        sessionIds: staleSessionIds,
      });
    }

    return staleSessionIds;
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const sessionStore = new SessionStore();
