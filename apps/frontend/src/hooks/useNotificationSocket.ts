import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToken } from './useToken';
import { tokenStore } from '../lib/tokenStore';
import { getWsBase } from '../lib/apiClient';

const WS_BASE = getWsBase();

interface NotificationMessage {
  type:
    | 'permission-granted'
    | 'permission-changed'
    | 'permission-revoked'
    | 'document-deleted'
    | 'contact-invitation'
    | 'contact-added'
    | 'contact-removed';
  data: Record<string, unknown>;
  timestamp: string;
}

type NotificationHandler = (msg: NotificationMessage) => void;

export function useNotificationSocket(onNotification?: NotificationHandler) {
  const { isAuthenticated } = useToken();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const mountedRef = useRef(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const queryClient = useQueryClient();
  const handlerRef = useRef(onNotification);
  handlerRef.current = onNotification;

  const connect = useCallback(() => {
    if (!isAuthenticated || !mountedRef.current) return;
    const token = tokenStore.accessToken;
    if (!token) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    // NOTE: The access token is passed via the Sec-WebSocket-Protocol header as
    // `token.<jwt>`. Ensure any reverse proxy is configured to NOT log this header.
    const ws = new WebSocket(`${WS_BASE}/notifications`, [`token.${token}`]);
    wsRef.current = ws;

    // Heartbeat: send ping every 30s; reconnect if no activity in 60s (zombie detection)
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    lastActivityRef.current = Date.now();
    heartbeatRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
      // If no message received in 60s, treat as zombie and reconnect
      if (Date.now() - lastActivityRef.current > 60_000 && mountedRef.current) {
        ws.close();
        connect();
      }
    }, 30_000);

    ws.onopen = () => {
      reconnectAttempt.current = 0;
      lastActivityRef.current = Date.now();
    };

    ws.onmessage = (event) => {
      lastActivityRef.current = Date.now();
      try {
        const msg: NotificationMessage = JSON.parse(event.data as string);
        queryClient.invalidateQueries({ queryKey: ['notifications'] });

        // Contact lifecycle events → refresh contacts + invitations
        if (
          msg.type === 'contact-invitation' ||
          msg.type === 'contact-added' ||
          msg.type === 'contact-removed'
        ) {
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
          queryClient.invalidateQueries({ queryKey: ['contact-invitations'] });
        }

        // contact-removed also revokes all mutual document permissions —
        // invalidate document caches so the affected user's list reflects reality
        if (msg.type === 'contact-removed') {
          queryClient.invalidateQueries({ queryKey: ['documents'] });
          queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
        }

        // Permission / document lifecycle events → refresh documents + permissions
        if (
          msg.type === 'permission-granted' ||
          msg.type === 'permission-changed' ||
          msg.type === 'permission-revoked' ||
          msg.type === 'document-deleted'
        ) {
          queryClient.invalidateQueries({ queryKey: ['documents'] });
          queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
          const docId = msg.data?.documentId;
          if (docId && typeof docId === 'string') {
            queryClient.invalidateQueries({ queryKey: ['permissions', docId] });
          }
        }

        handlerRef.current?.(msg);
      } catch {
        /* ignore malformed messages */
      }
    };

    ws.onclose = (e) => {
      if (!mountedRef.current) return;
      // Only skip reconnection on intentional normal closure (1000).
      // Code 4001 (token expired / auth failed) should reconnect because the
      // token may have been refreshed by the time the backoff fires.
      if (e.code === 1000) return;
      // Exponential backoff: 1s, 2s, 4s, ..., 30s max (with random jitter)
      const delay = Math.min(1000 * 2 ** reconnectAttempt.current, 30000) + Math.random() * 1000;
      reconnectAttempt.current = Math.min(reconnectAttempt.current + 1, 10);
      reconnectTimer.current = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [isAuthenticated, queryClient]);

  // Notify WS server when token is refreshed (resets expiry timer).
  // If the socket was closed due to token expiry (code 4001), reconnect.
  useEffect(() => {
    const handler = (e: Event) => {
      const token = (e as CustomEvent<string>).detail;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'token-refreshed', accessToken: token }));
      } else if (
        wsRef.current?.readyState === WebSocket.CLOSED ||
        wsRef.current?.readyState === WebSocket.CLOSING
      ) {
        // Socket was closed — likely due to token expiry (4001).
        // Reconnect with the fresh token.
        reconnectAttempt.current = 0;
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        connect();
      }
    };
    window.addEventListener('token-refreshed', handler);
    return () => window.removeEventListener('token-refreshed', handler);
  }, [connect]);

  // Reconnect on visibility change (tab returns to foreground)
  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        mountedRef.current &&
        wsRef.current?.readyState !== WebSocket.OPEN &&
        wsRef.current?.readyState !== WebSocket.CONNECTING
      ) {
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return wsRef;
}
