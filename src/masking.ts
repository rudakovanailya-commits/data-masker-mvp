/**
 * Клиентская эвристика поиска чувствительных данных (regex).
 * Не претендует на полноту; приоритет — понятность и предсказуемость.
 */

export type CategoryId =
  | 'org_ip'
  | 'inn'
  | 'ogrn'
  | 'kpp'
  | 'igk'
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
  | 'contract_number'
  | 'document_date'
  | 'money_amount'
  | 'interest_rate'

/** Тег плейсхолдера без скобок: [ТЕГ_1] */
export type PlaceholderTag =
  | 'ОРГАНИЗАЦИЯ'
  | 'ИП'
  | 'ИНН'
  | 'ОГРН'
  | 'КПП'
  | 'ИГК'
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
  | 'НОМЕР_ДОГОВОРА'
  | 'НОМЕР_ПРИЛОЖЕНИЯ'
  | 'ДАТА'
  | 'СУММА'
  | 'СТАВКА'

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
  { id: 'igk', label: 'ИГК / госконтракт' },
  { id: 'bik', label: 'БИК' },
  { id: 'settlement_account', label: 'Расчётный счёт' },
  { id: 'corr_account', label: 'Корреспондентский счёт' },
  { id: 'bank', label: 'Банк' },
  { id: 'fio', label: 'ФИО' },
  { id: 'passport', label: 'Паспортные данные' },
  { id: 'contract_number', label: 'Номер договора' },
  { id: 'document_date', label: 'Даты' },
  { id: 'money_amount', label: 'Денежные суммы' },
  { id: 'interest_rate', label: 'Процентные ставки' },
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

/** Нормализация кавычек в названии организации для группировки плейсхолдера */
function normalizeOrgNameKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[""„]/g, '"')
    .replace(/[«»]/g, '«')
    .toLowerCase()
}

/** Снятие типичных падежных окончаний с одного слова (фамилия) */
function stemRussianSurnameToken(w: string): string {
  let x = w.toLowerCase().replace(/ё/g, 'е')
  if (!x) return x
  if (/ея$/u.test(x) && x.length >= 4) return x.slice(0, -2) + 'ей'
  const fioCaseSuffixesAsc = [
    'а',
    'е',
    'ю',
    'у',
    'я',
    'ой',
    'ым',
    'им',
    'их',
    'ых',
    'ого',
    'его',
    'овну',
    'евну',
    'овны',
    'евны',
    'ова',
    'ева',
    'ина',
    'ича',
    'овича',
    'евича',
  ].sort((a, b) => a.length - b.length || a.localeCompare(b, 'ru'))
  for (const suf of fioCaseSuffixesAsc) {
    if (!x.endsWith(suf)) continue
    const nextLen = x.length - suf.length
    if (nextLen < 4) continue
    return x.slice(0, -suf.length)
  }
  return x
}

function normalizeMoneyAmountKey(value: string): string {
  const d = value.replace(/[^\d]/g, '')
  return d.length >= 4 ? d : normalizeForKey(value)
}

function normalizeInterestRateKey(value: string): string {
  const m = value.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/u)
  return m ? m[1].replace(',', '.') : normalizeForKey(value)
}

function normalizeDocumentDateKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е')
}

/** Токен сразу после последнего знака номера (№ / U+2116) в совпадении */
function tokenAfterLastNoSign(full: string): string | null {
  let idx = full.lastIndexOf('№')
  if (idx === -1) idx = full.lastIndexOf('\u2116')
  if (idx === -1) return null
  const rest = full.slice(idx + 1).trim()
  const m = rest.match(/^(\S+)/u)
  return m?.[1] ?? null
}

/** Номер приложения после «Приложение»: №1, N 1, No 1 (без знака № в тексте) */
function tokenAfterAppendixLabel(full: string): string | null {
  const low = full.toLowerCase()
  const appIdx = low.indexOf('приложение')
  if (appIdx === -1) return null
  const tail = full.slice(appIdx + 'приложение'.length)
  let m = tail.match(/^\s*(?:№|\u2116)\.?\s*(\d+)/iu)
  if (m) return m[1] ?? null
  m = tail.match(/^\s*N\s*o\.?\s*(\d+)/iu)
  if (m) return m[1] ?? null
  m = tail.match(/^\s*N\s+(\d+)/iu)
  if (m) return m[1] ?? null
  return null
}

/** Не считать номером договора ссылку вида 1.1, 2.4 (пункты) */
function isContractClauseRef(ref: string): boolean {
  return /^\d{1,2}\.\d{1,2}(?:\.\d+)?$/u.test(ref.trim())
}

function isLikelyShortFioSurname(w: string): boolean {
  if (w.length < 2 || w.length > 32) return false
  if (FIO_BLOCKLIST.has(w.toLowerCase())) return false
  if (/\d/.test(w)) return false
  return true
}

/** Только для ключа плейсхолдера ФИО: склеивает падежные формы; краткие «Фамилия И.О.» — отдельная ветка */
function normalizePersonNameKey(value: string): string {
  const collapse = value.trim().replace(/\s+/g, ' ')
  const shortM = collapse.match(
    /^([А-ЯЁA-Zа-яё][а-яёa-z\-]{1,30})\s+([А-ЯЁA-Zа-яё]\.)\s*([А-ЯЁA-Zа-яё]\.?)$/u,
  )
  if (shortM) {
    const sur = stemRussianSurnameToken(shortM[1])
    const i1 = shortM[2][0]!.toLowerCase()
    const i2 = (shortM[3][0] ?? '').toLowerCase()
    return `fio2:${sur}:${i1}${i2}`
  }

  const tokens = collapse
    .split(' ')
    .map((t) => t.replace(/^[^\p{L}0-9]+|[^\p{L}0-9]+$/gu, ''))
    .filter(Boolean)

  const basis = collapse
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()

  if (tokens.length !== 3) {
    return tokens.length > 0
      ? tokens.join(' ').toLowerCase().replace(/ё/g, 'е')
      : basis
  }

  const fioCaseSuffixesAsc = [
    'а',
    'е',
    'ю',
    'у',
    'я',
    'ой',
    'ым',
    'им',
    'их',
    'ых',
    'ого',
    'его',
    'овну',
    'евну',
    'овны',
    'евны',
    'ова',
    'ева',
    'ина',
    'ича',
    'овича',
    'евича',
  ].sort((a, b) => a.length - b.length || a.localeCompare(b, 'ru'))

  const stemOneWord = (word: string): string => {
    let w = word.toLowerCase().replace(/ё/g, 'е')
    if (!w) return w

    if (/ея$/u.test(w) && w.length >= 4) {
      w = w.slice(0, -2) + 'ей'
      return w
    }

    for (const suf of fioCaseSuffixesAsc) {
      if (!w.endsWith(suf)) continue
      const nextLen = w.length - suf.length
      if (nextLen < 4) continue
      return w.slice(0, -suf.length)
    }
    return w
  }

  return tokens.map(stemOneWord).join(' ')
}

/** Удаляет из фрагмента ИГК пробелы, дефисы, точки, № для проверки длины и ключа */
function cleanIgkPayload(s: string): string {
  return s.replace(/[\s\-–.\u00A0№N°]+/gu, '')
}

/** Ключ группировки ИГК по «сухому» номеру (без метки и разделителей) */
function normalizeIgkKey(value: string): string {
  const payload = value
    .replace(
      /^(?:идентификатор\s+государственного\s+контракта\s*(?::|№\s*)?|государственного\s+контракта\s*№\s*|государственный\s+контракт\s*№\s*|ИГК\s*(?::|№\s*)?)\s*/iu,
      '',
    )
    .replace(/^\s*№\.?\s*/iu, '')
    .trim()
  const c = cleanIgkPayload(payload).toLowerCase()
  return c.length >= 10 ? c : normalizeForKey(value)
}

/**
 * После окончания метки ИГК выделяет номер: цифры с разделителями или «плотный» буквенно-цифровой блок.
 * Не захватывает короткие номера договора (например «№ 12»).
 */
function extractIgkIdRange(text: string, afterLabel: number): { idStart: number; end: number } | null {
  let j = afterLabel
  while (j < text.length && /[\s\u00A0]/.test(text[j])) j++
  const nm = text.slice(j).match(/^№\.?\s*/iu)
  if (nm) {
    j += nm[0].length
    while (j < text.length && /[\s\u00A0]/.test(text[j])) j++
  }
  const idStart = j
  if (idStart >= text.length) return null

  let k = idStart
  if (/\d/u.test(text[idStart])) {
    while (k < text.length) {
      const c = text[k]
      if (/\d/u.test(c)) {
        k++
        continue
      }
      if (/[\s\-–.\u00A0]/u.test(c)) {
        let t = k
        while (t < text.length && /[\s\-–.\u00A0]/u.test(text[t])) t++
        if (t < text.length && /\d/u.test(text[t])) {
          k = t
          continue
        }
        break
      }
      break
    }
    const raw = text.slice(idStart, k)
    const clean = cleanIgkPayload(raw)
    if (!/^\d+$/u.test(clean) || clean.length < 10 || clean.length > 30) return null
    return { idStart, end: k }
  }

  if (/[\p{L}\p{N}]/u.test(text[idStart])) {
    while (k < text.length && /[\p{L}\p{N}\-–.]/u.test(text[k])) k++
    const raw = text.slice(idStart, k)
    const clean = cleanIgkPayload(raw)
    if (clean.length < 10) return null
    if (/^\d+$/u.test(clean) && (clean.length < 10 || clean.length > 30)) return null
    return { idStart, end: k }
  }

  return null
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

/** Обрезает распознанный адрес по квартире/этажу и стоп-фразам */
function trimAddressCandidate(value: string): string {
  let v = value.replace(/\r\n/g, '\n').trimEnd()
  if (!v) return v

  const stopRe =
    /(?:,\s*единственный\s+участник|\s+единственный\s+участник|\s*\(далее|\s+руководствуясь|\s+принял\s+следующие\s+решения|(?:^|[\s,;])Подпись\b|\n+\s*\d+\.\s|,\s*Обществ[ао]\s+с\s+ограниченной|\b1\.\s*Изменить|\b2\.\s*Зарегистрировать)/giu

  let stopAt = v.length
  stopRe.lastIndex = 0
  let sm: RegExpExecArray | null
  while ((sm = stopRe.exec(v)) !== null) {
    if (sm.index >= 0 && sm.index < stopAt) stopAt = sm.index
  }

  const head = v.slice(0, stopAt)

  const unitRe =
    /(?:кв\.|квартира|помещение|оф\.|офис|пом\.)\s*(?:№\s*)?[\d\-/]+|(?:этаж|Этаж)\s*[\d\-/]+/giu
  let unitEnd = -1
  unitRe.lastIndex = 0
  while ((sm = unitRe.exec(head)) !== null) {
    unitEnd = sm.index + sm[0].length
  }

  let out = unitEnd > 0 ? head.slice(0, unitEnd) : head
  out = out.replace(/[,\s;.\u00A0]+$/u, '').trimEnd()
  return out
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
  return /МВД|УФМС|ОВД|полици|милици|отделение\s+полиции|отделение\s+милиции|паспорт|выдан|серия|№\s*подр|подр\.|подразделения|код\s+подразделения/i.test(
    line,
  )
}

/** Значение совпадения «банк» не должно относиться к паспорту / ОВД */
function isBankValuePassportNoise(value: string): boolean {
  return /милици|полици|мвд|уфмс|овд|паспорт|выдан|подр\.|подразделения|серия\s*:|номер\s*\d/i.test(
    value,
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
    'общества',
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
    const keyPart =
      m.categoryId === 'fio'
        ? normalizePersonNameKey(m.value)
        : m.categoryId === 'igk'
          ? normalizeIgkKey(m.value)
          : m.categoryId === 'org_ip' &&
              (m.placeholderTag === 'ОРГАНИЗАЦИЯ' || m.placeholderTag === 'ИП')
            ? normalizeOrgNameKey(m.value)
            : m.categoryId === 'money_amount'
              ? normalizeMoneyAmountKey(m.value)
              : m.categoryId === 'interest_rate'
                ? normalizeInterestRateKey(m.value)
                : m.categoryId === 'document_date'
                  ? normalizeDocumentDateKey(m.value)
                  : normalizeForKey(m.value)
    const key = `${m.placeholderTag}::${keyPart}`
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

  if (enabled.has('igk')) {
    const igkLabelRe =
      /(?:идентификатор\s+государственного\s+контракта\s*(?::|№\s*)?|государственного\s+контракта\s*№\s*|государственный\s+контракт\s*№\s*|ИГК\s*(?::|№\s*)?)/giu
    for (const m of text.matchAll(igkLabelRe)) {
      if (m.index === undefined) continue
      const labelEnd = m.index + m[0].length
      const idRange = extractIgkIdRange(text, labelEnd)
      if (!idRange) continue
      const start = m.index
      const end = idRange.end
      const value = text.slice(start, end)
      const r = trimMatchRange(value, start)
      if (!r) continue
      raw.push({
        start: r.start,
        end: r.end,
        value: r.value,
        categoryId: 'igk' as const,
        placeholderTag: 'ИГК' as const,
        typeLabel: 'ИГК / идентификатор государственного контракта',
        priority: 75,
      })
    }
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
    /** Остановка юрлица: запятая, ;, перевод строки, реквизиты, адрес, банк, «(далее …)» */
    const orgStop =
      '(?=,|;|\\n|\\s*\\(|\\s+(?:ИНН|КПП|ОГРНИП|ОГРН)\\b|\\s+адрес\\b|\\s+юридический\\b|\\s+г\\.\\s|\\s+город\\b|\\s+ул\\.\\s|\\s+улица\\b|\\s+р\\/\\s*с\\b|\\s+р\\.с\\.|\\s+к\\/\\s*с\\b|\\s+БИК\\b|\\s+[Бб]анк\\b|$)'

    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          '(?:Обществ[ао]|ОБЩЕСТВ[АО])\\s+с\\s+ограниченной\\s+ответственностью\\s*[«"]([^«"»\\n]{2,120})[»"]' +
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
      /(?:^|[\s,.:;()_\-])(?!Обществ)([А-ЯЁ][а-яё]{1,24})\s+([А-ЯЁ][а-яё]{1,24})\s+((?:[А-ЯЁ][а-яё]*(?:ович|евич|вна|ична|ича|оглы|кызы|ич)(?:[аеиоуыья])?)|(?:[А-ЯЁ][а-яё]{7,}))(?=[\s,.:;()\]_\-]|$)/gu
    raw.push(
      ...collectRegexMatches(text, fioRe, (m) => {
        const w1 = m[1] ?? ''
        const w2 = m[2] ?? ''
        const w3 = m[3] ?? ''
        if (!isLikelyFio([w1, w2, w3])) return null
        const inner = `${w1} ${w2} ${w3}`
        const start = m.index! + m[0].indexOf(w1)
        const end = start + inner.length
        const lineStart = text.lastIndexOf('\n', start - 1) + 1
        const lineEndIdx = text.indexOf('\n', start)
        const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
        const posInLine = start - lineStart
        const low = line.toLowerCase()
        const passportAt = low.indexOf('паспорт')
        if (passportAt !== -1 && posInLine >= passportAt) return null
        const beforeInLine = line.slice(0, posInLine)
        if (/милици|полици|мвд|уфмс|овд|выдан|подразделения|№\s*подр|подр\./i.test(beforeInLine))
          return null
        return {
          start,
          end,
          value: inner,
          categoryId: 'fio' as const,
          placeholderTag: 'ФИО' as const,
          typeLabel: 'ФИО',
          priority: 54,
        }
      }),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:^|[\s,.:;()_\-])([А-ЯЁ][а-яё]{1,24})\s+([А-ЯЁ]\.\s*[А-ЯЁ]\.)(?=[\s,.:;()\]_\-]|$)/gu,
        (m) => {
          const w1 = m[1] ?? ''
          const w2 = (m[2] ?? '').replace(/\s+/g, ' ')
          if (!isLikelyShortFioSurname(w1)) return null
          const inner = `${w1} ${w2}`
          const start = m.index! + m[0].indexOf(w1)
          const end = start + inner.length
          const lineStart = text.lastIndexOf('\n', start - 1) + 1
          const lineEndIdx = text.indexOf('\n', start)
          const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
          const posInLine = start - lineStart
          const low = line.toLowerCase()
          const passportAt = low.indexOf('паспорт')
          if (passportAt !== -1 && posInLine >= passportAt) return null
          const beforeInLine = line.slice(0, posInLine)
          if (/милици|полици|мвд|уфмс|овд|выдан|подразделения|№\s*подр|подр\./i.test(beforeInLine))
            return null
          return {
            start,
            end,
            value: inner,
            categoryId: 'fio' as const,
            placeholderTag: 'ФИО' as const,
            typeLabel: 'ФИО (инициалы)',
            priority: 53,
          }
        },
      ),
    )
  }

  if (enabled.has('passport')) {
    const passTag = 'ПАСПОРТНЫЕ_ДАННЫЕ' as const
    const passLabel = 'Паспортные данные' as const

    raw.push(
      ...collectRegexMatches(
        text,
        /паспорт\s+гражданина\s+РФ[\s\S]{15,900}?(?=,\s*место\s+(?:регистрации|жительства)|,\s*адрес\s+регистрации|,\s*единственный)/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r || r.value.length < 25) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'passport' as const,
            placeholderTag: passTag,
            typeLabel: passLabel,
            priority: 70,
          }
        },
      ),
    )

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

  if (enabled.has('contract_number')) {
    const cnPri = 68
    const noNum = '(?:№|\\u2116)'
    const contractRes: RegExp[] = [
      new RegExp(`Государственный\\s+контракт\\s+[\\s\\S]{0,200}?${noNum}\\s*\\S+`, 'giu'),
      new RegExp(`Договор\\s+[\\s\\S]{0,420}?${noNum}\\s*\\S+`, 'giu'),
      new RegExp(`Договор\\s*${noNum}\\s*\\S+`, 'giu'),
      new RegExp(`договору\\s+[\\s\\S]{0,320}?${noNum}\\s*\\S+`, 'giu'),
      new RegExp(`Контракт\\s+[\\s\\S]{0,280}?${noNum}\\s*\\S+`, 'giu'),
      new RegExp(`Контракт\\s*${noNum}\\s*\\S+`, 'giu'),
      new RegExp(`к\\s+Договору\\s+[\\s\\S]{0,420}?${noNum}\\s*\\S+`, 'giu'),
    ]
    for (const re of contractRes) {
      raw.push(
        ...collectRegexMatches(text, re, (m) => {
          const full = m[0]
          if (/приложение/i.test(full)) return null
          const tok = tokenAfterLastNoSign(full)
          if (!tok || isContractClauseRef(tok)) return null
          const r = trimMatchRange(full, m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'contract_number' as const,
            placeholderTag: 'НОМЕР_ДОГОВОРА' as const,
            typeLabel: 'Номер договора / документа' as const,
            priority: cnPri,
          }
        }),
      )
    }

    const apxRes: RegExp[] = [
      /Приложение\s*(?:№|\u2116)\.?\s*\d+/giu,
      /Приложение\s*N\s*o\.?\s*\d+/giu,
      /Приложение\s*N\s+\d+/giu,
    ]
    for (const re of apxRes) {
      raw.push(
        ...collectRegexMatches(text, re, (m) => {
          const full = m[0]
          const tok = tokenAfterAppendixLabel(full)
          if (!tok || isContractClauseRef(tok)) return null
          const r = trimMatchRange(full, m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'contract_number' as const,
            placeholderTag: 'НОМЕР_ПРИЛОЖЕНИЯ' as const,
            typeLabel: 'Номер приложения' as const,
            priority: cnPri,
          }
        }),
      )
    }
  }

  if (enabled.has('interest_rate')) {
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:Процентная\s+ставка\s+)?\d{1,3}(?:[.,]\d+)?\s*%(?:\s*годовых)?/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'interest_rate' as const,
            placeholderTag: 'СТАВКА' as const,
            typeLabel: 'Процентная ставка',
            priority: 57,
          }
        },
      ),
    )
  }

  if (enabled.has('document_date')) {
    const dtPri = 56
    const dtTag = 'ДАТА' as const
    const dtLabel = 'Дата документа / срок' as const
    raw.push(
      ...collectRegexMatches(
        text,
        /\b(?:[12]?\d|3[01])\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(?:19|20)\d{2}(?:\s+года?)?\b/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'document_date' as const,
            placeholderTag: dtTag,
            typeLabel: dtLabel,
            priority: dtPri,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\b(?:0[1-9]|[12]\d|3[01])\.(?:0[1-9]|1[0-2])\.(?:19|20)\d{2}\s*г\.?\b/gu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'document_date' as const,
            placeholderTag: dtTag,
            typeLabel: dtLabel,
            priority: dtPri,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\b(?:янв|февр|мар|апр|ма[йя]|июн|июл|авг|сент|окт|ноя|дек)\.\s*(?:[1-9]|[12]\d)(?:\s*г\.?)?\b/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'document_date' as const,
            placeholderTag: dtTag,
            typeLabel: dtLabel,
            priority: dtPri,
          }
        },
      ),
    )
  }

  if (enabled.has('money_amount')) {
    const sumPri = 51
    const sumTag = 'СУММА' as const
    const sumLabel = 'Денежная сумма' as const
    raw.push(
      ...collectRegexMatches(
        text,
        /\d{1,3}(?:\s+\d{3})+\s+рубл(?:я|ей|ь)(?:\s+\d{2}\s*копеек)?/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'money_amount' as const,
            placeholderTag: sumTag,
            typeLabel: sumLabel,
            priority: sumPri,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /\b(?:\d{1,3}(?:\s+\d{3})+|\d{5,}),\d{2}(?!\s*%)\b/gu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          if (/^\d{1,2}\.\d{1,2}$/.test(r.value.split(',')[0] ?? '')) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'money_amount' as const,
            placeholderTag: sumTag,
            typeLabel: sumLabel,
            priority: sumPri,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:сумма\s+займа|основной\s+долг)(?:\s+составляет|\s+выдается)?\s+((?:\d{1,3}(?:\s+\d{3})+|\d{5,})(?:,\d{2})?)/giu,
        (m) => {
          const val = m[1] ?? ''
          const start = m.index! + m[0].indexOf(val)
          const end = start + val.length
          const value = text.slice(start, end)
          const r = trimMatchRange(value, start)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'money_amount' as const,
            placeholderTag: sumTag,
            typeLabel: sumLabel,
            priority: sumPri,
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
          if (isBankValuePassportNoise(r.value)) return null
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
          if (isBankValuePassportNoise(r.value)) return null
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
          if (isBankValuePassportNoise(r.value)) return null
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
          if (isBankValuePassportNoise(r.value)) return null
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
          if (isBankValuePassportNoise(r.value)) return null
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
          if (isBankValuePassportNoise(r.value)) return null
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
        /(?:адрес\s+регистрации|место\s+регистрации|зарегистрирован\s+по\s+адресу|место\s+жительства)\s*:?\s*[^\n]+/giu,
        (m) => {
          const r0 = trimMatchRange(m[0], m.index!)
          if (!r0 || r0.value.length < 10) return null
          let { start, value } = r0
          const vt = value.replace(/\.+\s*$/u, '').trimEnd()
          if (vt.length < 10) return null
          const trimmed = trimAddressCandidate(vt)
          if (trimmed.length < 10) return null
          return {
            start,
            end: start + trimmed.length,
            value: trimmed,
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
        /\b\d{6},\s*Город\s+[^\n]+/giu,
        (m) => {
          const r0 = trimMatchRange(m[0], m.index!)
          if (!r0 || r0.value.length < 18) return null
          let { start, value } = r0
          const vt = value.replace(/\.+\s*$/u, '').trimEnd()
          if (vt.length < 18) return null
          const trimmed = trimAddressCandidate(vt)
          if (trimmed.length < 18) return null
          return {
            start,
            end: start + trimmed.length,
            value: trimmed,
            categoryId: 'address' as const,
            placeholderTag: 'АДРЕС' as const,
            typeLabel: 'Адрес (орг.)',
            priority: 61,
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
          let { start, value } = r0
          const vt = value.replace(/\.+\s*$/u, '').trimEnd()
          if (vt.length < 8) return null
          if (/на\s+следующий/i.test(vt)) return null
          const trimmed = trimAddressCandidate(vt)
          if (trimmed.length < 8) return null
          return {
            start,
            end: start + trimmed.length,
            value: trimmed,
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
          const trimmed = trimAddressCandidate(r.value)
          if (trimmed.length < 12) return null
          return {
            start: r.start,
            end: r.start + trimmed.length,
            value: trimmed,
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
        /\b\d{6}\s*,\s*[^,\n]+,\s*ул\.?\s+[^,\n]+(?:,\s*[^,\n]+){0,14}/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          const trimmed = trimAddressCandidate(r.value)
          if (trimmed.length < 12) return null
          return {
            start: r.start,
            end: r.start + trimmed.length,
            value: trimmed,
            categoryId: 'address' as const,
            placeholderTag: 'АДРЕС' as const,
            typeLabel: 'Адрес',
            priority: 47,
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
          const trimmed = trimAddressCandidate(r.value)
          if (trimmed.length < 8) return null
          return {
            start: r.start,
            end: r.start + trimmed.length,
            value: trimmed,
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
          const trimmed = trimAddressCandidate(r.value)
          if (trimmed.length < 8) return null
          return {
            start: r.start,
            end: r.start + trimmed.length,
            value: trimmed,
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
