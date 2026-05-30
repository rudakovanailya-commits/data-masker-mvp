import type { FoundEntity } from './masking'

export type ReplacementMapRow = FoundEntity & { replace: boolean }

const REPLACEMENT_MAP_GROUPS: { title: string; tags: readonly string[] }[] = [
  { title: 'ОРГАНИЗАЦИИ', tags: ['ОРГАНИЗАЦИЯ', 'ИП'] },
  { title: 'ФИО', tags: ['ФИО'] },
  { title: 'ПАСПОРТНЫЕ ДАННЫЕ', tags: ['ПАСПОРТНЫЕ_ДАННЫЕ'] },
  {
    title: 'РЕКВИЗИТЫ',
    tags: ['ИНН', 'КПП', 'ОГРН', 'БИК', 'РАСЧЕТНЫЙ_СЧЕТ', 'КОРР_СЧЕТ', 'СНИЛС'],
  },
  { title: 'БАНКИ', tags: ['БАНК'] },
  { title: 'АДРЕСА', tags: ['АДРЕС'] },
  { title: 'КОНТАКТЫ', tags: ['EMAIL', 'ТЕЛЕФОН', 'САЙТ'] },
  {
    title: 'ДОКУМЕНТЫ / ДОГОВОРЫ',
    tags: ['НОМЕР_ДОГОВОРА', 'НОМЕР_ПРИЛОЖЕНИЯ', 'ДАТА'],
  },
  {
    title: 'ТРАНСПОРТ / ПРОЧЕЕ',
    tags: [
      'VIN',
      'ГОСНОМЕР',
      'ПТС',
      'КАДАСТРОВЫЙ_НОМЕР',
      'ПОМЕЩЕНИЕ',
      'СУММА',
      'СТАВКА',
      'ИГК',
    ],
  },
]

function parsePlaceholder(placeholder: string): { tag: string; index: number } {
  const m = /^\[(.+)_(\d+)\]$/u.exec(placeholder)
  if (!m) return { tag: placeholder, index: 0 }
  return { tag: m[1]!, index: Number(m[2]) }
}

/** Одна строка в файле карты замен: без переносов и лишних пробелов */
export function normalizeMapValue(value: string): string {
  return value.replace(/\r\n|\r|\n|\t/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function comparePlaceholders(
  a: string,
  b: string,
  tagOrder: readonly string[],
): number {
  const pa = parsePlaceholder(a)
  const pb = parsePlaceholder(b)
  const ia = tagOrder.indexOf(pa.tag)
  const ib = tagOrder.indexOf(pb.tag)
  const orderA = ia === -1 ? tagOrder.length : ia
  const orderB = ib === -1 ? tagOrder.length : ib
  if (orderA !== orderB) return orderA - orderB
  return pa.index - pb.index
}

/** Текст файла карты замен по выбранным для замены сущностям */
export function buildReplacementMapText(rows: ReplacementMapRow[]): string {
  const byPlaceholder = new Map<string, string>()
  for (const row of rows) {
    if (!row.replace) continue
    if (!byPlaceholder.has(row.placeholder)) {
      byPlaceholder.set(row.placeholder, normalizeMapValue(row.original))
    }
  }

  const lines: string[] = [
    'КАРТА ЗАМЕН',
    '',
    'Важно: этот файл содержит исходные чувствительные данные. Не передавайте его третьим лицам без необходимости.',
    '',
  ]

  for (const group of REPLACEMENT_MAP_GROUPS) {
    const entries = [...byPlaceholder.entries()]
      .filter(([placeholder]) => group.tags.includes(parsePlaceholder(placeholder).tag))
      .sort(([a], [b]) => comparePlaceholders(a, b, group.tags))

    if (entries.length === 0) continue

    lines.push(group.title)
    for (const [placeholder, original] of entries) {
      lines.push(`${placeholder} — ${original}`)
    }
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

/** Скачать карту замен как replacement-map.txt */
export function downloadReplacementMap(rows: ReplacementMapRow[]): void {
  const text = buildReplacementMapText(rows)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'replacement-map.txt'
  a.click()
  URL.revokeObjectURL(url)
}
