/**
 * useNotificationSSE — React hook for real-time notifications via Server-Sent Events.
 *
 * Opens a persistent EventSource connection to GET /api/notifications/stream.
 * The JWT token is passed as a query parameter since EventSource does not support
 * custom headers. The backend reads it from req.query.token and validates it.
 *
 * Features:
 * - Auto-reconnects on disconnect (max 5 attempts, exponential backoff)
 * - Sends a heartbeat comment every 20s (matches server's 25s interval)
 * - Calls onNotification(payload) whenever the server pushes a new notification
 * - Calls onUnreadChange(count) when the initial unread count is sent
 * - Cleans up the EventSource on unmount
 *
 * Usage:
 *   const { lastNotification, unreadCount, isConnected } = useNotificationSSE({
 *     onNotification: (notif) => { ... },
 *     onUnreadChange: (count) => setUnreadCount(count),
 *   });
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export interface SSENotification {
  id?: string | number;
  type: string;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

// Union of possible SSE payload shapes
export type SSEPayload =
  | { event: 'new_notification'; notification: SSENotification }
  | { event: 'unread_count';    unread_count: number }

interface UseNotificationSSEOptions {
  /** Called whenever a new notification event arrives via SSE */
  onNotification?: (notification: SSENotification) => void;
  /** Called when unread count changes (sent by server on connect) */
  onUnreadChange?: (count: number) => void;
  /** Called when connection status changes */
  onConnectionChange?: (connected: boolean) => void;
}

interface UseNotificationSSIReturn {
  /** The last notification received */
  lastNotification: SSENotification | null;
  /** Whether the EventSource is currently connected */
  isConnected: boolean;
  /** Manual reconnect helper */
  reconnect: () => void;
  /** Close the connection manually */
  disconnect: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

export function useNotificationSSE(
  options: UseNotificationSSEOptions = {}
): UseNotificationSSIReturn {
  const { onNotification, onUnreadChange, onConnectionChange } = options;

  const [lastNotification, setLastNotification] = useState<SSENotification | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearTimers();
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (isMountedRef.current) {
      setIsConnected(false);
      onConnectionChange?.(false);
    }
  }, [clearTimers, onConnectionChange]);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Read JWT token from localStorage
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('token')
      : null;

    if (!token) {
      // Not logged in — don't try to connect
      return;
    }

    // Build the SSE URL with token as query param
    const url = `/api/sse-stream?token=${encodeURIComponent(token)}`;

    // Close any existing connection before opening a new one
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(url);
    esRef.current = es;

    // ── Connection opened ──────────────────────────────────────────────────
    es.onopen = () => {
      if (!isMountedRef.current) return;
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
      onConnectionChange?.(true);

      // Client-side heartbeat: monitor the connection by polling EventSource.readyState.
      // If it goes to CLOSED unexpectedly, the onerror handler will reconnect.
      clearTimers();
      heartbeatTimerRef.current = setInterval(() => {
        if (es.readyState === EventSource.CLOSED) {
          console.warn('[SSE] Heartbeat detected closed connection — triggering reconnect');
          es.close();
          esRef.current = null;
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current);
            reconnectAttemptsRef.current++;
            setTimeout(() => { if (isMountedRef.current) connect(); }, delay);
          }
        }
      }, 20_000);
    };

    // ── Default message handler ───────────────────────────────────────────
    es.onmessage = (event) => {
      if (!isMountedRef.current) return;
      // Server sends ': connected\n\n' on connect — ignore it
      if (event.data.startsWith(':')) return;

      let payload: SSEPayload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        console.warn('[SSE] Failed to parse message:', event.data);
        return;
      }

      if (payload.event === 'unread_count') {
        onUnreadChange?.(payload.unread_count ?? 0);
        return;
      }

      if (payload.event === 'new_notification' && payload.notification) {
        setLastNotification(payload.notification);
        onNotification?.(payload.notification);
      }
    };

    // ── Error / disconnect ────────────────────────────────────────────────
    es.onerror = () => {
      if (!isMountedRef.current) return;

      // Cancel any pending reconnect BEFORE clearing state
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      disconnect();
      es.close();
      esRef.current = null;

      // Exponential backoff reconnection
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current++;
        console.log(`[SSE] Disconnected. Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})…`);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (isMountedRef.current) connect();
        }, delay);
      } else {
        console.warn('[SSE] Max reconnect attempts reached. Giving up.');
      }
    };
  }, [disconnect, clearTimers, onNotification, onUnreadChange, onConnectionChange]);

  // ── Expose reconnect helper ─────────────────────────────────────────────
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  // ── Mount / unmount ────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  return { lastNotification, isConnected, reconnect, disconnect };
}
