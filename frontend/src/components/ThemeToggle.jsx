import { useState } from "react";
import { Sun, Moon, Flag } from "lucide-react";
import { getTheme, cycleTheme, THEME_LABEL } from "../lib/theme.js";

/* Cycles dark → light → tricolour. Drop it in a nav or header. */
export default function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = useState(getTheme());
  const next = () => setTheme(cycleTheme());
  const Icon = theme === "light" ? Sun : theme === "india" ? Flag : Moon;
  return (
    <button
      type="button"
      onClick={next}
      title={`Theme: ${THEME_LABEL[theme]} — click to change`}
      aria-label="Change colour theme"
      className={`press grid h-9 w-9 place-items-center border border-white/40 text-white/70 transition-colors hover:bg-white hover:text-black ${className}`}
    >
      <Icon size={14} className={theme === "india" ? "text-[#ff9933]" : ""} />
    </button>
  );
}
