import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import MessagesPage from "../page";

const { MOCK_ME } = vi.hoisted(() => ({
  MOCK_ME: {
    user: {
      id: 9,
      tenant_id: 1,
      school_id: 1,
      email: "orangtua@menteng.sch.id",
      role: "parent",
      full_name: "Ibu Ani",
      created_at: "2026-01-01",
    },
    tenant_id: 1,
    school_id: 1,
    role: "parent",
  },
}));

vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: (me: unknown) => unknown }) => children(MOCK_ME),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/messages",
}));

function withLinkedStudent() {
  server.use(
    http.get(`${API}/api/parents/:id/children`, () =>
      HttpResponse.json([
        {
          id: 1,
          user_id: 10,
          nis: "2026001",
          full_name: "Ahmad Fauzi",
          class_id: 1,
          enrollment_status: "active",
          relationship: "child",
          is_primary: true,
        },
      ])
    )
  );
}

describe("MessagesPage", () => {
  beforeEach(() => {
    MOCK_ME.role = "parent";
    MOCK_ME.user.role = "parent";
    MOCK_ME.user.id = 9;
    window.history.replaceState({}, "", "/dashboard/messages");
  });

  it("test_messages_requires_student shows an empty state when a parent has no linked students", async () => {
    render(<MessagesPage />);

    expect(await screen.findByText(/Anda belum ditautkan ke siswa manapun/i)).toBeInTheDocument();
  });

  it("test_thread_deep_link opens ?thread=5 on mount", async () => {
    withLinkedStudent();
    window.history.replaceState({}, "", "/dashboard/messages?thread=5");

    render(<MessagesPage />);

    expect(await screen.findByText("Bagaimana perkembangan Ahmad?")).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toContain("thread=5"));
  });

  it("test_403_error_distinct_from_500 distinguishes forbidden from network errors", async () => {
    const user = userEvent.setup();
    withLinkedStudent();
    server.use(
      http.get(`${API}/api/message-threads/:threadId/messages`, () =>
        HttpResponse.json({ detail: "forbidden" }, { status: 403 })
      )
    );

    const first = render(<MessagesPage />);
    await user.click(await screen.findByRole("button", { name: /Perkembangan Ahmad/i }));
    expect(await screen.findByText("Anda tidak memiliki akses ke thread ini")).toBeInTheDocument();
    first.unmount();

    server.use(
      http.get(`${API}/api/message-threads/:threadId/messages`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 })
      )
    );
    render(<MessagesPage />);
    await user.click(await screen.findByRole("button", { name: /Perkembangan Ahmad/i }));
    expect(await screen.findByText("Gagal memuat. Periksa koneksi Anda.")).toBeInTheDocument();
  });

  it("test_moderator_view_loads_via_audited_endpoint fetches /moderator-view for principals", async () => {
    const user = userEvent.setup();
    MOCK_ME.role = "principal";
    MOCK_ME.user.role = "principal";
    MOCK_ME.user.id = 3;
    const moderatorCalls: string[] = [];
    server.use(
      http.get(`${API}/api/message-threads/:threadId/moderator-view`, ({ params }) => {
        moderatorCalls.push(String(params.threadId));
        return HttpResponse.json({
          thread: {
            id: Number(params.threadId),
            tenant_id: 1,
            school_id: 1,
            student_id: 1,
            created_by: 3,
            participant_ids: [3, 2],
            subject: "Perkembangan Ahmad",
            created_at: "2026-01-14T08:00:00Z",
            last_message: null,
          },
          messages: [
            {
              id: 50,
              thread_id: 5,
              sender_id: 3,
              body: "Bagaimana perkembangan Ahmad?",
              sent_at: "2026-01-14T08:30:00Z",
              read_at: null,
            },
          ],
        });
      })
    );

    render(<MessagesPage />);
    await user.click(await screen.findByRole("button", { name: "Moderasi" }));
    await user.click(await screen.findByRole("button", { name: /Perkembangan Ahmad/i }));

    await waitFor(() => expect(moderatorCalls).toContain("5"));
    expect(await screen.findByText("Bagaimana perkembangan Ahmad?")).toBeInTheDocument();
  });
});
