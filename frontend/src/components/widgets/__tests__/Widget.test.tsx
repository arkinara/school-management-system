import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { API } from "@/test/handlers";
import { apiFetch } from "@/lib/api";
import { Widget } from "../Widget";

function renderWidget(emptyCheck?: (data: number[]) => boolean) {
  return render(
    <Widget<number[]>
      queryKey={["widget-test"]}
      queryFn={() => apiFetch<number[]>("/api/widget-test")}
      emptyCheck={emptyCheck}
      render={(data) => <p>{data.join(",")}</p>}
    />
  );
}

describe("Widget resilience", () => {
  it("test_widget_error_state_with_retry shows an error then recovers on retry", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/widget-test`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ detail: "boom" }, { status: 500 });
        return HttpResponse.json([42]);
      })
    );
    const user = userEvent.setup();
    renderWidget();

    expect(await screen.findByRole("alert")).toHaveTextContent("Gagal memuat data");
    await user.click(screen.getByRole("button", { name: /Coba lagi/i }));

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("test_widget_no_permanent_skeleton removes the skeleton after a failure", async () => {
    server.use(
      http.get(`${API}/api/widget-test`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 })
      )
    );
    renderWidget();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("test_widget_empty_state renders the empty state for an empty result", async () => {
    server.use(http.get(`${API}/api/widget-test`, () => HttpResponse.json([])));
    renderWidget((data) => data.length === 0);

    expect(await screen.findByText("Tidak ada data")).toBeInTheDocument();
  });
});
