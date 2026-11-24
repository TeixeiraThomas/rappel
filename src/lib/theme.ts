/** Applique le thème (sombre par défaut, clair, ou celui du système). */
export function applyTheme(theme: 'dark' | 'light' | 'auto') {
  const resolved = theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f4f5f8' : '#0f1115')
}
