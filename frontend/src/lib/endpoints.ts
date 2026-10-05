/**
 * Typed API client for the domain endpoints built in tickets #5-#7.
 *
 * Thin wrappers over `apiFetch` (which owns auth + error handling) so
 * dashboard widgets can consume backend data without re-deriving URLs or
 * response shapes. Every list endpoint returns the shared paginated envelope.
 */

import { apiFetch } from "./api";
import type { UserMe } from "./auth";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface StudentRecord {
  id: number;
  user_id: number;
  school_id: number;
  class_id: number | null;
  nis: string;
  full_name: string | null;
  email: string | null;
  birth_date: string | null;
  enrollment_status: string;
}

export interface UserRecord {
  id: number;
  tenant_id: number;
  school_id: number | null;
  email: string;
  role: string;
  full_name: string;
  created_at: string;
  is_active: boolean;
}

export interface ClassRecord {
  id: number;
  school_id: number;
  name: string;
  grade_level: number;
  jurusan: string | null;
  wali_kelas_id: number | null;
  academic_year: string;
}

export interface SchoolRecord {
  id: number;
  tenant_id: number;
  name: string;
  address: string | null;
  principal_id: number | null;
  created_at: string;
}

export interface ChildSummary {
  id: number;
  user_id: number;
  nis: string;
  full_name: string;
  class_id: number | null;
  enrollment_status: string;
  relationship: string;
  is_primary: boolean;
}

export interface ParentRecord {
  id: number;
  tenant_id: number;
  school_id: number | null;
  full_name: string;
  email: string;
  children: ChildSummary[];
}

export interface TenantRecord {
  id: number;
  name: string;
  jenjang_type: string;
  kurikulum_version: string;
  config: Record<string, unknown> | null;
  created_at: string;
  school_count: number;
}

type QueryValue = string | number | boolean | undefined | null;

function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** GET /api/students — tenant/school-scoped roster. */
export function fetchStudents(
  params: { school_id?: number; class_id?: number; page?: number; size?: number } = {}
): Promise<Paginated<StudentRecord>> {
  return apiFetch<Paginated<StudentRecord>>(`/api/students${toQuery(params)}`);
}

/** GET /api/users — tenant-scoped user list, filterable by role/school. */
export function fetchUsers(
  params: { role?: string; school_id?: number; page?: number; size?: number } = {}
): Promise<Paginated<UserRecord>> {
  return apiFetch<Paginated<UserRecord>>(`/api/users${toQuery(params)}`);
}

/** GET /api/classes — tenant-scoped classes, filterable by school/grade. */
export function fetchClasses(
  params: { school_id?: number; grade_level?: number; page?: number; size?: number } = {}
): Promise<Paginated<ClassRecord>> {
  return apiFetch<Paginated<ClassRecord>>(`/api/classes${toQuery(params)}`);
}

/** GET /api/schools — schools in the caller's tenant (or any for super_admin). */
export function fetchSchools(
  params: { tenant_id?: number; page?: number; size?: number } = {}
): Promise<Paginated<SchoolRecord>> {
  return apiFetch<Paginated<SchoolRecord>>(`/api/schools${toQuery(params)}`);
}

/** GET /api/parents — tenant-scoped parent users (super_admin sees all). */
export function fetchParents(
  params: { page?: number; size?: number } = {}
): Promise<Paginated<ParentRecord>> {
  return apiFetch<Paginated<ParentRecord>>(`/api/parents${toQuery(params)}`);
}

/** GET /api/parents/{id}/children — sibling lookup for a parent user. */
export function fetchParentChildren(parentId: number): Promise<ChildSummary[]> {
  return apiFetch<ChildSummary[]>(`/api/parents/${parentId}/children`);
}

/** GET /api/tenants — every jenjang tenant (super_admin only). */
export function fetchTenants(): Promise<TenantRecord[]> {
  return apiFetch<TenantRecord[]>("/api/tenants");
}

/** GET /api/auth/me — current profile (throws on 401 instead of nulling). */
export function fetchMe(): Promise<UserMe> {
  return apiFetch<UserMe>("/api/auth/me");
}
