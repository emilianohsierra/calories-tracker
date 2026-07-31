// Theming reusable para TODA la app. Fuente de verdad: atributo data-theme en <html>.
// Modo del usuario: 'light' | 'dark' | 'system' (default), persistido en localStorage.
// - light/dark  → data-theme fijo.
// - system      → SIN atributo → el @media (prefers-color-scheme) de globals.css manda.
export const THEME_KEY = 'theme';
export const THEME_COLORS = { light: '#FBFBF9', dark: '#0B0D10' };

export function getStoredTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

// Tema efectivo (resuelve 'system' contra el SO). Devuelve 'light' | 'dark'.
export function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(mode) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (mode === 'light' || mode === 'dark') el.dataset.theme = mode;
  else delete el.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[resolveTheme(mode)]);
}

export function setTheme(mode) {
  try {
    if (mode === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // sin persistencia: al menos se aplica en esta sesión
  }
  applyTheme(mode);
}
