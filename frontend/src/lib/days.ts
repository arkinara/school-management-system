/**
 * Canonical day-of-week contract (ticket #44): ISO weekday 1-7 (Mon-Sun),
 * matching `backend/app/schemas/schedule.py::DayOfWeekEnum`.
 */

export const DAYS_OF_WEEK = [
  { value: 1, short: "Sen", long: "Senin", initial: "S" },
  { value: 2, short: "Sel", long: "Selasa", initial: "S" },
  { value: 3, short: "Rab", long: "Rabu", initial: "R" },
  { value: 4, short: "Kam", long: "Kamis", initial: "K" },
  { value: 5, short: "Jum", long: "Jum'at", initial: "J" },
  { value: 6, short: "Sab", long: "Sabtu", initial: "S" },
  { value: 7, short: "Min", long: "Minggu", initial: "M" },
] as const;

export function dayLabel(value: number, style: "short" | "long" | "initial" = "short"): string {
  return DAYS_OF_WEEK.find((d) => d.value === value)?.[style] ?? String(value);
}

/** ISO weekday for a date: Monday = 1 … Sunday = 7. */
export function todayDayOfWeek(date: Date = new Date()): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}
