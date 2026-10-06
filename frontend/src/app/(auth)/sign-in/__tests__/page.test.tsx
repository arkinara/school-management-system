import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignInPage from "../page";

const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace,
    push,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/sign-in",
}));

describe("SignInPage", () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    window.localStorage.clear();
  });

  it("renders the email and password fields", () => {
    render(<SignInPage />);

    expect(screen.getByLabelText(/^Email\*?$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Kata Sandi\*?$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Masuk" })).toBeInTheDocument();
  });

  it("shows validation errors for an empty submit", async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(
      await screen.findByText("Format email tidak valid. Contoh: budi@sekolah.sch.id")
    ).toBeInTheDocument();
    expect(await screen.findByText("Kata sandi wajib diisi.")).toBeInTheDocument();
  });

  it("rejects an invalid email format", async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(screen.getByLabelText(/^Email\*?$/), "not-an-email");
    await user.type(screen.getByLabelText(/^Kata Sandi\*?$/), "password123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(
      await screen.findByText("Format email tidak valid. Contoh: budi@sekolah.sch.id")
    ).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    const input = screen.getByLabelText(/^Kata Sandi\*?$/);
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Tampilkan kata sandi" }));

    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Sembunyikan kata sandi" })).toBeInTheDocument();
  });

  it("shows a form-level error for invalid credentials", async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(screen.getByLabelText(/^Email\*?$/), "budi@menteng.sch.id");
    await user.type(screen.getByLabelText(/^Kata Sandi\*?$/), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(await screen.findByText("Email atau kata sandi salah.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("navigates to the dashboard on a successful sign-in", async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(screen.getByLabelText(/^Email\*?$/), "budi@menteng.sch.id");
    await user.type(screen.getByLabelText(/^Kata Sandi\*?$/), "password123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });
});
