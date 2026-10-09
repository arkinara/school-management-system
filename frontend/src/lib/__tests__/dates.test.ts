import { describe, it, expect } from "vitest";
import { currentPeriod, endOfMonth, todayIso } from "../dates";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

describe("dates", () => {
  it("formats today from local calendar fields", () => {
    expect(todayIso(new Date(2026, 0, 15, 7, 0, 0))).toBe("2026-01-15");
  });

  it("uses local timezone, not UTC", () => {
    const date = new Date("2026-01-01T00:30:00+07:00");
    const expected = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    expect(todayIso(date)).toBe(expected);
  });

  it("derives the current period locally", () => {
    expect(currentPeriod(new Date(2026, 4, 9))).toBe("2026-05");
  });

  it("computes the end of a month", () => {
    expect(endOfMonth("2026-02")).toBe("2026-02-28");
    expect(endOfMonth("2026-01")).toBe("2026-01-31");
  });
});
