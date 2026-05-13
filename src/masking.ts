/**
 * Клиентская эвристика поиска чувствительных данных (regex).
 * Не претендует на полноту; приоритет — понятность и предсказуемость.
 */

export type CategoryId =
  | 'org_ip'
  | 'inn'
  | 'ogrn'
  | 'kpp'
  | 'bik'
  | 'settlement_account'
  | 'corr_account'
  | 'bank'
  | 'address'
  | 'cadastre'
  | 'premises'
  | 'email'
  | 'phone'
  | 'fio'
  | 'passport'

/** Тег плейсхолдера без скобок: [ТЕГ_1] */
export type PlaceholderTag =
  | 'ОРГАНИЗАЦИЯ'
  | 'ИП'
  | 'ИНН'
  | 'ОГРН'
  | 'КПП'
  | 'БИК'
  | 'РАСЧЕТНЫЙ_СЧЕТ'
  | 'КОРР_СЧЕТ'
  | 'БАНК'
  | 'АДРЕС'
  | 'КАДАСТРОВЫЙ_НОМЕР'
  | 'ПОМЕЩЕНИЕ'
  | 'EMAIL'
  | 'ТЕЛЕФОН'
  | 'ФИО'
  | 'ПАСПОРТНЫЕ_ДАННЫЕ'

export type FoundEntity = {
  id: string
  categoryId: CategoryId
  /** Подпись типа для таблицы */
  typeLabel: string
  original: string
  placeholder: string
  start: number
  end: number
}

export const CATEGORY_OPTIONS: {
  id: CategoryId
  label: string
}[] = [
  { id: 'org_ip', label: 'Организации / ИП' },
  { id: 'inn', label: 'ИНН' },
  { id: 'ogrn', label: 'ОГРН / ОГРНИП' },
  { id: 'kpp', label: 'КПП' },
  { id: 'bik', label: 'БИК' },
  { id: 'settlement_account', label: 'Расчётный счёт' },
  { id: 'corr_account', label: 'Корреспондентский счёт' },
  { id: 'bank', label: 'Банк' },
  { id: 'fio', label: 'ФИО' },
  { id: 'passport', label: 'Паспортные данные' },
  { id: 'address', label: 'Адреса' },
  { id: 'cadastre', label: 'Кадастровый номер' },
  { id: 'premises', label: 'Помещение / офис / квартира' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Телефон' },
]

type RawMatch = {
  start: number
  end: number
  value: string
  categoryId: CategoryId
  placeholderTag: PlaceholderTag
  typeLabel: string
  priority: number
}

function normalizeForKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/** Обрезает пробелы в совпадении, сохраняя корректные индексы в исходной строке */
function trimMatchRange(
  full: string,
  baseIndex: number,
): { start: number; end: number; value: string } | null {
  const value = full.trim()
  if (!value) return null
  const lead = full.indexOf(value)
  const start = baseIndex + (lead >= 0 ? lead : 0)
  return { start, end: start + value.length, value }
}

/** Не считать «ООО/ПАО …» названием организации в строке «Банк: …» */
function isOrgMatchOnBankLine(text: string, start: number): boolean {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEndIdx = text.indexOf('\n', start)
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx
  const line = text.slice(lineStart, lineEnd)
  return /^\s*(?:Банк|банк)(?:\s+получателя)?\s*[:\-–.]/.test(line)
}

/** Строка с паспортным / правоохранительным контекстом — не банк */
function isPassportOrPoliceContext(line: string): boolean {
  return /МВД|УФМС|ОВД|полици|милици|отделение\s+полиции|отделение\s+милиции|паспорт|выдан/i.test(
    line,
  )
}

/** Рядом с банковскими реквизитами / названием банка */
function lineHasBankKeyword(line: string): boolean {
  return /(?:^|[\s,;])(?:БИК|бик|р\s*\/\s*с|р\.с\.|к\s*\/\s*с|к\.с\.|Банк|банк|наименование\s+банка|банк\s+получателя|Сбербанк|Альфа[\-\s]?Банк|ПАО|АО|ЗАО|ОАО|НКО|ВТБ|Газпром)/i.test(
    line,
  )
}

const FIO_BLOCKLIST = new Set(
  [
    'общество',
    'ограниченной',
    'ответственностью',
    'российской',
    'федерации',
    'федерация',
    'адрес',
    'регистрации',
    'жительства',
    'зарегистрирован',
    'паспорт',
    'выдан',
    'выдана',
    'инн',
    'кпп',
    'огрн',
    'огрнип',
    'бик',
    'ооо',
    'ао',
    'пао',
    'зао',
    'оао',
    'ип',
    'нко',
    'республика',
    'область',
    'край',
    'округ',
    'район',
    'город',
    'деревня',
    'село',
    'посёлок',
    'поселок',
    'улица',
    'проспект',
    'переулок',
    'квартира',
    'корпус',
    'строение',
    'офис',
    'помещение',
    'счёт',
    'счет',
    'расчётный',
    'расчетный',
    'корреспондентский',
    'наименование',
    'организация',
    'учредитель',
    'решение',
    'протокол',
    'заседание',
    'директор',
    'генеральный',
    'главный',
    'бухгалтер',
  ].map((w) => w.toLowerCase()),
)

function isLikelyFio(words: [string, string, string]): boolean {
  for (const w of words) {
    if (w.length < 2 || w.length > 32) return false
    if (FIO_BLOCKLIST.has(w.toLowerCase())) return false
    if (/\d/.test(w)) return false
  }
  return true
}

let idSeq = 0
function nextEntityId(): string {
  idSeq += 1
  return `e_${idSeq}`
}

function mergeOverlapping(raw: RawMatch[]): RawMatch[] {
  const sorted = [...raw].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    const lenA = a.end - a.start
    const lenB = b.end - b.start
    if (lenA !== lenB) return lenB - lenA
    return b.priority - a.priority
  })
  const out: RawMatch[] = []
  for (const m of sorted) {
    if (out.some((s) => m.start < s.end && s.start < m.end)) continue
    out.push(m)
  }
  out.sort((a, b) => a.start - b.start)
  return out
}

function assignPlaceholders(matches: RawMatch[]): FoundEntity[] {
  const keyToPlaceholder = new Map<string, string>()
  const nextByTag = new Map<PlaceholderTag, number>()

  return matches.map((m) => {
    const key = `${m.placeholderTag}::${normalizeForKey(m.value)}`
    let placeholder = keyToPlaceholder.get(key)
    if (!placeholder) {
      const n = (nextByTag.get(m.placeholderTag) ?? 0) + 1
      nextByTag.set(m.placeholderTag, n)
      placeholder = `[${m.placeholderTag}_${n}]`
      keyToPlaceholder.set(key, placeholder)
    }
    return {
      id: nextEntityId(),
      categoryId: m.categoryId,
      typeLabel: m.typeLabel,
      original: m.value,
      placeholder,
      start: m.start,
      end: m.end,
    }
  })
}

function collectRegexMatches(
  text: string,
  re: RegExp,
  map: (m: RegExpMatchArray) => Omit<RawMatch, 'priority' | 'categoryId'> & {
    categoryId: CategoryId
    priority: number
  } | null,
): RawMatch[] {
  const out: RawMatch[] = []
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g'
  const rx = new RegExp(re.source, flags)
  for (const m of text.matchAll(rx)) {
    if (m.index === undefined) continue
    const mapped = map(m)
    if (!mapped) continue
    out.push(mapped)
  }
  return out
}

export function findSensitiveEntities(
  text: string,
  enabled: ReadonlySet<CategoryId>,
): FoundEntity[] {
  idSeq = 0
  const raw: RawMatch[] = []

  if (enabled.has('cadastre')) {
    raw.push(
      ...collectRegexMatches(
        text,
        /\b\d{2}:\d{2}:\d{6,7}:\d{2,}\b/gi,
        (m) => ({
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          categoryId: 'cadastre' as const,
          placeholderTag: 'КАДАСТРОВЫЙ_НОМЕР' as const,
          typeLabel: 'Кадастровый номер',
          priority: 100,
        }),
      ),
    )
  }

  if (enabled.has('email')) {
    raw.push(
      ...collectRegexMatches(
        text,
        /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
        (m) => ({
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          categoryId: 'email' as const,
          placeholderTag: 'EMAIL' as const,
          typeLabel: 'Email',
          priority: 95,
        }),
      ),
    )
  }

  if (enabled.has('phone')) {
    const phoneRes = [
      /\+7[\s\-–]?(?:\(\s*\d{3}\s*\)|\d{3})[\s\-–]?\d{3}[\s\-–]?\d{2}[\s\-–]?\d{2}\b/g,
      /\b8[\s\-–]?(?:\(\s*\d{3}\s*\)|\d{3})[\s\-–]?\d{3}[\s\-–]?\d{2}[\s\-–]?\d{2}\b/g,
    ]
    for (const re of phoneRes) {
      raw.push(
        ...collectRegexMatches(text, re, (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'phone' as const,
            placeholderTag: 'ТЕЛЕФОН' as const,
            typeLabel: 'Телефон',
            priority: 90,
          }
        }),
      )
    }
  }

  if (enabled.has('inn')) {
    raw.push(
      ...collectRegexMatches(text, /\b(?:\d{10}|\d{12})\b/g, (m) => ({
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        categoryId: 'inn' as const,
        placeholderTag: 'ИНН' as const,
        typeLabel: 'ИНН',
        priority: 85,
      })),
    )
  }

  if (enabled.has('ogrn')) {
    raw.push(
      ...collectRegexMatches(text, /\b\d{15}\b/g, (m) => ({
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        categoryId: 'ogrn' as const,
        placeholderTag: 'ОГРН' as const,
        typeLabel: 'ОГРНИП',
        priority: 82,
      })),
    )
    raw.push(
      ...collectRegexMatches(text, /\b\d{13}\b/g, (m) => ({
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        categoryId: 'ogrn' as const,
        placeholderTag: 'ОГРН' as const,
        typeLabel: 'ОГРН',
        priority: 81,
      })),
    )
  }

  if (enabled.has('bik')) {
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:БИК|бик)[\s.:—–-]+(\d{9})\b/gi,
        (m) => {
          const val = m[1] ?? m[0]
          const start = m.index! + m[0].indexOf(val)
          return {
            start,
            end: start + val.length,
            value: val,
            categoryId: 'bik' as const,
            placeholderTag: 'БИК' as const,
            typeLabel: 'БИК',
            priority: 78,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(text, /\b04\d{7}\b/g, (m) => ({
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        categoryId: 'bik' as const,
        placeholderTag: 'БИК' as const,
        typeLabel: 'БИК',
        priority: 76,
      })),
    )
  }

  if (enabled.has('kpp')) {
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:КПП|кпп)[\s.:—–-]+(\d{9})\b/gi,
        (m) => {
          const val = m[1] ?? m[0]
          const start = m.index! + m[0].indexOf(val)
          return {
            start,
            end: start + val.length,
            value: val,
            categoryId: 'kpp' as const,
            placeholderTag: 'КПП' as const,
            typeLabel: 'КПП',
            priority: 74,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(text, /\b\d{9}\b/g, (m) => ({
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        categoryId: 'kpp' as const,
        placeholderTag: 'КПП' as const,
        typeLabel: 'КПП (9 цифр)',
        priority: 30,
      })),
    )
  }

  if (enabled.has('corr_account')) {
    raw.push(
      ...collectRegexMatches(text, /\b301\d{17}\b/g, (m) => ({
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        categoryId: 'corr_account' as const,
        placeholderTag: 'КОРР_СЧЕТ' as const,
        typeLabel: 'Корреспондентский счёт',
        priority: 72,
      })),
    )
  }

  if (enabled.has('settlement_account')) {
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:р\s*\/\s*с|р\.с\.|расч(?:ёт|ет)ный\s+сч(?:ёт|ет)|р\/с)[\s.:—–-]{0,12}(\d{20})\b/giu,
        (m) => {
          const val = m[1] ?? m[0]
          const start = m.index! + m[0].indexOf(val)
          return {
            start,
            end: start + val.length,
            value: val,
            categoryId: 'settlement_account' as const,
            placeholderTag: 'РАСЧЕТНЫЙ_СЧЕТ' as const,
            typeLabel: 'Расчётный счёт',
            priority: 71,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(text, /\b(?:40[78]|408|406|405)\d{17}\b/g, (m) => ({
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        categoryId: 'settlement_account' as const,
        placeholderTag: 'РАСЧЕТНЫЙ_СЧЕТ' as const,
        typeLabel: 'Расчётный счёт',
        priority: 70,
      })),
    )
    raw.push(
      ...collectRegexMatches(text, /\b\d{20}\b/g, (m) => {
        if (/^301\d{17}$/.test(m[0])) return null
        return {
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          categoryId: 'settlement_account' as const,
          placeholderTag: 'РАСЧЕТНЫЙ_СЧЕТ' as const,
          typeLabel: 'Счёт (20 цифр)',
          priority: 35,
        }
      }),
    )
  }

  if (enabled.has('org_ip')) {
    /** Остановка юрлица: запятая, ;, перевод строки, реквизиты, адрес, банк */
    const orgStop =
      '(?=,|;|\\n|\\s+(?:ИНН|КПП|ОГРНИП|ОГРН)\\b|\\s+адрес\\b|\\s+юридический\\b|\\s+г\\.\\s|\\s+город\\b|\\s+ул\\.\\s|\\s+улица\\b|\\s+р\\/\\s*с\\b|\\s+р\\.с\\.|\\s+к\\/\\s*с\\b|\\s+БИК\\b|\\s+[Бб]анк\\b|$)'

    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          '(?:Общество\\s+с\\s+ограниченной\\s+ответственностью|ОБЩЕСТВО\\s+С\\s+ОГРАНИЧЕННОЙ\\s+ОТВЕТСТВЕННОСТЬЮ)\\s*[«"]([^«"»\\n]{2,120})[»"]' +
            orgStop,
          'giu',
        ),
        (m) => {
          if (isOrgMatchOnBankLine(text, m.index!)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r || r.value.length < 12) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'org_ip' as const,
            placeholderTag: 'ОРГАНИЗАЦИЯ' as const,
            typeLabel: 'Организация (ООО полное)',
            priority: 59,
          }
        },
      ),
    )

    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          `(?:ООО|АО|ПАО|ЗАО|ОАО|НКО)\\s+[«"]([^«"»\\n]{2,80})[»"]` + orgStop,
          'giu',
        ),
        (m) => {
          if (isOrgMatchOnBankLine(text, m.index!)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r || r.value.length < 5) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'org_ip' as const,
            placeholderTag: 'ОРГАНИЗАЦИЯ' as const,
            typeLabel: 'Организация',
            priority: 58,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          '(?:ООО|АО|ПАО|ЗАО|ОАО|НКО)\\s+(?![«"])' +
            '(?:[А-ЯЁA-Zа-яё0-9\\-]+)(?:\\s+[А-ЯЁA-Zа-яё0-9\\-]+){0,3}' +
            orgStop,
          'giu',
        ),
        (m) => {
          if (isOrgMatchOnBankLine(text, m.index!)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r || r.value.length < 5) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'org_ip' as const,
            placeholderTag: 'ОРГАНИЗАЦИЯ' as const,
            typeLabel: 'Организация',
            priority: 57,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          'ИП\\s+' +
            '([А-ЯЁA-Z][а-яёa-z\\-]*)\\s+' +
            '([А-ЯЁA-Z][а-яёa-z\\-]*)\\s+' +
            '([А-ЯЁA-Z][а-яёa-z\\-]*)' +
            '(?=\\s*[.,;]|\\n|\\s+(?:ИНН|КПП|ОГРНИП|ОГРН|адрес)\\b|$)',
          'giu',
        ),
        (m) => {
          if (isOrgMatchOnBankLine(text, m.index!)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'org_ip' as const,
            placeholderTag: 'ИП' as const,
            typeLabel: 'ИП',
            priority: 56,
          }
        },
      ),
    )
  }

  if (enabled.has('fio')) {
    const fioRe =
      /\b([А-ЯЁ][а-яё]{1,24})\s+([А-ЯЁ][а-яё]{1,24})\s+([А-ЯЁ][а-яё]{1,24})\b/gu
    raw.push(
      ...collectRegexMatches(text, fioRe, (m) => {
        const w1 = m[1] ?? ''
        const w2 = m[2] ?? ''
        const w3 = m[3] ?? ''
        if (!isLikelyFio([w1, w2, w3])) return null
        const lineStart = text.lastIndexOf('\n', m.index! - 1) + 1
        const lineEndIdx = text.indexOf('\n', m.index!)
        const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
        if (isPassportOrPoliceContext(line)) return null
        if (
          /Общество\s+с\s+ограниченной|ОБЩЕСТВО\s+С\s+ОГРАНИЧЕННОЙ|ООО|ПАО|АО|ЗАО|ОАО|ИП\b/i.test(
            line,
          )
        ) {
          return null
        }
        const r = trimMatchRange(m[0], m.index!)
        if (!r) return null
        return {
          start: r.start,
          end: r.end,
          value: r.value,
          categoryId: 'fio' as const,
          placeholderTag: 'ФИО' as const,
          typeLabel: 'ФИО',
          priority: 54,
        }
      }),
    )
  }

  if (enabled.has('passport')) {
    const passTag = 'ПАСПОРТНЫЕ_ДАННЫЕ' as const
    const passLabel = 'Паспортные данные' as const

    raw.push(
      ...collectRegexMatches(
        text,
        /\bпаспорт\s+гражданина\s+РФ\s+(\d{4})\s*№\s*(\d{6})\b/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'passport' as const,
            placeholderTag: passTag,
            typeLabel: passLabel,
            priority: 67,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\bпаспорт\s+(\d{4})\s+(\d{6})\b/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'passport' as const,
            placeholderTag: passTag,
            typeLabel: passLabel,
            priority: 66,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\bсерия\s+(\d{4})\s+номер\s+(\d{6})\b/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'passport' as const,
            placeholderTag: passTag,
            typeLabel: passLabel,
            priority: 66,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\bкод\s+подразделения\s+(\d{3}-\d{3})\b/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'passport' as const,
            placeholderTag: passTag,
            typeLabel: passLabel,
            priority: 65,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\bдата\s+выдачи\s+(\d{2}\.\d{2}\.\d{4})\b/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'passport' as const,
            placeholderTag: passTag,
            typeLabel: passLabel,
            priority: 65,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:выдан|выдана)\s+(?:ОВД|УФМС|ГУ\s+МВД|МВД|отделением\s+полиции|отделением\s+милиции)\b[^.\n]{0,160}(?:\.|$)/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r || r.value.length < 8) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'passport' as const,
            placeholderTag: passTag,
            typeLabel: passLabel,
            priority: 64,
          }
        },
      ),
    )
  }

  if (enabled.has('bank')) {
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:Банк|банк)(?:\s+получателя)?\s*[:\-–.]\s*[^\n]{2,120}/gu,
        (m) => {
          const lineStart = text.lastIndexOf('\n', m.index! - 1) + 1
          const lineEndIdx = text.indexOf('\n', m.index!)
          const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
          if (isPassportOrPoliceContext(line)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'bank' as const,
            placeholderTag: 'БАНК' as const,
            typeLabel: 'Банк',
            priority: 52,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /наименование\s+банка\s*[:\-–.]\s*[^\n]{2,120}/giu,
        (m) => {
          const lineStart = text.lastIndexOf('\n', m.index! - 1) + 1
          const lineEndIdx = text.indexOf('\n', m.index!)
          const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
          if (isPassportOrPoliceContext(line)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'bank' as const,
            placeholderTag: 'БАНК' as const,
            typeLabel: 'Банк',
            priority: 51,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /банк\s+получателя\s*[:\-–.]\s*[^\n]{2,120}/giu,
        (m) => {
          const lineStart = text.lastIndexOf('\n', m.index! - 1) + 1
          const lineEndIdx = text.indexOf('\n', m.index!)
          const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
          if (isPassportOrPoliceContext(line)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'bank' as const,
            placeholderTag: 'БАНК' as const,
            typeLabel: 'Банк',
            priority: 51,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\bПАО\s+Сбербанк[^\n]{0,80}/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'bank' as const,
            placeholderTag: 'БАНК' as const,
            typeLabel: 'Банк',
            priority: 50,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\bАО\s+Альфа[\-\s]?Банк[^\n]{0,80}/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'bank' as const,
            placeholderTag: 'БАНК' as const,
            typeLabel: 'Банк',
            priority: 50,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:филиал|отделение)\s+[«"]?[А-ЯЁA-Z][^«»\n]{2,60}[»"]?/giu,
        (m) => {
          const lineStart = text.lastIndexOf('\n', m.index! - 1) + 1
          const lineEndIdx = text.indexOf('\n', m.index!)
          const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
          if (isPassportOrPoliceContext(line)) return null
          if (!lineHasBankKeyword(line)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'bank' as const,
            placeholderTag: 'БАНК' as const,
            typeLabel: 'Банк / филиал',
            priority: 48,
          }
        },
      ),
    )
  }

  if (enabled.has('address')) {
    /** До конца строки или перед банковским блоком */
    const addrBankStop = '(?=\\n|Банковские\\s+реквизиты|\\s*БИК\\b|\\s*р\\/\\s*с|\\s*к\\/\\s*с|$)'

    raw.push(
      ...collectRegexMatches(
        text,
        /(?:адрес\s+регистрации|зарегистрирован\s+по\s+адресу|место\s+жительства)\s*:?\s*[^\n]+/giu,
        (m) => {
          const r0 = trimMatchRange(m[0], m.index!)
          if (!r0 || r0.value.length < 10) return null
          let { start, end, value } = r0
          const vt = value.replace(/\.+\s*$/u, '').trimEnd()
          if (vt.length < 10) return null
          if (vt.length !== value.length) {
            end -= value.length - vt.length
            value = vt
          }
          return {
            start,
            end,
            value,
            categoryId: 'address' as const,
            placeholderTag: 'АДРЕС' as const,
            typeLabel: 'Адрес',
            priority: 63,
          }
        },
      ),
    )

    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          '(?:юридический\\s+)?адрес\\s*:?\\s*[^\\n]+?' + addrBankStop,
          'giu',
        ),
        (m) => {
          const r0 = trimMatchRange(m[0], m.index!)
          if (!r0 || r0.value.length < 8) return null
          let { start, end, value } = r0
          const vt = value.replace(/\.+\s*$/u, '').trimEnd()
          if (vt.length < 8) return null
          if (vt.length !== value.length) {
            end -= value.length - vt.length
            value = vt
          }
          return {
            start,
            end,
            value,
            categoryId: 'address' as const,
            placeholderTag: 'АДРЕС' as const,
            typeLabel: 'Адрес',
            priority: 62,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\b\d{6}\s*,(?:\s*Российская\s+Федерация\s*,)?(?:\s*[^,\n]+,\s*){0,2}(?:г\.|город)\s*[^,\n]+(?:,\s*(?:ул\.|улица)\s*[^,\n]+)?(?:,\s*(?:д\.|дом)\s*[^,\n]+)?(?:,\s*(?:кв\.|квартира|оф\.|офис)\s*[^,\n]*)?/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'address' as const,
            placeholderTag: 'АДРЕС' as const,
            typeLabel: 'Адрес',
            priority: 48,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:^|[\s,;])(?:г\.|город)\s+[А-ЯЁA-Zа-яё\-]+(?:\s*,\s*ул\.\s*[^,\n]+)(?:,\s*д\.\s*[^,\n]+)?/giu,
        (m) => {
          const full = m[0]
          const lead = /^[\s,;]/.test(full) ? 1 : 0
          const inner = full.slice(lead)
          const r = trimMatchRange(inner, m.index! + lead)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'address' as const,
            placeholderTag: 'АДРЕС' as const,
            typeLabel: 'Адрес',
            priority: 46,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:^|[\s,;])(?:ул\.|улица|пр-кт|просп\.|проспект|пер\.|переулок|б-р|наб\.|шоссе)\s+[А-ЯЁA-Zа-яё0-9«»".,\s\-]{2,80}(?:,\s*(?:д\.|дом|стр\.|корп\.|лит\.)\s*[^,\n]{1,40})?/giu,
        (m) => {
          const full = m[0]
          const lead = /^[\s,;]/.test(full) ? 1 : 0
          const inner = full.slice(lead)
          const r = trimMatchRange(inner, m.index! + lead)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'address' as const,
            placeholderTag: 'АДРЕС' as const,
            typeLabel: 'Адрес',
            priority: 44,
          }
        },
      ),
    )
  }

  if (enabled.has('premises')) {
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:кв\.|квартир[аы]?|оф\.|офис|пом\.|помещени[ея]|комн\.|комната|каб\.|кабинет)[\s:]*(?:№\s*)?[\w\-\/]+/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'premises' as const,
            placeholderTag: 'ПОМЕЩЕНИЕ' as const,
            typeLabel: 'Помещение / офис / кв.',
            priority: 60,
          }
        },
      ),
    )
  }

  const merged = mergeOverlapping(raw)
  return assignPlaceholders(merged)
}

export type ReplaceableEntity = FoundEntity & { replace: boolean }

export function applyMasking(
  source: string,
  entities: ReadonlyArray<Pick<FoundEntity, 'start' | 'end' | 'placeholder' | 'original'> & { replace: boolean }>,
): string {
  const toApply = entities
    .filter((e) => e.replace)
    .sort((a, b) => b.start - a.start)

  let out = source
  for (const e of toApply) {
    const slice = source.slice(e.start, e.end)
    if (slice !== e.original) continue
    out = out.slice(0, e.start) + e.placeholder + out.slice(e.end)
  }
  return out
}
