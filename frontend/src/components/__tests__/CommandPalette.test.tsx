import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "../CommandPalette";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("CommandPalette", () => {
  it("test_command_palette_opens on Ctrl+K", () => {
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByRole("dialog", { name: "Palet perintah" })).toBeInTheDocument();
  });

  it("test_command_palette_navigates filters and routes to the chosen page", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await user.type(screen.getByLabelText("Cari halaman"), "absensi");
    await user.click(screen.getByRole("button", { name: /Absensi \(guru\)/i }));

    expect(push).toHaveBeenCalledWith("/dashboard/guru/absensi");
  });
});
