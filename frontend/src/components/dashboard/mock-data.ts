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

/* ==========================================================================
   Guru (teacher) dashboard — ticket #9
   ========================================================================== */

export type SessionStatus = "done" | "now" | "upcoming";

export interface TodaySession {
  id: string;
  startTime: string;
  endTime: string;
  className: string;
  subject: string;
  room: string;
  status: SessionStatus;
  attendanceTaken: boolean;
}

export interface GradeQueueItem {
  id: string;
  className: string;
  subject: string;
  classId: number;
  subjectId: number;
  lastEntry: string;
  urgency: ChipTone;
  due: string;
}

export interface AttendanceQueueItem {
  id: string;
  className: string;
  subject: string;
  classId: number;
  time: string;
  studentCount: number;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  time: string;
}

export interface GuruDashboardData {
  classCount: number;
  studentCount: number;
  pendingGrades: number;
  attendanceRate: number;
  todaySessions: TodaySession[];
  gradeQueue: GradeQueueItem[];
  attendanceQueue: AttendanceQueueItem[];
  announcements: AnnouncementItem[];
}

export const guruMock: GuruDashboardData = {
  classCount: 2,
  studentCount: 63,
  pendingGrades: 3,
  attendanceRate: 94,
  todaySessions: [
    {
      id: "s1",
      startTime: "07.00",
      endTime: "07.40",
      className: "6A",
      subject: "Matematika",
      room: "Ruang 6A",
      status: "done",
      attendanceTaken: true,
    },
    {
      id: "s2",
      startTime: "08.30",
      endTime: "09.10",
      className: "6B",
      subject: "Matematika",
      room: "Ruang 6B",
      status: "now",
      attendanceTaken: false,
    },
    {
      id: "s3",
      startTime: "10.00",
      endTime: "10.40",
      className: "5A",
      subject: "Matematika",
      room: "Ruang 5A",
      status: "upcoming",
      attendanceTaken: false,
    },
    {
      id: "s4",
      startTime: "12.30",
      endTime: "13.10",
      className: "6A",
      subject: "Wali Kelas",
      room: "Ruang 6A",
      status: "upcoming",
      attendanceTaken: false,
    },
    {
      id: "s5",
      startTime: "13.30",
      endTime: "14.10",
      className: "5B",
      subject: "Matematika",
      room: "Ruang 5B",
      status: "upcoming",
      attendanceTaken: false,
    },
  ],
  gradeQueue: [
    {
      id: "g1",
      className: "6A",
      subject: "Ulangan Harian 2",
      classId: 1,
      subjectId: 1,
      lastEntry: "28 Sep 2026",
      urgency: "danger",
      due: "Jatuh tempo besok",
    },
    {
      id: "g2",
      className: "6B",
      subject: "Tugas Proyek",
      classId: 2,
      subjectId: 1,
      lastEntry: "27 Sep 2026",
      urgency: "warning",
      due: "Jatuh tempo 5 Okt",
    },
    {
      id: "g3",
      className: "5A",
      subject: "Kuis Pecahan",
      classId: 3,
      subjectId: 1,
      lastEntry: "25 Sep 2026",
      urgency: "success",
      due: "Jatuh tempo 9 Okt",
    },
  ],
  attendanceQueue: [
    {
      id: "q1",
      className: "6B",
      subject: "Matematika",
      classId: 2,
      time: "08.30",
      studentCount: 32,
    },
    {
      id: "q2",
      className: "5A",
      subject: "Matematika",
      classId: 3,
      time: "10.00",
      studentCount: 30,
    },
    {
      id: "q3",
      className: "5B",
      subject: "Matematika",
      classId: 4,
      time: "13.30",
      studentCount: 31,
    },
  ],
  announcements: [
    {
      id: "n1",
      title: "Rapat Wali Kelas",
      body: "Rapat koordinasi rapor digelar Jumat pukul 14.00 di ruang guru.",
      time: "1 jam lalu",
    },
    {
      id: "n2",
      title: "Batas Input Nilai UTS",
      body: "Nilai UTS dimasukkan paling lambat 7 Oktober 2026.",
      time: "3 jam lalu",
    },
    {
      id: "n3",
      title: "Pelatihan Kurikulum Merdeka",
      body: "Pelatihan untuk semua guru pada Sabtu, 11 Oktober 2026.",
      time: "kemarin",
    },
    {
      id: "n4",
      title: "Libur Maulid Nabi",
      body: "Sekolah libur pada 7 Oktober 2026.",
      time: "2 hari lalu",
    },
  ],
};

/** Pending grade-entrant count, clamped so a badge never goes negative. */
export function safePendingCount(value: number | undefined | null): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return 0;
  return value;
}

/* ==========================================================================
   Siswa (student) dashboard — ticket #10
   ========================================================================== */

export interface StudentSession {
  id: string;
  startTime: string | null;
  endTime: string | null;
  subject: string;
  teacher: string;
  room: string;
  status: SessionStatus;
}

export interface AssignmentItem {
  id: string;
  title: string;
  subject: string;
  due: string;
  tone: ChipTone;
}

export interface RaporGrade {
  subject: string;
  score: number;
}

export interface RaporSummary {
  status: "published" | "draft" | string | null;
  semester: string;
  grades: RaporGrade[];
}

export interface SiswaDashboardData {
  average: number;
  attendanceRate: number;
  rank: number;
  classSize: number;
  sessions: StudentSession[];
  assignments: AssignmentItem[];
  rapor: RaporSummary;
  announcements: AnnouncementItem[];
}

export const siswaMock: SiswaDashboardData = {
  average: 85.3,
  attendanceRate: 96,
  rank: 4,
  classSize: 32,
  sessions: [
    {
      id: "s1",
      startTime: "07.00",
      endTime: "07.40",
      subject: "Upacara",
      teacher: "Petugas Upacara",
      room: "Lapangan",
      status: "done",
    },
    {
      id: "s2",
      startTime: "08.30",
      endTime: "09.10",
      subject: "Matematika",
      teacher: "Bu Siti",
      room: "Ruang 6A",
      status: "now",
    },
    {
      id: "s3",
      startTime: "10.00",
      endTime: "10.40",
      subject: "Bahasa Indonesia",
      teacher: "Pak Andi",
      room: "Ruang 6A",
      status: "upcoming",
    },
    {
      id: "s4",
      startTime: "11.00",
      endTime: "11.40",
      subject: "IPA",
      teacher: "Bu Rina",
      room: "Lab IPA",
      status: "upcoming",
    },
    {
      id: "s5",
      startTime: "12.30",
      endTime: "13.10",
      subject: "IPS",
      teacher: "Pak Hadi",
      room: "Ruang 6A",
      status: "upcoming",
    },
    {
      id: "s6",
      startTime: "13.30",
      endTime: "14.10",
      subject: "PJOK",
      teacher: "Pak Joko",
      room: "Lapangan",
      status: "upcoming",
    },
  ],
  assignments: [
    {
      id: "a1",
      title: "Latihan Pecahan",
      subject: "Matematika",
      due: "besok",
      tone: "danger",
    },
    {
      id: "a2",
      title: "Karangan Deskripsi",
      subject: "Bahasa Indonesia",
      due: "3 hari lagi",
      tone: "warning",
    },
    {
      id: "a3",
      title: "Laporan Percobaan",
      subject: "IPA",
      due: "5 hari lagi",
      tone: "success",
    },
  ],
  rapor: {
    status: "published",
    semester: "Semester Genap 2025/2026",
    grades: [
      { subject: "IPA", score: 90 },
      { subject: "Matematika", score: 88 },
      { subject: "Bahasa Indonesia", score: 85 },
      { subject: "IPS", score: 78 },
    ],
  },
  announcements: [
    {
      id: "p1",
      title: "Libur Maulid Nabi",
      body: "Sekolah libur pada 7 Oktober 2026.",
      time: "2 jam lalu",
    },
    {
      id: "p2",
      title: "Jadwal Ujian Tengah Semester",
      body: "UTS dimulai 14 Oktober. Kisi-kisi menyusul.",
      time: "5 jam lalu",
    },
    {
      id: "p3",
      title: "Lomba Literasi",
      body: "Pendaftaran lomba literasi dibuka hingga 10 Oktober.",
      time: "kemarin",
    },
  ],
};

/**
 * A rapor is only ever shown as published when the backend says so; a missing
 * or unknown status degrades to draft so the widget is never ambiguous.
 */
export function normalizeRaporStatus(
  status: RaporSummary["status"]
): "published" | "draft" {
  return status === "published" ? "published" : "draft";
}

/** Renders a session time range, degrading to a fallback for bad data. */
export function formatSessionTime(
  startTime: string | null,
  endTime: string | null
): string {
  if (!startTime || !endTime) return "Waktu TBD";
  return `${startTime}–${endTime}`;
}


