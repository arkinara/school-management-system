import {
  type LucideIcon,
  LayoutDashboard,
  CalendarCheck,
  ClipboardList,
  FileText,
  CalendarDays,
  Wallet,
  Megaphone,
  Users,
  Building2,
  School,
} from "lucide-react";

export type Role = "principal" | "guru" | "siswa" | "orang_tua" | "tu" | "yayasan";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

/**
 * Role-aware navigation model shared by NavRail (desktop) and BottomNav
 * (mobile). BottomNav consumers should slice to the first 5 items.
 */
export const navByRole: Record<Role, NavItem[]> = {
  principal: [
    { key: "home", label: "Beranda", icon: LayoutDashboard, href: "/dashboard/principal" },
    { key: "absensi", label: "Absensi", icon: CalendarCheck, href: "/absensi" },
    { key: "nilai", label: "Nilai", icon: ClipboardList, href: "/nilai" },
    { key: "spp", label: "SPP", icon: Wallet, href: "/spp" },
    { key: "pengumuman", label: "Pengumuman", icon: Megaphone, href: "/pengumuman" },
  ],
  guru: [
    { key: "home", label: "Beranda", icon: LayoutDashboard, href: "/dashboard/guru" },
    { key: "absensi", label: "Absensi", icon: CalendarCheck, href: "/absensi" },
    { key: "nilai", label: "Nilai", icon: ClipboardList, href: "/nilai" },
    { key: "rapor", label: "Rapor", icon: FileText, href: "/rapor" },
    { key: "jadwal", label: "Jadwal", icon: CalendarDays, href: "/jadwal" },
  ],
  siswa: [
    { key: "home", label: "Beranda", icon: LayoutDashboard, href: "/dashboard/siswa" },
    { key: "jadwal", label: "Jadwal", icon: CalendarDays, href: "/jadwal" },
    { key: "rapor", label: "Rapor", icon: FileText, href: "/rapor" },
    { key: "pengumuman", label: "Pengumuman", icon: Megaphone, href: "/pengumuman" },
  ],
  orang_tua: [
    { key: "home", label: "Beranda", icon: LayoutDashboard, href: "/dashboard/orang-tua" },
    { key: "rapor", label: "Rapor", icon: FileText, href: "/rapor" },
    { key: "spp", label: "SPP", icon: Wallet, href: "/spp" },
    { key: "pengumuman", label: "Pengumuman", icon: Megaphone, href: "/pengumuman" },
  ],
  tu: [
    { key: "home", label: "Beranda", icon: LayoutDashboard, href: "/dashboard/tu" },
    { key: "spp", label: "SPP", icon: Wallet, href: "/spp" },
    { key: "siswa", label: "Data Siswa", icon: Users, href: "/data-siswa" },
    { key: "jadwal", label: "Jadwal", icon: CalendarDays, href: "/jadwal" },
    { key: "absensi", label: "Absensi", icon: CalendarCheck, href: "/absensi" },
  ],
  yayasan: [
    { key: "home", label: "Beranda", icon: LayoutDashboard, href: "/dashboard/yayasan" },
    { key: "sekolah", label: "Sekolah", icon: School, href: "/sekolah" },
    { key: "tenant", label: "Tenant", icon: Building2, href: "/tenant" },
    { key: "pengguna", label: "Pengguna", icon: Users, href: "/pengguna" },
  ],
};

export const roleLabel: Record<Role, string> = {
  principal: "Kepala Sekolah",
  guru: "Guru",
  siswa: "Siswa",
  orang_tua: "Orang Tua",
  tu: "Tata Usaha",
  yayasan: "Yayasan",
};
