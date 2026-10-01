import type { Config } from "tailwindcss";

/**
 * Promax token system wired into Tailwind.
 * Colors reference CSS variables defined in src/app/globals.css so light/dark
 * modes swap by toggling the `.dark` class on <html>. Never use raw hex in
 * components — always go through these semantic token names.
 *
 * Source of truth: prototype-promax/assets/tw-config.js + theme.css.
 * The `surface-container-*` / `secondary-container` / `tertiary` aliases keep
 * the existing UX component library (frontend/src/components/ui) rendering.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx,js,jsx,mdx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        outline: "hsl(var(--outline) / <alpha-value>)",
        "outline-variant": "hsl(var(--outline-variant) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",

        "surface-1": "hsl(var(--surface-1) / <alpha-value>)",
        "surface-2": "hsl(var(--surface-2) / <alpha-value>)",
        "surface-3": "hsl(var(--surface-3) / <alpha-value>)",
        "surface-4": "hsl(var(--surface-4) / <alpha-value>)",
        "surface-container-low": "hsl(var(--surface-container-low) / <alpha-value>)",
        "surface-container": "hsl(var(--surface-container) / <alpha-value>)",
        "surface-container-high": "hsl(var(--surface-container-high) / <alpha-value>)",
        "surface-container-highest": "hsl(var(--surface-container-highest) / <alpha-value>)",

        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          container: "hsl(var(--primary-container) / <alpha-value>)",
          "container-foreground": "hsl(var(--primary-container-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          container: "hsl(var(--secondary-container) / <alpha-value>)",
          "container-foreground": "hsl(var(--secondary-container-foreground) / <alpha-value>)",
        },
        tertiary: {
          DEFAULT: "hsl(var(--tertiary) / <alpha-value>)",
          foreground: "hsl(var(--tertiary-foreground) / <alpha-value>)",
          container: "hsl(var(--tertiary-container) / <alpha-value>)",
          "container-foreground": "hsl(var(--tertiary-container-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          container: "hsl(var(--accent-container) / <alpha-value>)",
          "container-foreground": "hsl(var(--accent-container-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          container: "hsl(var(--success-container) / <alpha-value>)",
          "container-foreground": "hsl(var(--success-container-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          container: "hsl(var(--warning-container) / <alpha-value>)",
          "container-foreground": "hsl(var(--warning-container-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          container: "hsl(var(--destructive-container) / <alpha-value>)",
          "container-foreground": "hsl(var(--destructive-container-foreground) / <alpha-value>)",
        },
        info: {
          DEFAULT: "hsl(var(--info) / <alpha-value>)",
          container: "hsl(var(--info-container) / <alpha-value>)",
          "container-foreground": "hsl(var(--info-container-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        chart: {
          1: "hsl(var(--chart-1) / <alpha-value>)",
          2: "hsl(var(--chart-2) / <alpha-value>)",
          3: "hsl(var(--chart-3) / <alpha-value>)",
          4: "hsl(var(--chart-4) / <alpha-value>)",
          5: "hsl(var(--chart-5) / <alpha-value>)",
          grid: "hsl(var(--chart-grid) / <alpha-value>)",
        },
      },
      borderRadius: {
        none: "0px",
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "22px",
        full: "9999px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      // Density 8/10 — 13px table text, compact leading.
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.02em" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "21px" }],
      },
      // Density 8/10 — 40px table rows.
      height: {
        10: "40px",
      },
      minHeight: {
        10: "40px",
      },
      boxShadow: {
        e1: "var(--elev-1)",
        e2: "var(--elev-2)",
        e3: "var(--elev-3)",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        emphasized: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        quick: "120ms",
        short: "180ms",
        medium: "260ms",
      },
      zIndex: {
        nav: "40",
        sticky: "30",
        overlay: "80",
        toast: "90",
        palette: "100",
      },
    },
  },
  plugins: [],
};

export default config;
