"use client";

/**
 * Notification centre hook (#29/#51).
 *
 * Read state is owned by the backend: the feed comes from
 * `GET /api/notifications` and read mutations POST to
 * `/api/notifications/{id}/read` (or `/mark-all-read`). There is no
 * localStorage read marker any more — an existing device marker is ignored.
 *
 * The hook owns polling (30s), refetch-on-focus and a cross-component change
 * event so the bell badge and the feed page stay in sync.
 */

import * as React from "react";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "./endpoints";

const POLL_INTERVAL_MS = 30_000;
const CHANGE_EVENT = "sms:notifications-changed";

export interface NotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  status: "loading" | "ready" | "error";
  refresh: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

function emitChanged(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Ignore environments without a global event target.
  }
}

/** Polls the per-user notification feed and exposes read mutations. */
export function useNotifications(): NotificationsResult {
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = React.useState(0);
  const mountedRef = React.useRef(true);

  const load = React.useCallback(async (showLoading: boolean) => {
    if (showLoading) setStatus("loading");
    try {
      const [list, count] = await Promise.all([fetchNotifications(), fetchUnreadCount()]);
      if (!mountedRef.current) return;
      setNotifications(list);
      setUnreadCount(count);
      setStatus("ready");
    } catch {
      if (mountedRef.current) setStatus("error");
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    void load(true);
    const interval = setInterval(() => void load(false), POLL_INTERVAL_MS);
    const onFocus = () => void load(false);
    const onChanged = () => void load(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener(CHANGE_EVENT, onChanged);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(CHANGE_EVENT, onChanged);
    };
  }, [load, reloadKey]);

  const markRead = React.useCallback((id: string) => {
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
    void markNotificationRead(Number(id))
      .then(emitChanged)
      .catch(() => {
        /* Keep the optimistic state; the next poll reconciles. */
      });
  }, []);

  const markAllRead = React.useCallback(() => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    void markAllNotificationsRead()
      .then(emitChanged)
      .catch(() => {
        /* Keep the optimistic state; the next poll reconciles. */
      });
  }, []);

  const refresh = React.useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  return { notifications, unreadCount, status, refresh, markRead, markAllRead };
}
