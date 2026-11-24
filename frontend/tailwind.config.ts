import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#090D16",
        surface: "#111827",
        "surface-elevated": "#162032",
        "surface-hover": "#1F2B44",
        ink: "#F8FAFC",
        muted: "#94A3B8",
        line: "#1E293B",
        "line-bright": "#334155",
        accent: {
          DEFAULT: "#8B5CF6",
          dark: "#7C3AED",
          light: "#A78BFA",
          soft: "rgba(139, 92, 246, 0.12)",
          glow: "rgba(139, 92, 246, 0.35)",
        },
        brand: {
          cyan: "#06B6D4",
          blue: "#3B82F6",
          indigo: "#6366F1",
          purple: "#A855F7",
        },
        good: {
          DEFAULT: "#10B981",
          soft: "rgba(16, 185, 129, 0.15)",
        },
        warn: {
          DEFAULT: "#F59E0B",
          soft: "rgba(245, 158, 11, 0.15)",
        },
        danger: {
          DEFAULT: "#EF4444",
          soft: "rgba(239, 68, 68, 0.15)",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Space Grotesk", "DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 25px -5px rgba(139, 92, 246, 0.35)",
        "glow-sm": "0 0 12px -2px rgba(139, 92, 246, 0.3)",
        "glow-card": "0 8px 32px -8px rgba(0, 0, 0, 0.8), 0 0 16px -4px rgba(139, 92, 246, 0.15)",
      },
    },
  },
  plugins: [],
};
export default config;
