/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0B0D0F",
        panel: "#101215",
        panel2: "#0E1013",
        line: "#1D2126",
        line2: "#262B30",
        ink: "#E7E9EA",
        ink2: "#C6CACE",
        dim: "#8B9199",
        dim2: "#6B7178",
        faint: "#5A6169",
        amber: "#E8A33D",
        amberLight: "#F0C989",
        red: "#D6534A",
        green: "#4C9A6A",
        blue: "#5C93B8",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
