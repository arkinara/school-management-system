"use client";

/**
 * Notification aggregation hook (#29). There is no dedicated notifications
 * backend for v1, so `fetchNotifications` builds a per-user feed from the
 * existing announcements / message-thread / SPP / attendance endpoints. This
 * hook owns polling (30s), refetch-on-focus, and local read markers.
 */

import * as React from "react";
import { getMe } from "./auth";
import {
  fetchNotifications,
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

/** Polls the aggregated notification feed and exposes read mutations. */
export function useNotifications(): NotificationsResult {
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [reloadKey, setReloadKey] = React.useState(0);
  const userIdRef = React.useRef<number | undefined>(undefined);
  const mountedRef = React.useRef(true);

  const load = React.useCallback(async (showLoading: boolean) => {
    if (showLoading) setStatus("loading");
    try {
      if (userIdRef.current === undefined) {
        const me = await getMe().catch(() => null);
        userIdRef.current = me?.user.id;
      }
      const list = await fetchNotifications({
        currentUserId: userIdRef.current,
      });
      if (!mountedRef.current) return;
      setNotifications(list);
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
    void markNotificationRead(id);
  }, []);

  const markAllRead = React.useCallback(() => {
    const ids = notifications.map((item) => item.id);
    setNotifications((current) =>
      current.map((item) => ({ ...item, read: true }))
    );
    void markAllNotificationsRead(ids);
  }, [notifications]);

  const refresh = React.useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  const unreadCount = notifications.filter((item) => !item.read).length;

  return { notifications, unreadCount, status, refresh, markRead, markAllRead };
}

/** Lightweight badge helper used by the AppBar bell. */
export function useNotificationCount(): number {
  return useNotifications().unreadCount;
}
