/* Shared prototype runtime: inline lucide SVGs, role-aware shell, dark toggle. */
(function () {
  const ICONS = {
    "graduation-cap": '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    "calendar-check": '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    "clipboard-list": '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M16 13H8M16 17H8M10 9H8"/>',
    "calendar-days": '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    "building-2": '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
    school: '<path d="m4 6 8-4 8 4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M14 22v-4a2 2 0 0 0-4 0v4"/><path d="M18 5v17M6 5v17"/>',
    menu: '<path d="M4 12h16M4 6h16M4 18h16"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "trending-up": '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    "trending-down": '<path d="M22 17 13.5 8.5 8.5 13.5 2 7"/><path d="M16 17h6v-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    "alert-triangle": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    "alert-circle": '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    "check-circle": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    "credit-card": '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V2h12v7M6 14h12v8H6z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "book-open": '<path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    "arrow-right": '<path d="M5 12h14M12 5l7 7-7 7"/>',
    "circle-alert": '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  };

  function svg(name, extra) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'class="' + (extra || "") + '">' +
      (ICONS[name] || "") +
      "</svg>"
    );
  }

  function hydrate(root) {
    (root || document).querySelectorAll("[data-icon]").forEach(function (el) {
      if (el.dataset.hydrated) return;
      el.innerHTML = svg(el.getAttribute("data-icon"));
      el.dataset.hydrated = "1";
    });
  }

  const NAV = {
    principal: [
      ["home", "Beranda", "layout-dashboard"], ["absensi", "Absensi", "calendar-check"],
      ["nilai", "Nilai", "clipboard-list"], ["spp", "SPP", "wallet"], ["pengumuman", "Pengumuman", "megaphone"],
    ],
    guru: [
      ["home", "Beranda", "layout-dashboard"], ["absensi", "Absensi", "calendar-check"],
      ["nilai", "Nilai", "clipboard-list"], ["rapor", "Rapor", "file-text"], ["jadwal", "Jadwal", "calendar-days"],
    ],
    siswa: [
      ["home", "Beranda", "layout-dashboard"], ["jadwal", "Jadwal", "calendar-days"],
      ["rapor", "Rapor", "file-text"], ["pengumuman", "Pengumuman", "megaphone"],
    ],
    orang_tua: [
      ["home", "Beranda", "layout-dashboard"], ["rapor", "Rapor", "file-text"],
      ["spp", "SPP", "wallet"], ["pengumuman", "Pengumuman", "megaphone"],
    ],
    tu: [
      ["home", "Beranda", "layout-dashboard"], ["spp", "SPP", "wallet"],
      ["siswa", "Data Siswa", "users"], ["jadwal", "Jadwal", "calendar-days"], ["absensi", "Absensi", "calendar-check"],
    ],
    yayasan: [
      ["home", "Beranda", "layout-dashboard"], ["sekolah", "Sekolah", "school"],
      ["tenant", "Tenant", "building-2"], ["pengguna", "Pengguna", "users"],
    ],
  };

  function initials(name) {
    const p = name.trim().split(/\s+/);
    return ((p[0] && p[0][0]) || "") + ((p[1] && p[1][0]) || "");
  }

  function railItem(item, active) {
    const on = item[0] === active;
    return (
      '<a href="#" class="group flex w-full flex-col items-center gap-1 px-2 py-1.5"' +
      (on ? ' aria-current="page"' : "") + ">" +
      '<span class="flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-short ease-standard ' +
      (on ? "bg-secondary-container text-secondary-container-foreground" : "text-muted-foreground group-hover:bg-surface-container-high") +
      '"><span data-icon="' + item[2] + '" class="h-6 w-6"></span></span>' +
      '<span class="text-[11px] font-medium ' + (on ? "text-foreground" : "text-muted-foreground") + '">' + item[1] + "</span></a>"
    );
  }

  function bottomItem(item, active) {
    const on = item[0] === active;
    return (
      '<a href="#" class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5"' +
      (on ? ' aria-current="page"' : "") + ">" +
      '<span class="flex h-8 w-16 items-center justify-center rounded-full transition-colors ' +
      (on ? "bg-secondary-container text-secondary-container-foreground" : "text-muted-foreground") +
      '"><span data-icon="' + item[2] + '" class="h-5 w-5"></span></span>' +
      '<span class="text-[11px] font-medium ' + (on ? "text-foreground" : "text-muted-foreground") + '">' + item[1] + "</span></a>"
    );
  }

  function shell(opts) {
    const items = NAV[opts.role] || [];
    const notif = opts.notif || 0;

    const appbar =
      '<header class="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-outline-variant bg-surface-container-low px-4 sm:px-6">' +
      '<button class="flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high md:hidden" aria-label="Menu"><span data-icon="menu" class="h-5 w-5"></span></button>' +
      '<div class="flex items-center gap-2.5">' +
      '<span class="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><span data-icon="graduation-cap" class="h-5 w-5"></span></span>' +
      '<div class="leading-tight"><p class="text-sm font-semibold">' + opts.title + "</p>" +
      (opts.subtitle ? '<p class="text-xs text-muted-foreground">' + opts.subtitle + "</p>" : "") + "</div></div>" +
      '<div class="ml-auto flex items-center gap-1.5 sm:gap-2">' +
      (opts.actions || "") +
      '<button id="theme-toggle" class="flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high" aria-label="Ganti mode gelap"><span data-icon="moon" class="h-5 w-5" data-theme-icon></span></button>' +
      '<button class="relative flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-container-high" aria-label="Notifikasi"><span data-icon="bell" class="h-5 w-5"></span>' +
      (notif > 0 ? '<span class="absolute right-2.5 top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">' + notif + "</span>" : "") +
      "</button>" +
      '<button class="flex min-h-[48px] items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-surface-container-high">' +
      '<span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-xs font-medium text-primary-container-foreground">' + initials(opts.user).toUpperCase() + "</span>" +
      '<span class="hidden text-sm font-medium sm:inline">' + opts.user + "</span>" +
      '<span data-icon="chevron-down" class="h-4 w-4 text-muted-foreground"></span></button></div></header>';

    const rail =
      '<nav aria-label="Navigasi utama" class="hidden w-20 shrink-0 flex-col items-center gap-1 border-r border-outline-variant bg-surface-container-low py-4 md:flex">' +
      items.map(function (i) { return railItem(i, opts.active); }).join("") + "</nav>";

    const bottom =
      '<nav aria-label="Navigasi utama" class="fixed inset-x-0 bottom-0 z-40 flex border-t border-outline-variant bg-surface-container-low md:hidden">' +
      items.slice(0, 5).map(function (i) { return bottomItem(i, opts.active); }).join("") + "</nav>";

    const ab = document.getElementById("appbar"); if (ab) ab.innerHTML = appbar;
    const nr = document.getElementById("navrail"); if (nr) nr.innerHTML = rail;
    const bn = document.getElementById("bottomnav"); if (bn) bn.innerHTML = bottom;

    wireTheme();
    hydrate(document);
  }

  function applyTheme(dark) {
    document.documentElement.classList.toggle("dark", dark);
    document.querySelectorAll("[data-theme-icon]").forEach(function (el) {
      el.setAttribute("data-icon", dark ? "sun" : "moon");
      el.dataset.hydrated = "";
    });
    hydrate(document);
  }

  function wireTheme() {
    const btn = document.getElementById("theme-toggle");
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = "1";
      btn.addEventListener("click", function () {
        applyTheme(!document.documentElement.classList.contains("dark"));
      });
    }
  }

  // Sync dark mode from viewer (?theme=dark) so the toggle in index.html works.
  try {
    const p = new URLSearchParams(location.search);
    if (p.get("theme") === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}

  window.SMS = { shell: shell, hydrate: hydrate, svg: svg, applyTheme: applyTheme };
  document.addEventListener("DOMContentLoaded", function () { hydrate(document); });
})();
