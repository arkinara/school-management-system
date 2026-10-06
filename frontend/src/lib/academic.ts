/**
 * Canonical academic-period contract (ticket #44).
 *
 * Single FE source of truth for the semester string shape
 * `YYYY/YYYY-ganjil | YYYY/YYYY-genap`, matching `backend/app/academic.py`.
 */

import { apiFetch } from "./api";

export type Semester = `${number}/${number}-ganjil` | `${number}/${number}-genap`;

export function parseSemester(s: string): { year: number; term: "ganjil" | "genap" } {
  const m = s.match(/^(\d{4})\/(\d{4})-(ganjil|genap)$/);
  if (!m) throw new Error(`invalid semester: ${s}`);
  return { year: parseInt(m[1], 10), term: m[3] as "ganjil" | "genap" };
}

export function makeSemester(year: number, term: "ganjil" | "genap"): Semester {
  return `${year}/${year + 1}-${term}` as Semester;
}

let cachedSemester: Semester | null = null;

/** GET /api/academic/active-semester — canonical active semester. */
export async function fetchActiveSemester(): Promise<Semester> {
  if (cachedSemester) return cachedSemester;
  const r = await apiFetch<{ semester: Semester }>("/api/academic/active-semester");
  cachedSemester = r.semester;
  return cachedSemester;
}

/** Human label, e.g. `"2026/2027-ganjil"` → `"Ganjil 2026/2027"`. */
export function semesterLabel(s: string): string {
  try {
    const { year, term } = parseSemester(s);
    return `${term === "genap" ? "Genap" : "Ganjil"} ${year}/${year + 1}`;
  } catch {
    return s;
  }
}

/** The two canonical semesters for the academic year of `active`. */
export function semesterOptions(active: Semester): Semester[] {
  const { year, term } = parseSemester(active);
  const ganjil = makeSemester(year, "ganjil");
  const genap = makeSemester(year, "genap");
  return term === "genap" ? [genap, ganjil] : [ganjil, genap];
}
