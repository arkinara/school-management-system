/* ============================================================================
   School MS Pro Max — shared prototype runtime
   Zero dependencies: inline SVG icons, inline SVG charts, no chart library.
   Exposes window.SMS.
   ========================================================================== */
(function () {
  "use strict";

  /* --------------------------------------------------------------------- *
   * Icons — one family (Lucide geometry), one stroke width, 24px grid.
   * Never an emoji: emoji are font-dependent and cannot be themed.
   * --------------------------------------------------------------------- */
  var ICONS = {
    "graduation-cap": '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-up": '<path d="m18 15-6-6-6 6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    "calendar-check": '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    "calendar-days": '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    "clipboard-list": '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M16 13H8M16 17H8M10 9H8"/>',
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
    minus: '<path d="M5 12h14"/>',
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
    "arrow-up-down": '<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    "refresh-cw": '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    "undo-2": '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    "eye-off": '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    "shield-check": '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3 8 3z"/><path d="m9 12 2 2 4-4"/>',
    "list-checks": '<path d="m3 17 2 2 4-4M3 7l2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    "wifi-off": '<path d="m2 2 20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68M5 12.86a10 10 0 0 1 3.4-2.1"/><path d="M12 20h.01"/>',
  };

  function svg(name, cls) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" ' +
      'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="' +
      (cls || "") + '">' + (ICONS[name] || "") + "</svg>"
    );
  }

  function hydrate(root) {
    (root || document).querySelectorAll("[data-icon]").forEach(function (el) {
      if (el.dataset.hydrated === "1") return;
      el.innerHTML = svg(el.getAttribute("data-icon"));
      el.dataset.hydrated = "1";
    });
  }

  /* --------------------------------------------------------------------- *
   * Formatting — Indonesian locale, tabular output.
   * --------------------------------------------------------------------- */
  function nf(n, digits) {
    try { return new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits == null ? 0 : digits }).format(n); }
    catch (e) { return String(n); }
  }
  function rupiah(n) {
    try { return "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n); }
    catch (e) { return "Rp " + n; }
  }

  /* --------------------------------------------------------------------- *
   * Status chips — colour is never the only signal; every chip pairs a
   * tone with an icon and a word.
   * --------------------------------------------------------------------- */
  var TONES = {
    success: ["bg-success-container text-success-container-foreground", "check-circle"],
    warning: ["bg-warning-container text-warning-container-foreground", "alert-triangle"],
    danger: ["bg-destructive-container text-destructive-container-foreground", "alert-circle"],
    info: ["bg-info-container text-info-container-foreground", "activity"],
    neutral: ["bg-surface-3 text-muted-foreground", "minus"],
    primary: ["bg-primary-container text-primary-container-foreground", "check"],
  };

  function chip(label, tone, iconOverride) {
    var t = TONES[tone] || TONES.neutral;
    return (
      '<span class="inline-flex items-center gap-1 rounded-full ' + t[0] + ' px-2 py-0.5 text-2xs font-semibold">' +
      '<span data-icon="' + (iconOverride || t[1]) + '" class="h-3 w-3"></span>' + label + "</span>"
    );
  }

  /* --------------------------------------------------------------------- *
   * Charts — hand-rolled inline SVG. Every chart exposes its numbers as
   * text too, so nothing depends on reading a shape or a colour.
   * --------------------------------------------------------------------- */

  /** Sparkline / trend line. values: number[]. */
  function sparkline(values, opts) {
    opts = opts || {};
    var w = opts.width || 120, h = opts.height || 34, pad = 2;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = max - min || 1;
    var step = (w - pad * 2) / (values.length - 1 || 1);
    var pts = values.map(function (v, i) {
      return [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)];
    });
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var area = d + " L" + pts[pts.length - 1][0].toFixed(1) + " " + (h - pad) + " L" + pad + " " + (h - pad) + " Z";
    var stroke = opts.tone === "down" ? "var(--chart-5)" : opts.tone === "accent" ? "var(--chart-2)" : "var(--chart-1)";
    var last = pts[pts.length - 1];
    return (
      '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" role="img" ' +
      'aria-label="' + (opts.label || "Tren") + ": " + values.join(", ") + '" class="overflow-visible">' +
      '<path d="' + area + '" fill="hsl(' + stroke + ' / .14)"/>' +
      '<path d="' + d + '" fill="none" stroke="hsl(' + stroke + ')" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.5" fill="hsl(' + stroke + ')"/>' +
      "</svg>"
    );
  }

  /**
   * Bullet chart — the compact "value vs target" form. Rated AAA because the
   * number is always printed next to the bar; the bands are labelled, never
   * colour-only.
   */
  function bullet(opts) {
    var pct = Math.max(0, Math.min(100, opts.value));
    var target = Math.max(0, Math.min(100, opts.target));
    var tone = pct >= target ? "var(--chart-1)" : pct >= target * 0.8 ? "var(--chart-2)" : "var(--chart-5)";
    return (
      '<div class="flex items-center gap-2">' +
      '<svg viewBox="0 0 100 10" class="h-2.5 w-full" preserveAspectRatio="none" role="img" ' +
      'aria-label="' + opts.label + ": " + pct + "% dari target " + target + '%">' +
      '<rect x="0" y="2" width="100" height="6" rx="3" fill="hsl(var(--surface-3))"/>' +
      '<rect x="0" y="2" width="' + pct + '" height="6" rx="3" fill="hsl(' + tone + ')"/>' +
      '<rect x="' + (target - 0.6) + '" y="0" width="1.2" height="10" fill="hsl(var(--foreground))"/>' +
      "</svg>" +
      '<span class="num shrink-0 text-xs font-semibold tabular-nums">' + pct + "%</span></div>"
    );
  }

  /** Donut. segments: [{label, value, tone}] where tone is 1..5. */
  function donut(segments, opts) {
    opts = opts || {};
    var size = opts.size || 148, r = size / 2 - 14, c = size / 2, circ = 2 * Math.PI * r;
    var total = segments.reduce(function (s, x) { return s + x.value; }, 0) || 1;
    var offset = 0, arcs = "";
    segments.forEach(function (s, i) {
      var len = (s.value / total) * circ;
      arcs +=
        '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="hsl(var(--chart-' + ((i % 5) + 1) + '))" ' +
        'stroke-width="14" stroke-dasharray="' + len.toFixed(2) + " " + (circ - len).toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 ' + c + " " + c + ')" stroke-linecap="butt"/>';
      offset += len;
    });
    var legend = segments.map(function (s, i) {
      return (
        '<li class="flex items-center justify-between gap-3 py-0.5">' +
        '<span class="flex items-center gap-1.5 text-xs">' +
        '<span class="h-2.5 w-2.5 rounded-sm" style="background:hsl(var(--chart-' + ((i % 5) + 1) + '))"></span>' + s.label + "</span>" +
        '<span class="num text-xs font-semibold">' + nf(s.value) + '<span class="ml-1 font-normal text-muted-foreground">' +
        Math.round((s.value / total) * 100) + "%</span></span></li>"
      );
    }).join("");
    return (
      '<div class="flex items-center gap-4">' +
      '<div class="relative shrink-0">' +
      '<svg viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="' +
      (opts.label || "Distribusi") + ": " + segments.map(function (s) { return s.label + " " + s.value; }).join(", ") + '">' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="hsl(var(--surface-3))" stroke-width="14"/>' + arcs + "</svg>" +
      '<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">' +
      '<span class="num text-xl font-semibold leading-none">' + nf(opts.centerValue != null ? opts.centerValue : total) + "</span>" +
      '<span class="mt-0.5 text-2xs text-muted-foreground">' + (opts.centerLabel || "total") + "</span></div></div>" +
      '<ul class="min-w-0 flex-1 space-y-0.5">' + legend + "</ul></div>"
    );
  }

  /** Horizontal bars with a printed value — for ranked comparisons. */
  function bars(rows, opts) {
    opts = opts || {};
    var max = opts.max || Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    return (
      '<ul class="space-y-2.5">' +
      rows.map(function (r) {
        var pct = (r.value / max) * 100;
        var tone = r.tone || (pct >= 80 ? "var(--chart-1)" : pct >= 60 ? "var(--chart-2)" : "var(--chart-5)");
        return (
          '<li>' +
          '<div class="mb-1 flex items-baseline justify-between gap-2">' +
          '<span class="truncate text-xs font-medium">' + r.label + "</span>" +
          '<span class="num shrink-0 text-xs font-semibold">' + (r.display || r.value + "%") + "</span></div>" +
          '<div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="img" aria-label="' +
          r.label + ": " + (r.display || r.value + "%") + '">' +
          '<div class="h-full rounded-full" style="width:' + pct.toFixed(1) + "%;background:hsl(" + tone + ')"></div></div></li>'
        );
      }).join("") + "</ul>"
    );
  }

  /* --------------------------------------------------------------------- *
   * Role-aware navigation. Icon + label at every breakpoint — an icon-only
   * nav costs discoverability. Bottom bar is capped at 5 destinations.
   * --------------------------------------------------------------------- */
  var NAV = {
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
    var p = String(name || "").trim().split(/\s+/);
    return ((p[0] && p[0][0]) || "") + ((p[1] && p[1][0]) || "");
  }

  /* Sidebar: icons from 768px, icons + labels from 1280px (adaptive nav). */
  function sideItem(item, active) {
    var on = item[0] === active;
    return (
      '<li><a href="#" class="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-short ease-standard ' +
      (on ? "bg-primary-container text-primary-container-foreground" : "text-muted-foreground hover:bg-surface-3 hover:text-foreground") + '"' +
      (on ? ' aria-current="page"' : "") + ">" +
      '<span data-icon="' + item[2] + '" class="h-5 w-5 shrink-0"></span>' +
      '<span class="hidden truncate xl:inline">' + item[1] + "</span></a></li>"
    );
  }

  function bottomItem(item, active) {
    var on = item[0] === active;
    return (
      '<a href="#" class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5"' +
      (on ? ' aria-current="page"' : "") + ">" +
      '<span class="flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-short ' +
      (on ? "bg-primary-container text-primary-container-foreground" : "text-muted-foreground") + '">' +
      '<span data-icon="' + item[2] + '" class="h-5 w-5"></span></span>' +
      '<span class="text-2xs font-medium ' + (on ? "text-foreground" : "text-muted-foreground") + '">' + item[1] + "</span></a>"
    );
  }

  /* --------------------------------------------------------------------- *
   * Shell: app bar + sidebar + bottom nav.
   * --------------------------------------------------------------------- */
  function shell(opts) {
    var items = NAV[opts.role] || [];
    var notif = opts.notif || 0;

    var appbar =
      '<header class="sticky top-0 z-nav flex h-14 items-center gap-2 border-b border-outline-variant bg-surface-1/95 px-3 backdrop-blur sm:px-4">' +
      '<button type="button" class="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 md:hidden" aria-label="Buka menu">' +
      '<span data-icon="menu" class="h-5 w-5"></span></button>' +
      '<div class="flex min-w-0 items-center gap-2.5">' +
      '<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">' +
      '<span data-icon="graduation-cap" class="h-[18px] w-[18px]"></span></span>' +
      '<div class="min-w-0 leading-tight">' +
      '<p class="truncate text-sm font-semibold">' + opts.title + "</p>" +
      (opts.subtitle ? '<p class="truncate text-2xs text-muted-foreground">' + opts.subtitle + "</p>" : "") +
      "</div></div>" +

      /* Command palette trigger — the power path for a daily-use admin tool. */
      '<button type="button" data-palette-open class="ml-4 hidden h-9 min-w-[200px] items-center gap-2 rounded-md border border-outline-variant bg-background px-3 text-left text-xs text-muted-foreground transition-colors hover:border-outline lg:flex">' +
      '<span data-icon="search" class="h-4 w-4"></span><span class="flex-1">Cari siswa, kelas, tagihan…</span>' +
      '<kbd class="num rounded border border-outline-variant px-1 py-0.5 text-2xs">Ctrl K</kbd></button>' +

      '<div class="ml-auto flex items-center gap-0.5 sm:gap-1">' +
      (opts.actions || "") +
      '<button type="button" data-palette-open class="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 lg:hidden" aria-label="Cari">' +
      '<span data-icon="search" class="h-5 w-5"></span></button>' +
      '<button type="button" id="theme-toggle" class="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3" aria-label="Ganti mode gelap" aria-pressed="false">' +
      '<span data-icon="moon" class="h-5 w-5" data-theme-icon></span></button>' +
      '<button type="button" class="relative flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3" aria-label="Notifikasi' +
      (notif > 0 ? ", " + notif + " belum dibaca" : "") + '">' +
      '<span data-icon="bell" class="h-5 w-5"></span>' +
      (notif > 0
        ? '<span class="num absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-semibold text-destructive-foreground">' + notif + "</span>"
        : "") +
      "</button>" +
      '<button type="button" class="flex min-h-[44px] items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-3">' +
      '<span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-2xs font-semibold text-primary-container-foreground">' +
      initials(opts.user).toUpperCase() + "</span>" +
      '<span class="hidden text-sm font-medium sm:inline">' + opts.user + "</span>" +
      '<span data-icon="chevron-down" class="hidden h-4 w-4 text-muted-foreground sm:inline"></span></button></div></header>';

    var side =
      '<nav aria-label="Navigasi utama" class="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-16 shrink-0 flex-col border-r border-outline-variant bg-surface-1 p-2 md:flex xl:w-56">' +
      '<ul class="flex-1 space-y-0.5">' + items.map(function (i) { return sideItem(i, opts.active); }).join("") + "</ul>" +
      '<ul class="space-y-0.5 border-t border-outline-variant pt-2">' +
      sideItem(["settings", "Pengaturan", "settings"], opts.active) +
      sideItem(["keluar", "Keluar", "log-out"], opts.active) + "</ul></nav>";

    var bottom =
      '<nav aria-label="Navigasi utama" class="fixed inset-x-0 bottom-0 z-nav flex border-t border-outline-variant bg-surface-1 pb-[env(safe-area-inset-bottom,0px)] md:hidden">' +
      items.slice(0, 5).map(function (i) { return bottomItem(i, opts.active); }).join("") + "</nav>";

    var ab = document.getElementById("appbar"); if (ab) ab.innerHTML = appbar;
    var sb = document.getElementById("sidenav"); if (sb) sb.outerHTML = side;
    var bn = document.getElementById("bottomnav"); if (bn) bn.innerHTML = bottom;

    ensureToastRegion();
    wireTheme();
    wirePalette(opts.role);
    wireSortables(document);
    hydrate(document);
  }

  /* --------------------------------------------------------------------- *
   * Theme — remembered per browser, resilient when storage is blocked.
   * --------------------------------------------------------------------- */
  function applyTheme(dark) {
    document.documentElement.classList.toggle("dark", !!dark);
    document.querySelectorAll("[data-theme-icon]").forEach(function (el) {
      el.setAttribute("data-icon", dark ? "sun" : "moon");
      el.dataset.hydrated = "";
    });
    var btn = document.getElementById("theme-toggle");
    if (btn) btn.setAttribute("aria-pressed", dark ? "true" : "false");
    try { localStorage.setItem("sms-theme", dark ? "dark" : "light"); } catch (e) {}
    hydrate(document);
  }

  function wireTheme() {
    var btn = document.getElementById("theme-toggle");
    if (!btn || btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", function () {
      applyTheme(!document.documentElement.classList.contains("dark"));
    });
  }

  /* --------------------------------------------------------------------- *
   * Toast — polite live region, auto-dismiss in 4s, optional undo.
   * Never steals focus.
   * --------------------------------------------------------------------- */
  function ensureToastRegion() {
    if (document.getElementById("toast-region")) return;
    var r = document.createElement("div");
    r.id = "toast-region";
    r.setAttribute("role", "status");
    r.setAttribute("aria-live", "polite");
    r.className = "no-print";
    document.body.appendChild(r);
  }

  function toast(message, opts) {
    opts = opts || {};
    ensureToastRegion();
    var tone = opts.tone || "neutral";
    var icon = tone === "success" ? "check-circle" : tone === "danger" ? "alert-circle" : tone === "warning" ? "alert-triangle" : "activity";
    var ring = tone === "success" ? "border-success" : tone === "danger" ? "border-destructive" : tone === "warning" ? "border-warning" : "border-outline-variant";
    var el = document.createElement("div");
    el.className = "toast-in flex items-center gap-3 rounded-md border " + ring + " bg-surface-1 px-3 py-2.5 shadow-e3";
    el.innerHTML =
      '<span data-icon="' + icon + '" class="h-4 w-4 shrink-0 text-' + (tone === "neutral" ? "muted-foreground" : tone) + '"></span>' +
      '<span class="flex-1 text-sm">' + message + "</span>" +
      (opts.undo ? '<button type="button" class="rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-surface-3" data-undo>Urungkan</button>' : "") +
      '<button type="button" class="rounded p-1 text-muted-foreground hover:bg-surface-3" aria-label="Tutup notifikasi" data-close>' +
      '<span data-icon="x" class="h-4 w-4"></span></button>';
    document.getElementById("toast-region").appendChild(el);
    hydrate(el);
    var timer = setTimeout(close, opts.duration || 4000);
    function close() { clearTimeout(timer); el.remove(); }
    el.querySelector("[data-close]").addEventListener("click", close);
    var u = el.querySelector("[data-undo]");
    if (u) u.addEventListener("click", function () { close(); if (opts.undo) opts.undo(); });
    return close;
  }

  /* --------------------------------------------------------------------- *
   * Command palette (Ctrl/Cmd+K). Focus is trapped while open and restored
   * on close; Esc always exits.
   * --------------------------------------------------------------------- */
  var PALETTE_BASE = [
    ["Beranda", "layout-dashboard", "Navigasi"],
    ["Input absensi hari ini", "calendar-check", "Absensi"],
    ["Input nilai", "clipboard-list", "Nilai"],
    ["Lihat rapor siswa", "file-text", "Rapor"],
    ["Generate tagihan SPP", "receipt", "SPP"],
    ["Daftar tunggakan", "wallet", "SPP"],
    ["Cari siswa", "users", "Data"],
    ["Buat pengumuman", "megaphone", "Pengumuman"],
    ["Ganti mode gelap", "moon", "Tampilan"],
  ];

  function wirePalette(role) {
    if (document.body.dataset.paletteWired === "1") return;
    document.body.dataset.paletteWired = "1";

    var lastFocus = null;

    function open() {
      if (document.getElementById("palette-scrim")) return;
      lastFocus = document.activeElement;
      var scrim = document.createElement("div");
      scrim.id = "palette-scrim";
      scrim.className = "fixed inset-0 z-palette flex items-start justify-center bg-foreground/50 p-4 pt-[12vh] backdrop-blur-sm no-print";
      scrim.innerHTML =
        '<div id="palette-box" role="dialog" aria-modal="true" aria-label="Palet perintah" class="w-full max-w-lg overflow-hidden rounded-lg border border-outline-variant bg-surface-1 shadow-e3">' +
        '<div class="flex items-center gap-2 border-b border-outline-variant px-3">' +
        '<span data-icon="search" class="h-4 w-4 text-muted-foreground"></span>' +
        '<input id="palette-input" type="text" autocomplete="off" placeholder="Ketik perintah atau nama siswa…" ' +
        'class="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" aria-label="Cari perintah">' +
        '<kbd class="num rounded border border-outline-variant px-1.5 py-0.5 text-2xs text-muted-foreground">Esc</kbd></div>' +
        '<ul id="palette-list" class="max-h-72 overflow-auto p-1.5" role="listbox" aria-label="Hasil"></ul>' +
        '<p class="border-t border-outline-variant px-3 py-2 text-2xs text-muted-foreground">Enter untuk membuka · ↑↓ untuk memilih</p></div>';
      document.body.appendChild(scrim);

      var input = scrim.querySelector("#palette-input");
      var list = scrim.querySelector("#palette-list");
      var cursor = 0, shown = PALETTE_BASE.slice();

      function render() {
        if (!shown.length) {
          list.innerHTML =
            '<li class="px-3 py-8 text-center text-xs text-muted-foreground">Tidak ada hasil. Coba kata kunci lain,' +
            ' misalnya <span class="font-semibold text-foreground">absensi</span>.</li>';
          return;
        }
        list.innerHTML = shown.map(function (c, i) {
          return (
            '<li role="option" aria-selected="' + (i === cursor) + '" data-i="' + i + '" ' +
            'class="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ' +
            (i === cursor ? "bg-primary-container text-primary-container-foreground" : "") + '">' +
            '<span data-icon="' + c[1] + '" class="h-4 w-4 shrink-0 opacity-70"></span>' +
            '<span class="flex-1 truncate">' + c[0] + "</span>" +
            '<span class="text-2xs text-muted-foreground">' + c[2] + "</span></li>"
          );
        }).join("");
        hydrate(list);
      }

      function filter() {
        var q = input.value.toLowerCase().trim();
        shown = PALETTE_BASE.filter(function (c) {
          return !q || (c[0] + " " + c[2]).toLowerCase().indexOf(q) > -1;
        });
        cursor = 0;
        render();
      }

      function run() {
        var c = shown[cursor];
        close();
        if (!c) return;
        if (c[0] === "Ganti mode gelap") { applyTheme(!document.documentElement.classList.contains("dark")); return; }
        toast("Prototipe: <strong>" + c[0] + "</strong> belum terhubung ke backend.", { tone: "neutral" });
      }

      function close() {
        scrim.remove();
        document.removeEventListener("keydown", onKey, true);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }

      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); close(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); cursor = Math.min(cursor + 1, shown.length - 1); render(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); cursor = Math.max(cursor - 1, 0); render(); }
        else if (e.key === "Enter") { e.preventDefault(); run(); }
        else if (e.key === "Tab") { e.preventDefault(); input.focus(); }
      }

      input.addEventListener("input", filter);
      list.addEventListener("click", function (e) {
        var li = e.target.closest("[data-i]");
        if (!li) return;
        cursor = +li.dataset.i;
        run();
      });
      scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });
      document.addEventListener("keydown", onKey, true);
      render();
      input.focus();
    }

    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); }
    });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-palette-open]")) open();
    });
  }

  /* --------------------------------------------------------------------- *
   * Sortable tables — aria-sort is kept in sync so screen readers announce
   * the current order. Opt in with <table class="data" data-sortable>.
   * --------------------------------------------------------------------- */
  function wireSortables(root) {
    (root || document).querySelectorAll("table[data-sortable]").forEach(function (table) {
      if (table.dataset.sortWired === "1") return;
      table.dataset.sortWired = "1";
      var heads = table.querySelectorAll("thead th[data-sort]");
      heads.forEach(function (th, idx) {
        th.setAttribute("aria-sort", "none");
        var label = th.textContent.trim();
        th.innerHTML =
          '<button type="button" class="focus-ring">' + label +
          '<span class="inline-flex flex-col leading-none">' +
          '<span class="sort-asc" aria-hidden="true">▲</span>' +
          '<span class="sort-desc" aria-hidden="true">▼</span></span></button>';
        th.querySelector("button").addEventListener("click", function () {
          var asc = th.getAttribute("aria-sort") !== "ascending";
          heads.forEach(function (h) { h.setAttribute("aria-sort", "none"); });
          th.setAttribute("aria-sort", asc ? "ascending" : "descending");
          var body = table.tBodies[0];
          var rows = Array.prototype.slice.call(body.rows);
          var col = Array.prototype.indexOf.call(th.parentNode.children, th);
          rows.sort(function (a, b) {
            var av = cellValue(a.cells[col]), bv = cellValue(b.cells[col]);
            if (typeof av === "number" && typeof bv === "number") return asc ? av - bv : bv - av;
            return asc ? String(av).localeCompare(String(bv), "id") : String(bv).localeCompare(String(av), "id");
          });
          rows.forEach(function (r) { body.appendChild(r); });
        });
      });
    });
  }

  function cellValue(cell) {
    if (!cell) return "";
    if (cell.dataset && cell.dataset.value != null) {
      var n = parseFloat(cell.dataset.value);
      return isNaN(n) ? cell.dataset.value : n;
    }
    var t = cell.textContent.trim();
    var num = parseFloat(t.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    return isNaN(num) ? t : num;
  }

  /* --------------------------------------------------------------------- *
   * Boot
   * --------------------------------------------------------------------- */
  try {
    var qp = new URLSearchParams(location.search);
    var forced = qp.get("theme");
    var stored = null;
    try { stored = localStorage.getItem("sms-theme"); } catch (e) {}
    var dark = forced ? forced === "dark" : stored ? stored === "dark" : false;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}

  window.SMS = {
    shell: shell, hydrate: hydrate, svg: svg, applyTheme: applyTheme,
    toast: toast, chip: chip, sparkline: sparkline, donut: donut,
    bars: bars, bullet: bullet, nf: nf, rupiah: rupiah,
    wireSortables: wireSortables, NAV: NAV,
  };

  document.addEventListener("DOMContentLoaded", function () {
    hydrate(document);
    wireSortables(document);
    ensureToastRegion();
    var dark = document.documentElement.classList.contains("dark");
    document.querySelectorAll("[data-theme-icon]").forEach(function (el) {
      el.setAttribute("data-icon", dark ? "sun" : "moon");
      el.dataset.hydrated = "";
    });
    hydrate(document);
  });
})();
