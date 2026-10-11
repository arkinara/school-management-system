import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import { useNotifications } from "../notifications";

describe("useNotifications", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads the per-user feed and unread count from the backend", async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.notifications.length).toBeGreaterThan(0);
    expect(result.current.unreadCount).toBe(2);
  });

  it("test_mark_read_uses_be POSTs to the backend with no localStorage write", async () => {
    const readCalls: string[] = [];
    server.use(
      http.post(`${API}/api/notifications/:id/read`, ({ params }) => {
        readCalls.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      })
    );

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.markRead("1"));

    await waitFor(() => expect(readCalls).toContain("1"));
    expect(window.localStorage.length).toBe(0);
  });
});
