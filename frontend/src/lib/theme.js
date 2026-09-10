/* Theme: dark (default) · light · india (tricolour accent).
   Applied via [data-theme] on <html> — see index.css. */

const KEY = "ibvap.theme";
export const THEMES = ["dark", "light", "india"];
export const THEME_LABEL = { dark: "Dark", light: "Light", india: "Tricolour" };

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (THEMES.includes(t)) return t;
  } catch {
    /* private mode */
  }
  return "dark";
}

export function applyTheme(t) {
  const theme = THEMES.includes(t) ? t : "dark";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  return theme;
}

export function cycleTheme() {
  const i = THEMES.indexOf(getTheme());
  return applyTheme(THEMES[(i + 1) % THEMES.length]);
}

// call once on boot, before React renders, to avoid a flash
export function initTheme() {
  applyTheme(getTheme());
}
