import type { SessionData } from '../types/wine.js';

const sessions = new Map<string, SessionData>();

export function getSession(id: string): SessionData | undefined {
  return sessions.get(id);
}

export function setSession(session: SessionData): void {
  sessions.set(session.id, session);
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

// Clean up sessions older than 1 hour
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.createdAt.getTime() < oneHourAgo) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000);
