import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionData } from '../types/wine.ts';

const API = import.meta.env.VITE_API_URL || '/api';

export function useWineSession() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollSession = useCallback((sessionId: string) => {
    stopPolling();
    const poll = async () => {
      try {
        const res = await fetch(`${API}/wines/${sessionId}`);
        if (!res.ok) return;
        const data: SessionData = await res.json();
        setSession(data);
        if (data.status === 'complete' || data.status === 'error') {
          stopPolling();
        }
      } catch {
        // Ignore polling errors
      }
    };
    poll(); // Initial fetch
    // Poll fast (1s) during active operations for snappy UI
    pollRef.current = setInterval(poll, 1000);
  }, [stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    setSession(null);

    try {
      const formData = new FormData();
      formData.append('winelist', file);

      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(body.error || 'Upload failed');
      }

      const { sessionId } = await res.json();
      pollSession(sessionId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, [pollSession]);

  const startLookup = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const res = await fetch(`${API}/lookup/${session.id}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Lookup failed' }));
        throw new Error(body.error || 'Lookup failed');
      }
      pollSession(session.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [session, pollSession]);

  const editWine = useCallback(async (index: number, updates: Record<string, unknown>) => {
    if (!session) return;
    try {
      const res = await fetch(`${API}/wines/${session.id}/${index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [session]);

  return { session, uploading, error, upload, startLookup, editWine };
}
