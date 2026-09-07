import colors from "tailwindcss/colors";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: "#000000",
        panel: "#000000",
        panel2: "#000000",
        line: "#ffffff",
        line2: "#ffffff",
        ink: "#ffffff",
        ink2: "#ffffff",
        dim: "#ffffff",
        dim2: "#ffffff",
        faint: "#ffffff",
        // Severity is the only permitted colour in the black & white system.
        // Objects keep the numbered shades working AND a bare `*-red` token.
        red: { ...colors.red, DEFAULT: colors.red[500] },
        amber: { ...colors.amber, DEFAULT: colors.amber[500] },
        amberLight: colors.amber[400],
        green: { ...colors.emerald, DEFAULT: colors.emerald[500] },
        emerald: colors.emerald,
        blue: "#ffffff",
      },
      fontFamily: {
        display: ["'Fraunces'", "'Times New Roman'", "Georgia", "serif"],
        sans: ["'Manrope'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        micro: "0.22em",
      },
      spacing: {
        4.5: "1.125rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        fadeIn: "fadeIn 0.4s ease both",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
