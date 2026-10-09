/**
 * Date helpers that respect the browser's local timezone (Asia/Jakarta for
 * this app), avoiding the UTC off-by-one that `toISOString().slice(0, 10)`
 * produces for WIB mornings (#60).
 */

/** Format a date as `YYYY-MM-DD` using local calendar fields. */
export function todayIso(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM` period for the given date, in local time. */
export function currentPeriod(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

/** Last calendar day of a `YYYY-MM` period, in local time. */
export function endOfMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return "";
  const last = new Date(year, month, 0);
  return todayIso(last);
}
