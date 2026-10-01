/* Tailwind Play CDN config — every colour resolves to a semantic token in
   theme.css. Components never carry a raw hex value. */
tailwind.config = {
  darkMode: "class",
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

        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          container: "hsl(var(--primary-container) / <alpha-value>)",
          "container-foreground": "hsl(var(--primary-container-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
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
      },
      borderRadius: { xs: "4px", sm: "6px", md: "10px", lg: "14px", xl: "22px" },
      fontFamily: {
        sans: ["Fira Sans", "system-ui", "sans-serif"],
        mono: ["Fira Code", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.02em" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "21px" }],
      },
      boxShadow: {
        e1: "var(--elev-1)",
        e2: "var(--elev-2)",
        e3: "var(--elev-3)",
      },
      transitionTimingFunction: { standard: "cubic-bezier(0.2,0,0,1)", emphasized: "cubic-bezier(0.2,0,0,1)" },
      transitionDuration: { quick: "120ms", short: "180ms", medium: "260ms" },
      zIndex: { nav: "40", sticky: "30", overlay: "80", toast: "90", palette: "100" },
    },
  },
};
