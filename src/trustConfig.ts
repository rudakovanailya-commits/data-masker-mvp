/** Официальный URL сервиса (для ссылок в интерфейсе). */
export const OFFICIAL_APP_URL = 'https://data-masker-mvp.vercel.app/'

const ALLOWED_HOSTNAMES = new Set([
  'data-masker-mvp.vercel.app',
  'localhost',
  '127.0.0.1',
])

/** Разрешённый hostname (официальный деплой или локальная разработка). */
export function isAllowedHostname(hostname: string): boolean {
  return ALLOWED_HOSTNAMES.has(hostname.toLowerCase())
}
