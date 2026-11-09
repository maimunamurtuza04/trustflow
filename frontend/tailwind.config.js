/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#070d18",
          900: "#0a1120",
          850: "#0d1626",
          800: "#111c2f",
          750: "#152238",
          700: "#1a2a43",
          600: "#22344f",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        panel: "0 18px 48px -24px rgba(0, 0, 0, 0.65)",
        glow: "0 0 0 1px rgba(52, 211, 153, 0.22), 0 18px 60px -24px rgba(16, 185, 129, 0.35)",
      },
      animation: {
        "fade-in": "fadeIn 0.35s ease-out both",
        "slide-up": "slideUp 0.35s ease-out both",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
