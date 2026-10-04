/**
 * Typed placeholder data for the role dashboards (tickets #8-#10).
 *
 * Shapes mirror the eventual API contracts (attendance, jadwal, penilaian,
 * announcements) so swapping a widget from mock to a real fetch later needs no
 * component change — only the data source changes.
 */

import type { ChipTone } from "@/components/ui/StatusChip";

export interface AttendanceBreakdown {
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
}

export interface DonutDatum {
  label: string;
  value: number;
  tone: ChipTone;
}

export interface GradeEntryProgress {
  label: string;
  value: number;
  target: number;
}

export interface AttendanceTrendPoint {
  day: string;
  value: number;
}

export interface PendingAnnouncement {
  id: string;
  title: string;
  submittedBy: string;
  submittedAt: string;
  audience: string;
}

export interface PrincipalDashboardData {
  totalStudents: number;
  activeTeachers: number;
  attendanceRate: number;
  sppCollected: number;
  sppTarget: number;
  attendance: AttendanceBreakdown;
  gradeEntry: GradeEntryProgress[];
  attendanceTrend: AttendanceTrendPoint[];
  pendingAnnouncements: PendingAnnouncement[];
}

export const principalMock: PrincipalDashboardData = {
  totalStudents: 482,
  activeTeachers: 34,
  attendanceRate: 94,
  sppCollected: 128_000_000,
  sppTarget: 156_000_000,
  attendance: { hadir: 452, izin: 12, sakit: 10, alpa: 8 },
  gradeEntry: [
    { label: "Kelas 6", value: 92, target: 100 },
    { label: "Kelas 5", value: 78, target: 100 },
    { label: "Kelas 4", value: 64, target: 100 },
    { label: "Kelas 1-3", value: 41, target: 100 },
  ],
  attendanceTrend: [
    { day: "Sen", value: 91 },
    { day: "Sel", value: 93 },
    { day: "Rab", value: 95 },
    { day: "Kam", value: 94 },
    { day: "Jum", value: 97 },
    { day: "Sab", value: 95 },
    { day: "Min", value: 94 },
  ],
  pendingAnnouncements: [
    {
      id: "a1",
      title: "Libur Maulid Nabi — 7 Oktober",
      submittedBy: "Dewi Lestari (TU)",
      submittedAt: "2 jam lalu",
      audience: "semua orang tua",
    },
    {
      id: "a2",
      title: "Jadwal Ujian Tengah Semester",
      submittedBy: "Andi Wijaya (Guru)",
      submittedAt: "5 jam lalu",
      audience: "siswa & orang tua",
    },
  ],
};

/** Formats an attendance breakdown turn into donut segments. */
export function attendanceSegments(
  attendance: AttendanceBreakdown
): DonutDatum[] {
  return [
    { label: "Hadir", value: attendance.hadir, tone: "success" },
    { label: "Izin", value: attendance.izin, tone: "info" },
    { label: "Sakit", value: attendance.sakit, tone: "warning" },
    { label: "Alpa", value: attendance.alpa, tone: "danger" },
  ];
}

/** Compact Rupiah formatting ("Rp 128jt") for KPI tiles. */
export function formatRupiahCompact(amount: number): string {
  if (amount >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1)}M`;
  if (amount >= 1_000_000) return `Rp ${Math.round(amount / 1_000_000)}jt`;
  if (amount >= 1_000) return `Rp ${Math.round(amount / 1_000)}rb`;
  return `Rp ${amount}`;
}
