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
  | 'website'
  | 'phone'
  | 'fio'
  | 'passport'
  | 'snils'
  | 'contract_number'
  | 'vin'
  | 'vehicle_plate'
  | 'pts'
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
  | 'САЙТ'
  | 'ТЕЛЕФОН'
  | 'ФИО'
  | 'ПАСПОРТНЫЕ_ДАННЫЕ'
  | 'СНИЛС'
  | 'НОМЕР_ДОГОВОРА'
  | 'НОМЕР_ПРИЛОЖЕНИЯ'
  | 'VIN'
  | 'ГОСНОМЕР'
  | 'ПТС'
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
  /** Убрать фрагмент без вставки плейсхолдера (хвост адреса после [АДРЕС_N]) */
  removeOnly?: boolean
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
  { id: 'snils', label: 'СНИЛС' },
  { id: 'contract_number', label: 'Номер договора' },
  { id: 'vin', label: 'VIN / кузов' },
  { id: 'vehicle_plate', label: 'Госномер ТС' },
  { id: 'pts', label: 'ПТС / ЭПТС' },
  { id: 'document_date', label: 'Даты' },
  { id: 'money_amount', label: 'Денежные суммы' },
  { id: 'interest_rate', label: 'Процентные ставки' },
  { id: 'address', label: 'Адреса' },
  { id: 'cadastre', label: 'Кадастровый номер' },
  { id: 'premises', label: 'Помещение / офис / квартира' },
  { id: 'email', label: 'Email' },
  { id: 'website', label: 'Сайт / домен' },
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

function normalizeDigitsKey(value: string): string {
  return value.replace(/\D/g, '')
}

function normalizeEmailKey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeWebsiteKey(value: string): string {
  let v = value.trim().toLowerCase()
  v = v.replace(/^https?:\/\//iu, '').replace(/^www\./iu, '')
  return v.replace(/\/+$/u, '')
}

/** Ключ ФИО для плейсхолдера: без склонений, только пробелы и инициалы */
function normalizeFioPlaceholderKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\.\s*/gu, '.')
    .toLowerCase()
    .replace(/ё/g, 'е')
}

function stripOrgLegalFormPrefix(v: string): string {
  return v
    .replace(/^(?:общество\s+с\s+ограниченной\s+ответственностью)\s+/iu, '')
    .replace(/^(?:ооо|ао|пао|зао|оао|нко|ип)\s+/iu, '')
    .trim()
}

function normalizeOrgInnerNameToken(quoted: string): string {
  return quoted
    .replace(/^[«""„]+|[»""]+$/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
}

/** Нормализация названия организации для группировки плейсхолдера */
function normalizeOrgNameKey(value: string): string {
  const compact = value.trim().replace(/\s+/g, ' ')

  const ruQuoted = compact.match(/«(?:[^»]+|«[^»]+)»/u)
  if (ruQuoted) return `n:${normalizeOrgInnerNameToken(ruQuoted[0])}`

  const enQuoted = compact.match(/"(?:[^"]+|"[^"]+)"/u)
  if (enQuoted) return `n:${normalizeOrgInnerNameToken(enQuoted[0])}`

  const stripped = stripOrgLegalFormPrefix(
    compact.toLowerCase().replace(/ё/g, 'е').replace(/[«»""„]/g, ''),
  )
  return stripped ? `r:${stripped}` : compact.toLowerCase().replace(/ё/g, 'е')
}

function normalizeEntityKey(m: RawMatch): string {
  switch (m.categoryId) {
    case 'fio':
      return normalizeFioPlaceholderKey(m.value)
    case 'org_ip':
      if (m.placeholderTag === 'ОРГАНИЗАЦИЯ' || m.placeholderTag === 'ИП') {
        return normalizeOrgNameKey(m.value)
      }
      return normalizeForKey(m.value)
    case 'inn':
    case 'kpp':
    case 'ogrn':
    case 'bik':
    case 'settlement_account':
    case 'corr_account':
      return normalizeDigitsKey(m.value)
    case 'email':
      return normalizeEmailKey(m.value)
    case 'website':
      return normalizeWebsiteKey(m.value)
    case 'igk':
      return normalizeIgkKey(m.value)
    case 'vin':
      return normalizeVinKey(m.value)
    case 'vehicle_plate':
      return normalizeVehiclePlateKey(m.value)
    case 'money_amount':
      return normalizeMoneyAmountKey(m.value)
    case 'interest_rate':
      return normalizeInterestRateKey(m.value)
    case 'document_date':
      return normalizeDocumentDateKey(m.value)
    case 'snils':
      return normalizeDigitsKey(m.value)
    default:
      return normalizeForKey(m.value)
  }
}

function normalizeMoneyAmountKey(value: string): string {
  const d = value.replace(/[^\d]/g, '')
  return d.length >= 4 ? d : normalizeForKey(value)
}

/** Номер СНИЛС: 11 цифр с разделителями или без (XXX-XXX-XXX XX / 15213651629) */
const SNILS_NUMBER_RE = /\d{3}[\-–\s]?\d{3}[\-–\s]?\d{3}[\-–\s]?\d{2}|\d{11}/u

function parseSnilsValue(raw: string): string | null {
  const trimmed = raw.trim()
  if (!SNILS_NUMBER_RE.test(trimmed)) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length !== 11) return null
  return trimmed
}

function mapSnilsNumberMatch(
  m: RegExpMatchArray,
  priority = 73,
): Omit<RawMatch, 'priority' | 'categoryId'> & { categoryId: CategoryId; priority: number } | null {
  const val = m[1] ?? ''
  const parsed = parseSnilsValue(val)
  if (!parsed) return null
  const start = m.index! + m[0].indexOf(val)
  return {
    start,
    end: start + val.length,
    value: parsed,
    categoryId: 'snils' as const,
    placeholderTag: 'СНИЛС' as const,
    typeLabel: 'СНИЛС',
    priority,
  }
}

const SNILS_CTX_INSURANCE =
  /(?:Страховое\s+свидетельство\s+обязательного\s+пенсионного\s+страхования\s+)(\d{3}[\-–\s]?\d{3}[\-–\s]?\d{3}[\-–\s]?\d{2}|\d{11})(?=$|[^\d\-–\s])/giu

const SNILS_CTX_LABEL =
  /(?:^|[^\p{L}\p{N}_])(?:СНИЛС|снилс)\s*(?::|№)?\s*(\d{3}[\-–\s]?\d{3}[\-–\s]?\d{3}[\-–\s]?\d{2}|\d{11})(?=$|[^\d\-–\s])/giu

const SNILS_CTX_PENSION =
  /(?:пенсионного\s+страхования\s+)(\d{3}[\-–\s]?\d{3}[\-–\s]?\d{3}[\-–\s]?\d{2}|\d{11})(?=$|[^\d\-–\s])/giu

function extractVinPayload(value: string): string | null {
  // VIN: 17 символов, латиница+цифры, без I/O/Q
  const m = value.match(/\b([A-HJ-NPR-Z0-9]{17})\b/u)
  return m?.[1] ?? null
}

function normalizeVinKey(value: string): string {
  const payload = extractVinPayload(value)
  return payload ? payload.toUpperCase() : normalizeForKey(value)
}

function normalizeVehiclePlateKey(value: string): string {
  // Нормализация похожих латинских букв к кириллице
  const map: Record<string, string> = {
    A: 'А',
    B: 'В',
    E: 'Е',
    K: 'К',
    M: 'М',
    H: 'Н',
    O: 'О',
    P: 'Р',
    C: 'С',
    T: 'Т',
    Y: 'У',
    X: 'Х',
  }
  const m = value.match(/\b([АВЕКМНОРСТУХABEKMHOPCTYXA]\d{3}[АВЕКМНОРСТУХABEKMHOPCTYXA]{2}\d{2,3})\b/u)
  const raw = (m?.[1] ?? value).toUpperCase()
  return raw.replace(/[ABEKMHOPCTYX]/g, (ch) => map[ch] ?? ch)
}

function normalizeInterestRateKey(value: string): string {
  const m = value.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/u)
  return m ? m[1].replace(',', '.') : normalizeForKey(value)
}

function isValidPtsNumber(value: string): boolean {
  const digits = value.replace(/[^\d]/g, '')
  return digits.length >= 8 && digits.length <= 15
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

/** Реальный номер/код после № (не заглушка даты, не «г.___», не пустой хвост) */
function isValidContractNumberToken(tok: string): boolean {
  const t = tok.trim()
  if (t.length < 2 || t.length > 64) return false
  if (isContractClauseRef(t)) return false
  if (/^[_\-.«»"'`№\s]+$/u.test(t)) return false
  if (/_{2,}/u.test(t) && !/\d/u.test(t)) return false
  if (/^г\./iu.test(t) && !/\d{2,}/u.test(t)) return false
  if (/^«\s*_+\s*»$/u.test(t)) return false

  const digits = (t.match(/\d/gu) ?? []).length
  const letters = (t.match(/\p{L}/gu) ?? []).length
  const core = t.replace(/[^\p{L}\p{N}]/gu, '')
  if (core.length < 1) return false
  if (/^\d+$/u.test(t) && digits >= 2) return true
  if (digits >= 3) return true
  if (digits >= 1 && letters >= 1 && core.length >= 4) return true
  return false
}

/** В той же строке перед № есть контекст договора (заголовок, не приложение) */
function isContractNumberLineContext(line: string, noIdx: number): boolean {
  const before = line.slice(0, noIdx)
  if (!/договор/iu.test(before)) return false
  if (/приложение\s*$/iu.test(before.trimEnd())) return false
  if (/^(?:приложение|форма|таблица|форм[аы])\b/iu.test(line.trimStart())) return false
  return true
}

function isLikelyShortFioSurname(w: string): boolean {
  if (w.length < 2 || w.length > 32) return false
  const low = w.toLowerCase()
  if (FIO_BLOCKLIST.has(low)) return false
  if (FIO_PREPOSITION_WORDS.has(low)) return false
  if (isFioPartyRoleWord(w)) return false
  if (/\d/.test(w)) return false
  return true
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

  const bankInlineStopRe =
    /(?:^|[\s,;(\n])(?:р\/\s*с|р\.с\.|расч(?:ёт|ет)ный(?:\s+|\s*\n\s*)сч(?:ёт|ет)|расчетный(?:\s+|\s*\n\s*)счет|расч(?:ёт|ет)ный|расчетный|к\/\s*с|корр(?:\.|\/)?\s*с|бик|банк|инн|кпп|огрн(?:ип)?|в\s+[^\n]{0,72}?(?:банке|филиале))(?=$|[^\p{L}\p{N}_])/giu

  let stopAt = v.length
  let sm: RegExpExecArray | null
  for (const re of [stopRe, bankInlineStopRe]) {
    re.lastIndex = 0
    while ((sm = re.exec(v)) !== null) {
      const at = sm.index + (sm[0].length - sm[0].trimStart().length)
      if (at >= 0 && at < stopAt) stopAt = at
    }
  }

  const head = v.slice(0, stopAt)

  const unitRe =
    /(?:кв\.|квартира|помещение|помещ\.|оф\.|офис|пом\.)\s*(?:№\s*)?[\d\-/]+|(?:литера|лит\.)\s*[А-ЯЁA-Z\d]+|(?:этаж|Этаж)\s*[\d\-/]+/giu
  let unitEnd = -1
  unitRe.lastIndex = 0
  while ((sm = unitRe.exec(head)) !== null) {
    unitEnd = sm.index + sm[0].length
  }

  let out = unitEnd > 0 ? head.slice(0, unitEnd) : head
  out = out.replace(/[,\s;.\u00A0]+$/u, '').trimEnd()
  return out
}

/** Обрезка адреса без метки: стоп-фразы и реквизиты, но не отрезать город/индекс после помещения */
function trimUnlabeledAddressCandidate(value: string): string {
  let v = value.replace(/\r\n/g, '\n').trimEnd()
  if (!v) return v

  const bankInlineStopRe =
    /(?:^|[\s,;(\n])(?:р\/\s*с|р\.с\.|расч(?:ёт|ет)ный(?:\s+|\s*\n\s*)сч(?:ёт|ет)|расчетный(?:\s+|\s*\n\s*)счет|расч(?:ёт|ет)ный|расчетный|к\/\s*с|корр(?:\.|\/)?\s*с|бик|банк|инн|кпп|огрн(?:ип)?)(?=$|[^\p{L}\p{N}_])/giu

  let stopAt = v.length
  let sm: RegExpExecArray | null
  bankInlineStopRe.lastIndex = 0
  while ((sm = bankInlineStopRe.exec(v)) !== null) {
    const at = sm.index + (sm[0].length - sm[0].trimStart().length)
    if (at >= 0 && at < stopAt) stopAt = at
  }

  return v
    .slice(0, stopAt)
    .replace(/[,\s;.\u00A0]+$/u, '')
    .trimEnd()
}

function isValidAddressCandidate(value: string): boolean {
  const v = value.toLowerCase()

  // не ловим заголовки
  if (/^адреса\s+и\s+реквизиты/u.test(v)) {
    return false
  }

  // не ловим служебные фразы
  if (/по\s+адресу,\s*указан/i.test(v)) {
    return false
  }

  if (/в\s+адрес\s+(ооо|ао|пао|ип)/i.test(v)) {
    return false
  }

  // у настоящего адреса должны быть признаки адреса
  const hasAddressMarkers =
    /\b\d{6}\b/u.test(v) ||
    /\b(?:г\.|город|ул\.|улица|наб\.|набережная|проспект|пр\.|пр-кт|д\.|дом|корп\.|к\.|кв\.|оф\.|офис|пом\.|помещение|лит\.|литера|а\/я|обл\.|область|санкт[\s-]?петербург|санктпетербург|москва)\b/iu.test(
      v,
    )

  if (!hasAddressMarkers) {
    return false
  }

  return true
}

/** Метки явного адреса (длинные ветки раньше короткой «Адрес») */
const LABELED_ADDRESS_LABEL_RE =
  /(?:Юридический\s+адрес|Почтовый\s+адрес|Адрес\s+места\s+нахождения|Адрес\s+регистрации|Место\s+нахождения|Место\s+регистрации|Место\s+жительства|зарегистрирован\s+по\s+адресу)\s*:?\s*|Адрес\s*:\s*/giu

/** Без /g — не трогает lastIndex глобального LABELED_ADDRESS_LABEL_RE при exec по срезу */
const LABELED_ADDRESS_LABEL_ANCHOR_RE = new RegExp(LABELED_ADDRESS_LABEL_RE.source, 'iu')

/** Строка начинается с банковского реквизита (в т.ч. «Расчётный» / «счёт:» на отдельных строках) */
function isBankRequisiteLineStart(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (
    /^(?:ИНН|КПП|ОГРН(?:ИП)?|БИК|Расчётный|Расчетный|Расчётный\s+счёт|Расчетный\s+счет|Р\/\s*с|р\/\s*с|к\/\s*с|Корр|корр|Банк)\b/iu.test(
      t,
    )
  ) {
    return true
  }
  if (/^(?:счёт|счет)\s*:/iu.test(t)) return true
  if (/^в\s+/iu.test(t) && /(?:банке|филиале)\b/iu.test(t)) return true
  return false
}

/** Новая строка реквизитов / следующего блока — конец многострочного адреса */
const LABELED_ADDRESS_LINE_STOP_RE =
  /^(?:ИНН|КПП|ОГРН(?:ИП)?|БИК|Расчётный|Расчетный|Расчётный\s+счёт|Расчетный\s+счет|счёт\s*:|счет\s*:|Р\/\s*с|р\/\s*с|к\/\s*с|Корр|корр|Банк|Телефон|Email|E-mail|Директор|Генеральный\s+директор|Подпись|Покупатель|Продавец|Исполнитель|Заказчик)\b/iu

const ADDRESS_CONTINUATION_MARKERS_RE =
  /(?:\d{6}|г\.|город|ул\.|улица|наб\.|набережная|проспект|пр\.|пр-кт|просп\.?|пер\.|переулок|б-р|бульвар|ш\.|шоссе|д\.|дом|лит\.|литера|литер|пом\.|помещение|офис|кв\.|квартира|а\/я|российская|республика|респ\.|санкт|петербург|санктпетербург|москва|обл\.|область|край)/iu

/** Улица/набережная в шапке без метки «Адрес:» */
const UNLABELED_ADDR_STREET_RE =
  /(?:НАБЕРЕЖНАЯ|НАБ\.|УЛИЦА|УЛ\.|ПРОСПЕКТ|ПРОСП\.|ПР\.|ПР-КТ|ПЕРЕУЛОК|ПЕР\.|ШОССЕ|Ш\.|БУЛЬВАР|Б-Р|набережная|наб\.|улица|ул\.|проспект|пр\.|пр-кт)/iu

function isUnlabeledAddressAnchorLine(line: string): boolean {
  const t = line.trim()
  if (t.length < 12 || t.length > 200) return false
  if (isBankRequisiteLineStart(t) || LABELED_ADDRESS_LINE_STOP_RE.test(t)) return false
  if (/^(?:ДОГОВОР|СОГЛАШЕНИЕ|КОНТРАКТ|ПРИЛОЖЕНИЕ|ФОРМА|ТАБЛИЦА|ПРОТОКОЛ)\b/iu.test(t)) return false
  if (/адрес\s*:/iu.test(t)) return false
  if (!UNLABELED_ADDR_STREET_RE.test(t)) return false
  if (!/\d/u.test(t)) return false
  return true
}

function isUnlabeledAddressContinuationLine(line: string): boolean {
  const t = normalizeAddressLineRaw(line).trim()
  if (!t) return false
  if (isBankRequisiteLineStart(t) || LABELED_ADDRESS_LINE_STOP_RE.test(t)) return false
  return (
    ADDRESS_CONTINUATION_MARKERS_RE.test(t) ||
    /\b(?:литер|лит\.|литера)\b/iu.test(t) ||
    /^[А-ЯЁA-Z0-9][А-ЯЁA-Z0-9\s.,\-]{2,120}$/u.test(t)
  )
}

function scoreUnlabeledAddressBlock(block: string): number {
  const v = block.toLowerCase().replace(/\s+/g, ' ')
  let score = 0
  if (UNLABELED_ADDR_STREET_RE.test(block)) score++
  if (/\b\d{6}\b/u.test(v)) score++
  if (/(?:санкт[\s-]?петербург|санктпетербург|москва|\bг\.|,?\s*г\s*,)/iu.test(v)) score++
  if (/(?:литер|лит\.|литера|помещение|пом\.|квартира|кв\.)/iu.test(v)) score++
  if (/,\s*\d{1,4}\b|(?:^|[\s,])\d{1,4}\s*,/u.test(v)) score++
  return score
}

function isValidUnlabeledAddressBlock(block: string): boolean {
  if (block.length < 20 || block.length > 320) return false
  if (/^(?:адреса\s+и\s+реквизиты|договор)\b/iu.test(block.trim())) return false
  if (/(?:^|\n)\s*(?:ИНН|КПП|ОГРН|Р\/\s*с|БИК)\b/im.test(block)) return false
  return scoreUnlabeledAddressBlock(block) >= 3
}

function extractUnlabeledAddressRange(
  text: string,
  lineStart: number,
): { start: number; end: number; value: string } | null {
  const maxLines = 4
  const maxSpan = 280
  let cur = lineStart
  let lineIdx = 0
  let blockEnd = lineStart

  while (lineIdx < maxLines && blockEnd - lineStart < maxSpan) {
    const nl = text.indexOf('\n', cur)
    const lineEnd = nl === -1 ? text.length : nl
    const line = normalizeAddressLineRaw(text.slice(cur, lineEnd))
    const inlineStop = addressLineEndBeforeInlineBank(line)
    const effective = line.slice(0, inlineStop).trimEnd()

    if (!effective) {
      if (lineIdx === 0) return null
      break
    }

    if (lineIdx === 0 && !isUnlabeledAddressAnchorLine(effective)) return null
    if (lineIdx > 0 && !isUnlabeledAddressContinuationLine(effective)) break

    blockEnd = cur + inlineStop
    lineIdx++

    if (nl === -1 || inlineStop < line.length) break
    cur = nl + 1
  }

  const rawValue = text.slice(lineStart, blockEnd).replace(/\r\n/g, '\n').trimEnd()
  if (!rawValue) return null
  return { start: lineStart, end: lineStart + rawValue.length, value: rawValue }
}

function collectUnlabeledHeaderAddresses(text: string): RawMatch[] {
  const out: RawMatch[] = []
  let offset = 0
  let nl = text.indexOf('\n')
  if (nl === -1) nl = text.length

  while (offset < text.length) {
    const lineEnd = nl === -1 ? text.length : nl
    const line = text.slice(offset, lineEnd)
    if (isUnlabeledAddressAnchorLine(line)) {
      const block = extractUnlabeledAddressRange(text, offset)
      if (block) {
        const trimmed = trimUnlabeledAddressCandidate(block.value)
        if (trimmed.length >= 20 && isValidUnlabeledAddressBlock(trimmed)) {
          out.push({
            start: block.start,
            end: block.start + trimmed.length,
            value: trimmed,
            categoryId: 'address',
            placeholderTag: 'АДРЕС',
            typeLabel: 'Адрес (без метки)',
            priority: 43,
          })
        }
      }
    }
    offset = lineEnd + 1
    nl = text.indexOf('\n', offset)
  }

  return out
}

function normalizeAddressLineRaw(line: string): string {
  return line.replace(/\r/g, '').replace(/\u00a0/g, ' ')
}

/** Обрезка строки адреса перед встроенным банковским реквизитом */
function addressLineEndBeforeInlineBank(line: string): number {
  const bankInlineStopRe =
    /(?:^|[\s,;(\n])(?:р\/\s*с|р\.с\.|расч(?:ёт|ет)ный(?:\s+|\s*\n\s*)сч(?:ёт|ет)|расчетный(?:\s+|\s*\n\s*)счет|расч(?:ёт|ет)ный|расчетный|к\/\s*с|корр(?:\.|\/)?\s*с|корр(?:еспондентский)?\s+сч(?:ёт|ет)?|бик|банк|инн|кпп|огрн(?:ип)?)(?=$|[^\p{L}\p{N}_])/giu
  let stopAt = line.length
  let sm: RegExpExecArray | null
  bankInlineStopRe.lastIndex = 0
  while ((sm = bankInlineStopRe.exec(line)) !== null) {
    const at = sm.index + (sm[0].length - sm[0].trimStart().length)
    if (at >= 0 && at < stopAt) stopAt = at
  }
  return stopAt
}

function isLabeledAddressContinuationLine(line: string): boolean {
  const t = normalizeAddressLineRaw(line).trim()
  if (!t) return false
  if (isBankRequisiteLineStart(line)) return false
  if (LABELED_ADDRESS_LINE_STOP_RE.test(t)) return false
  if (/^в\s+адрес\b/iu.test(t)) return false
  if (/^адреса\s+и\s+реквизиты/iu.test(t)) return false
  return (
    ADDRESS_CONTINUATION_MARKERS_RE.test(t) ||
    /^[А-ЯЁа-яё][А-ЯЁа-яё0-9\s.,\-]{1,120}$/u.test(t)
  )
}

type LabeledAddressSpan = { start: number; end: number }

/** Один проход по тексту: границы адресов с меткой (для защиты от дублей) */
function collectLabeledAddressSpans(text: string): LabeledAddressSpan[] {
  const spans: LabeledAddressSpan[] = []
  LABELED_ADDRESS_LABEL_RE.lastIndex = 0
  let lm: RegExpExecArray | null
  while ((lm = LABELED_ADDRESS_LABEL_RE.exec(text)) !== null) {
    const labelStart = lm.index
    const block = extractLabeledAddressRange(text, labelStart)
    if (!block) continue
    const trimmed = trimAddressCandidate(block.value)
    if (trimmed.length < 8 || !isValidAddressCandidate(trimmed)) continue
    spans.push({ start: block.start, end: block.start + trimmed.length })
  }
  return spans
}

/** Строка продолжения адреса с меткой «Адрес:» уже покрыта этим блоком */
function overlapsLabeledAddress(
  start: number,
  end: number,
  labeledSpans: readonly LabeledAddressSpan[],
): boolean {
  for (const span of labeledSpans) {
    if (start < span.end && end > span.start) return true
  }
  return false
}

/** Тело адреса с меткой: до 4 строк, не более ~360 символов от метки */
function extractLabeledAddressRange(
  text: string,
  labelStart: number,
): { start: number; end: number; value: string } | null {
  const head = text.slice(labelStart)
  const labelMatch = LABELED_ADDRESS_LABEL_ANCHOR_RE.exec(head)
  if (!labelMatch || labelMatch.index !== 0) return null

  const maxSpan = 420
  let lineStart = labelStart + labelMatch[0].length
  let end = lineStart
  let lineIdx = 0

  while (lineIdx < 6 && lineStart - labelStart < maxSpan) {
    const nl = text.indexOf('\n', lineStart)
    const lineEnd = nl === -1 ? text.length : nl
    const line = normalizeAddressLineRaw(text.slice(lineStart, lineEnd))
    const inlineStop = addressLineEndBeforeInlineBank(line)
    const effective = line.slice(0, inlineStop).trimEnd()
    const hitInlineBank = inlineStop < line.length

    if (!effective) {
      if (nl === -1) break
      lineStart = nl + 1
      continue
    }

    if (isBankRequisiteLineStart(effective)) break
    if (lineIdx > 0 && !isLabeledAddressContinuationLine(effective)) break

    end = lineStart + inlineStop
    lineIdx++

    if (nl === -1 || hitInlineBank) break
    lineStart = nl + 1
  }

  const rawValue = text.slice(labelStart, end).replace(/\r\n/g, '\n').trimEnd()
  if (!rawValue) return null
  return { start: labelStart, end: labelStart + rawValue.length, value: rawValue }
}

/** «пом. N» внутри только что найденного адреса с меткой — не выделять как помещение */
function isPremisesInsideLabeledAddress(text: string, start: number, end: number): boolean {
  const windowStart = Math.max(0, start - 420)
  const before = text.slice(windowStart, start)
  let lastLabelEnd = -1
  const labelRe = new RegExp(LABELED_ADDRESS_LABEL_RE.source, 'giu')
  let lm: RegExpExecArray | null
  while ((lm = labelRe.exec(before)) !== null) {
    lastLabelEnd = windowStart + lm.index + lm[0].length
  }
  if (lastLabelEnd < 0) return false
  const segment = text.slice(lastLabelEnd, end)
  if (/(?:ИНН|КПП|ОГРН(?:ИП)?)\b/i.test(segment)) return false
  return /(?:\d{6}|г\.|город|ул\.|улица|наб\.|набережная|д\.|дом|лит\.|пом\.|помещение|офис|кв\.)/i.test(
    segment,
  )
}

/** Заголовок договора / формы — не название организации */
function isOrgInContractTitleContext(text: string, start: number, value: string): boolean {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEndIdx = text.indexOf('\n', start)
  const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx).trim()
  if (/^(?:ДОГОВОР|СОГЛАШЕНИЕ|КОНТРАКТ|ПРОТОКОЛ|ПРИЛОЖЕНИЕ|ФОРМА|ТАБЛИЦА)\b/iu.test(line)) return true
  if (
    !/[«""]/.test(value) &&
    !/^(?:ООО|АО|ПАО|ЗАО|ОАО|НКО|ИП)(?=$|[\s,.:;(\[])/iu.test(value.trim())
  ) {
    return true
  }
  return false
}

/** Не считать «ООО/ПАО …» названием организации в строке «Банк: …» */
function isOrgMatchOnBankLine(text: string, start: number): boolean {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEndIdx = text.indexOf('\n', start)
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx
  const line = text.slice(lineStart, lineEnd)
  return /^\s*(?:Банк|банк)(?:\s+получателя)?\s*[:\-–.]/.test(line)
}

/** «в банке ПАО …» — название банка, не организация стороны */
function isOrgAfterVBankePrefix(text: string, start: number): boolean {
  const before = text.slice(Math.max(0, start - 32), start)
  return /(?:^|[^\p{L}\p{N}_])в\s+банке\s*$/iu.test(before)
}

const GOV_ORG_MAX_LEN = 140

function isFalseGovernmentOrgValue(value: string): boolean {
  const v = value.trim()
  if (v.length < 5 || v.length > GOV_ORG_MAX_LEN) return true
  if (/\b(?:ИНН|КПП|ОГРН|телефон|тел\.|адрес)\s*:/iu.test(v)) return true
  if (/(?:пр-кт|просп\.|литера\s*[а-яёa-z]|,\s*\d{6}\s*,)/iu.test(v)) return true
  if (/^[,.\d\s]+$/u.test(v)) return true
  return false
}

function mapGovernmentOrgMatch(
  text: string,
  m: RegExpMatchArray,
  typeLabel = 'Гос. орган',
): Omit<RawMatch, 'priority' | 'categoryId'> & { categoryId: CategoryId; priority: number } | null {
  if (isOrgMatchOnBankLine(text, m.index!)) return null
  const inner = (m[1] ?? m[0]).trim()
  const lead = m[0].indexOf(inner)
  const start = m.index! + (lead >= 0 ? lead : 0)
  const end = start + inner.length
  if (isFalseGovernmentOrgValue(inner)) return null
  return {
    start,
    end,
    value: inner,
    categoryId: 'org_ip' as const,
    placeholderTag: 'ОРГАНИЗАЦИЯ' as const,
    typeLabel,
    priority: 57,
  }
}

/** Госорганы: МИНФИН, ФНС, УФНС, ИФНС, Федеральная налоговая служба */
function collectGovernmentOrgMatches(text: string): RawMatch[] {
  const region = '[^\\n,;)(]{2,80}'
  const stop =
    '(?=$|[\\s,;)(\\n]|\\s+Телефон|\\s+тел\\.|\\s+(?:ИНН|КПП|ОГРН)(?![\\p{L}\\p{N}_]))'
  const specs: Array<{ re: RegExp; label: string }> = [
    {
      label: 'ИФНС (межрайонная, многостр.)',
      re: new RegExp(
        `Межрайонная\\s+инспекция\\s+Федеральной\\s+налоговой[\\s\\n]{0,4}службы\\s+№\\s*\\d{1,4}(?:\\s+по\\s+${region})?${stop}`,
        'giu',
      ),
    },
    {
      label: 'ИФНС (межрайонная)',
      re: new RegExp(
        `Межрайонная\\s+ИФНС\\s+России\\s+№\\s*\\d{1,4}(?:\\s+по\\s+${region})?${stop}`,
        'giu',
      ),
    },
    {
      label: 'УФНС',
      re: new RegExp(`УФНС\\s+России(?:\\s+по\\s+${region})?${stop}`, 'giu'),
    },
    {
      label: 'ИФНС',
      re: new RegExp(
        `(?<![\\p{L}\\p{N}_])ИФНС\\s+России\\s+№\\s*\\d{1,4}(?:\\s+по\\s+${region})?${stop}`,
        'giu',
      ),
    },
    {
      label: 'ФНС',
      re: new RegExp(
        `(?<![\\p{L}\\p{N}_])ФНС\\s+России(?:\\s+по\\s+${region})?${stop}`,
        'giu',
      ),
    },
    {
      label: 'Федеральная налоговая служба',
      re: new RegExp(
        `(?<![\\p{L}\\p{N}_])Федеральная\\s+налоговая\\s+служба${stop}`,
        'giu',
      ),
    },
    {
      label: 'МИНФИН России',
      re: new RegExp(`(?<![\\p{L}\\p{N}_])МИНФИН\\s+России${stop}`, 'giu'),
    },
  ]

  const out: RawMatch[] = []
  for (const { re, label } of specs) {
    for (const m of text.matchAll(re)) {
      const mapped = mapGovernmentOrgMatch(text, m, label)
      if (mapped) out.push(mapped)
    }
  }
  return out
}

/** Строка с паспортным / правоохранительным контекстом — не банк */
function isPassportOrPoliceContext(line: string): boolean {
  return /МВД|УФМС|УМВД|ОВД|полици|милици|отделение\s+полиции|отделение\s+милиции|паспорт|выдан|серия|№\s*подр|подр\.|подразделения|код\s+подразделения/i.test(
    line,
  )
}

/** Значение совпадения «банк» не должно относиться к паспорту / ОВД */
function isBankValuePassportNoise(value: string): boolean {
  return /милици|полици|мвд|уфмс|умвд|овд|паспорт|выдан|подр\.|подразделения|серия\s*:|номер\s*\d/i.test(
    value,
  )
}

const PASSPORT_BLOCK_STOP_LINE_RE =
  /^(?:Страховое\s+свидетельство|СНИЛС|\s*ИНН\b|КПП\b|ОГРН(?:ИП)?\b|зарегистрирован|по\s+адресу|адрес\s+регистрации|место\s+регистрации)/iu

const PASSPORT_KP_LINE_RE =
  /^(?:к\/п|код\s+подразделения|№\s*подр\.?|подр\.|подразделени[ея])/iu

/** Многострочный паспортный блок: серия/номер, «выдан …», к/п и дата на следующей строке */
function extractMultilinePassportRange(
  text: string,
  labelStart: number,
): { start: number; end: number; value: string } | null {
  const head = text.slice(labelStart)
  if (!/^(?:Паспорт|паспорт)\s+(?:\d{2}\s*\d{2}|\d{4})\s*(?:(?:№|N)\s*)?\d{6}/iu.test(head)) {
    return null
  }
  if (!/выдан/i.test(head.slice(0, 520))) return null

  let cur = labelStart
  let end = labelStart
  let nonEmptyLines = 0
  let sawKpOrDate = false

  while (nonEmptyLines < 5 && cur - labelStart < 720) {
    const nl = text.indexOf('\n', cur)
    const lineEnd = nl === -1 ? text.length : nl
    const trimmed = text.slice(cur, lineEnd).trim()

    if (!trimmed) {
      if (sawKpOrDate) break
      end = lineEnd
      if (nl === -1) break
      cur = nl + 1
      continue
    }

    if (nonEmptyLines > 0 && PASSPORT_BLOCK_STOP_LINE_RE.test(trimmed)) break

    if (nonEmptyLines > 0) {
      const isKp = PASSPORT_KP_LINE_RE.test(trimmed)
      const hasDate = /\d{2}\.\d{2}\.\d{4}/.test(trimmed)
      if (!isKp && !hasDate) break
      if (isKp || hasDate) sawKpOrDate = true
    }

    end = lineEnd
    nonEmptyLines++
    if (nl === -1) break
    cur = nl + 1
  }

  const value = text.slice(labelStart, end).replace(/\r\n/g, '\n').trimEnd()
  if (value.length < 24) return null
  if (!/(?:к\/п|код\s+подразделения)/iu.test(value) && !/\d{2}\.\d{2}\.\d{4}/.test(value)) {
    return null
  }
  return { start: labelStart, end: labelStart + value.length, value }
}

function collectMultilinePassportBlocks(text: string): RawMatch[] {
  const passTag = 'ПАСПОРТНЫЕ_ДАННЫЕ' as const
  const passLabel = 'Паспортные данные' as const
  const out: RawMatch[] = []
  const startRe =
    /(?:^|[^\p{L}\p{N}_])((?:Паспорт|паспорт)\s+(?:\d{2}\s*\d{2}|\d{4})\s*(?:(?:№|N)\s*)?\d{6})/giu
  for (const m of text.matchAll(startRe)) {
    if (m.index === undefined) continue
    const labelStart = m.index + m[0].length - (m[1]?.length ?? 0)
    const block = extractMultilinePassportRange(text, labelStart)
    if (!block) continue
    out.push({
      start: block.start,
      end: block.end,
      value: block.value,
      categoryId: 'passport',
      placeholderTag: passTag,
      typeLabel: passLabel,
      priority: 72,
    })
  }
  return out
}

const ADDRESS_CITY_INDEX_LINE_RE =
  /^(?:Санкт[\s-]?Петербург|Санктпетербург|Москва|Санкт-Петербург)(?:\s*,\s*Россия)?(?:\s*,\s*\d{6})?$/iu

function isAddressCityIndexContinuationLine(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 96) return false
  if (
    /^(?:ИНН|КПП|ОГРН|БИК|Телефон|Email|E-mail|ООО|АО|ПАО|Страховое|СНИЛС|паспорт|Паспорт)/iu.test(
      t,
    )
  ) {
    return false
  }
  if (/^\[(?:АДРЕС|ПОМЕЩЕНИЕ|ИНН|БИК)_/iu.test(t)) return false
  if (ADDRESS_CITY_INDEX_LINE_RE.test(t)) return true
  if (/^\d{6}$/u.test(t)) return true
  return /\b\d{6}\b/u.test(t) && /(?:санкт|петербург|москва)/iu.test(t)
}

function gapBeforeAddressCityTail(text: string, addressEnd: number): number | null {
  const gap = text.slice(addressEnd)
  const m = gap.match(/^[\s,\n]*(?:\[(?:ПОМЕЩЕНИЕ|АДРЕС)_\d+\][\s,\n]*)*/u)
  if (m === null) return null
  const pos = addressEnd + m[0].length
  let p = pos
  while (p < text.length && /[\s\n]/.test(text[p])) p++
  return p
}

function extendAddressMatchesWithCityTail(text: string, matches: RawMatch[]): void {
  for (const m of matches) {
    if (m.categoryId !== 'address') continue
    const scan = gapBeforeAddressCityTail(text, m.end)
    if (scan === null) continue
    const lineEnd = text.indexOf('\n', scan)
    const line = text.slice(scan, lineEnd === -1 ? text.length : lineEnd)
    if (!isAddressCityIndexContinuationLine(line)) continue
    const lineEndPos = lineEnd === -1 ? text.length : lineEnd
    m.end = lineEndPos
    m.value = text.slice(m.start, lineEndPos).replace(/\r\n/g, '\n').trimEnd()
  }
}

/** Хвост «Санкт-Петербург, 191167» сразу после плейсхолдеров адреса — удаляется при замене */
function collectAddressPlaceholderCityTails(text: string): RawMatch[] {
  const out: RawMatch[] = []
  const re =
    /(?<=\[АДРЕС_\d+\](?:\s*,\s*\[ПОМЕЩЕНИЕ_\d+\])?[\s\n]*(?:\n\s*\n\s*))((?:Санкт[\s-]?Петербург|Санктпетербург|Москва|Санкт-Петербург)(?:\s*,\s*Россия)?(?:\s*,\s*)?\d{6})/giu
  for (const m of text.matchAll(re)) {
    if (m.index === undefined || !m[1]) continue
    const start = m.index
    const end = start + m[1].length
    out.push({
      start,
      end,
      value: m[1],
      categoryId: 'address',
      placeholderTag: 'АДРЕС',
      typeLabel: 'Адрес (хвост города)',
      priority: 67,
    })
  }
  return out
}

function isMatchInsideBracketPlaceholder(text: string, start: number): boolean {
  return start > 0 && text[start - 1] === '[' && /^\[[^\]\n]{1,48}\]/u.test(text.slice(start - 1))
}

/** Строка содержит банковские реквизиты / метки (в т.ч. уже замаскированные плейсхолдеры) */
function hasBankingContextInLine(line: string): boolean {
  return /(?:(?<![\p{L}\p{N}_])БИК(?![\p{L}\p{N}_])|\[БИК_\d+\]|(?<![\p{L}\p{N}_])бик(?![\p{L}\p{N}_])|р\s*\/\s*с|р\.с\.|\[РАСЧЕТНЫЙ_СЧЕТ_\d+\]|расч(?:ёт|ет)ный\s+сч|к\s*\/\s*с|к\.с\.|\[КОРР_СЧЕТ_\d+\]|корр(?:\.|\/)?\s*с|наименование\s+банка|банк\s+получателя|(?<![\p{L}\p{N}_])банк(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])филиал(?:е)?(?![\p{L}\p{N}_]))/iu.test(
    line,
  )
}

/** «в Московском филиале» / «Московский филиал» непосредственно перед названием банка */
function expandBankInstitutionRange(
  text: string,
  start: number,
  end: number,
): { start: number; end: number; value: string } {
  let s = start
  const lineStart = text.lastIndexOf('\n', s - 1) + 1
  const beforeOnLine = text.slice(lineStart, s)

  const inlineInFilial = beforeOnLine.match(
    /(?:^|[\s,;(])(в\s+(?:[А-ЯЁ][а-яёA-ZА-ЯЁа-яё\-]+\s+){1,4}филиале)\s*$/iu,
  )
  if (inlineInFilial) {
    s = lineStart + beforeOnLine.lastIndexOf(inlineInFilial[1]!)
  } else {
    const filialOnLine = beforeOnLine.match(
      /(?:^|[\s,;(])([А-ЯЁ][а-яёA-ZА-ЯЁа-яё\-]+(?:\s+[А-ЯЁ][а-яёA-ZА-ЯЁа-яё\-]+){0,3}\s+филиал(?:\s+банка)?)\s*$/iu,
    )
    if (filialOnLine && !/^в\s+/iu.test(filialOnLine[1]!)) {
      s = lineStart + beforeOnLine.lastIndexOf(filialOnLine[1]!)
    } else if (lineStart > 0) {
      const prevLineEnd = lineStart - 1
      const prevLineStart = text.lastIndexOf('\n', prevLineEnd - 1) + 1
      const prevLine = text.slice(prevLineStart, prevLineEnd).trim()
      if (
        /^(?:в\s+(?:[А-ЯЁ][а-яёA-ZА-ЯЁа-яё\-]+\s+){1,4}филиале)\s*\.?$/iu.test(prevLine) &&
        !isPassportOrPoliceContext(prevLine)
      ) {
        s = prevLineStart
      }
    }
  }

  const value = text.slice(s, end).replace(/\r\n/g, '\n').trimEnd()
  return { start: s, end: s + value.length, value }
}

/** Название банка после «в банке» / «Банк …» (БИК может быть в той же строке раньше) */
function mapBankNameValueMatch(
  text: string,
  m: RegExpMatchArray,
  typeLabel = 'Банк',
): Omit<RawMatch, 'priority' | 'categoryId'> & { categoryId: CategoryId; priority: number } | null {
  const lineStart = text.lastIndexOf('\n', m.index! - 1) + 1
  const lineEndIdx = text.indexOf('\n', m.index!)
  const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
  if (isPassportOrPoliceContext(line)) return null
  const inner = (m[1] ?? '').trim()
  if (inner.length < 4) return null
  const start = m.index! + m[0].indexOf(m[1] ?? inner)
  const end = start + (m[1] ?? inner).length
  const value = text.slice(start, end).trimEnd()
  if (isBankValuePassportNoise(value)) return null
  if (/^(?:БИК|бик|к\/\s*с|р\/\s*с|расч|телефон|email|e-mail|адрес)\b/iu.test(value)) return null
  return {
    start,
    end: start + value.length,
    value,
    categoryId: 'bank' as const,
    placeholderTag: 'БАНК' as const,
    typeLabel,
    priority: 54,
  }
}

function mapBankInstitutionMatch(
  text: string,
  m: RegExpMatchArray,
  typeLabel = 'Банк',
): Omit<RawMatch, 'priority' | 'categoryId'> & { categoryId: CategoryId; priority: number } | null {
  const lineStart = text.lastIndexOf('\n', m.index! - 1) + 1
  const lineEndIdx = text.indexOf('\n', m.index!)
  const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
  const nextLineStart = lineEndIdx === -1 ? text.length : lineEndIdx + 1
  const nextLineEnd = text.indexOf('\n', nextLineStart)
  const nextLine =
    lineEndIdx === -1
      ? ''
      : text.slice(nextLineStart, nextLineEnd === -1 ? text.length : nextLineEnd)
  if (isPassportOrPoliceContext(line)) return null
  const bankContext = nextLine ? `${line}\n${nextLine}` : line
  if (!hasBankingContextInLine(bankContext)) return null
  const r = trimMatchRange(m[0], m.index!)
  if (!r) return null
  if (isBankValuePassportNoise(r.value)) return null
  const expanded = expandBankInstitutionRange(text, r.start, r.end)
  if (isBankValuePassportNoise(expanded.value)) return null
  if (expanded.value.length < 4) return null
  return {
    start: expanded.start,
    end: expanded.end,
    value: expanded.value,
    categoryId: 'bank' as const,
    placeholderTag: 'БАНК' as const,
    typeLabel,
    priority: 53,
  }
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
    'приложение',
    'договору',
    'договор',
    'контракту',
    'форма',
    'таблица',
    'сентября',
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'октября',
    'ноября',
    'декабря',
  ].map((w) => w.toLowerCase()),
)

const FIO_PREPOSITION_WORDS = new Set(
  ['к', 'в', 'с', 'у', 'о', 'и', 'а', 'я', 'от', 'до', 'по', 'на', 'за', 'из', 'при', 'для'].map(
    (w) => w.toLowerCase(),
  ),
)

/** Роли сторон в реквизитах / подписи — не ФИО */
const FIO_PARTY_ROLE_WORDS = new Set(
  [
    'покупатель',
    'продавец',
    'заказчик',
    'исполнитель',
    'арендатор',
    'субарендатор',
    'лизингодатель',
    'лизингополучатель',
  ].map((w) => w.toLowerCase()),
)

function isFioPartyRoleWord(w: string): boolean {
  return FIO_PARTY_ROLE_WORDS.has(w.trim().toLowerCase())
}

/** «М.П.» — место печати, не инициалы лица */
function isSealPlaceInitials(i1: string, i2: string): boolean {
  return i1.trim().toUpperCase() === 'М' && i2.trim().toUpperCase() === 'П'
}

/** Строка только «МП» / «М.П.» — место печати, не ФИО */
function isStandaloneSealLine(text: string, pos: number): boolean {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1
  const lineEnd = text.indexOf('\n', pos)
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim()
  return /^М\.?\s*П\.?$/iu.test(line)
}

/** М.П. + роль стороны; «Д.В.Покупатель» и т.п. */
function isFalseFioSealOrPartyRole(
  text: string,
  start: number,
  end: number,
  value: string,
): boolean {
  const v = value.trim()

  const compact = v.match(/^([А-ЯЁ])\.\s*([А-ЯЁ])\.\s*([А-ЯЁ][а-яё]{1,32})$/u)
  if (compact) {
    if (isSealPlaceInitials(compact[1]!, compact[2]!)) return true
    if (isFioPartyRoleWord(compact[3]!)) return true
  }

  const surInit = v.match(/^([А-ЯЁ][а-яё]{1,24})\s+([А-ЯЁ])\.\s*([А-ЯЁ])\.?$/u)
  if (surInit) {
    if (isFioPartyRoleWord(surInit[1]!)) return true
    if (isSealPlaceInitials(surInit[2]!, surInit[3]!)) return true
  }

  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEnd = text.indexOf('\n', end)
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
  const before = line.slice(0, start - lineStart)
  if (/\bМ\.?\s*П\.?/iu.test(before)) {
    for (const w of v.split(/\s+/)) {
      if (isFioPartyRoleWord(w)) return true
    }
  }

  return false
}

/** Строка «Приложение №…» / «ФОРМА №…» / «Таблица №…» — не искать в ней ФИО */
function isFioOnAppendixFormLine(text: string, pos: number): boolean {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1
  const lineEnd = text.indexOf('\n', pos)
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trimStart()
  return /^(?:приложение|форма|таблица|форм[аы])\b/iu.test(line)
}

/** Не считать ФИО фрагмент перед №1 / N1 / «к Договору» (контекст приложения) */
function isFalseFioNearAppendixNumber(text: string, start: number, end: number): boolean {
  const matched = text.slice(start, end).trim()
  const tail = text.slice(end, end + 48)

  const appendixAfter =
    /^\s*(?:№|\u2116|N\s*o\.?|N)\s*\d/i.test(tail) || /^\s+к\s+договору\b/iu.test(tail)

  if (!appendixAfter) return false

  if (isFioOnAppendixFormLine(text, start)) return true

  if (/^(?:приложение|форма|таблица|форм[аы])$/iu.test(matched)) return true

  for (const w of matched.split(/\s+/)) {
    if (FIO_BLOCKLIST.has(w.toLowerCase()) || FIO_PREPOSITION_WORDS.has(w.toLowerCase())) {
      return true
    }
  }

  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEnd = text.indexOf('\n', end)
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
  const beforeOnLine = line.slice(0, start - lineStart).trimEnd()
  const linePrefix = (beforeOnLine + (beforeOnLine && matched ? ' ' : '') + matched).trim()

  if (/^(?:приложение|форма|таблица|форм[аы])\b/iu.test(linePrefix)) return true
  if (/(?:приложение|форма|таблица|форм[аы])\s*$/iu.test(beforeOnLine)) return true

  return false
}

/** Домен не внутри email (info@iltk.ru) */
function isDomainPartOfEmail(text: string, start: number): boolean {
  if (start > 0 && text[start - 1] === '@') return true
  const prev = text.slice(Math.max(0, start - 96), start)
  const at = prev.lastIndexOf('@')
  if (at === -1) return false
  return !/\s/u.test(prev.slice(at + 1))
}

function isLikelyFio(words: [string, string, string]): boolean {
  for (const w of words) {
    if (w.length < 2 || w.length > 32) return false
    if (FIO_BLOCKLIST.has(w.toLowerCase())) return false
    if (isFioPartyRoleWord(w)) return false
    if (/\d/.test(w)) return false
  }
  return true
}

const POA_FIO_EXTRA_BLOCKLIST = new Set(
  [
    'российская',
    'российской',
    'федерация',
    'федерации',
    'санкт',
    'петербург',
    'петербурга',
    'москва',
    'москвы',
    'генеральный',
    'генерального',
    'директор',
    'директора',
    'форм',
    'форма',
    'таблица',
    'приложение',
    'гражданин',
    'гражданка',
    'гражданку',
    'гражданина',
  ].map((w) => w.toLowerCase()),
)

/** ФИО 2–3 слова после «уполномочивает» в доверенности (косвенные падежи) */
function isLikelyPoaFio(words: string[]): boolean {
  if (words.length < 2 || words.length > 3) return false
  for (const w of words) {
    if (w.length < 2 || w.length > 32) return false
    const low = w.toLowerCase()
    if (FIO_BLOCKLIST.has(low) || FIO_PREPOSITION_WORDS.has(low)) return false
    if (isFioPartyRoleWord(w)) return false
    if (POA_FIO_EXTRA_BLOCKLIST.has(low)) return false
    if (/\d/.test(w)) return false
  }
  return true
}

function mapPoaAuthorizedFioMatch(
  text: string,
  m: RegExpMatchArray,
): Omit<RawMatch, 'priority' | 'categoryId'> & { categoryId: CategoryId; priority: number } | null {
  const inner = (m[1] ?? '').trim()
  const words = inner.split(/\s+/).filter(Boolean)
  if (!isLikelyPoaFio(words)) return null
  const start = m.index! + m[0].indexOf(words[0]!)
  const end = start + inner.length
  if (isFioOnAppendixFormLine(text, start)) return null
  if (isFalseFioNearAppendixNumber(text, start, end)) return null
  if (isFalseFioSealOrPartyRole(text, start, end, inner)) return null
  return {
    start,
    end,
    value: inner,
    categoryId: 'fio' as const,
    placeholderTag: 'ФИО' as const,
    typeLabel: 'ФИО',
    priority: 55,
  }
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
    const keyPart = normalizeEntityKey(m)
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
      removeOnly: m.typeLabel === 'Адрес (хвост города)',
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

  if (enabled.has('website')) {
    const domainTld = '(?:ru|com|org|net|рф)'
    const domainLabel = '[a-zA-Z0-9а-яёА-ЯЁ](?:[a-zA-Z0-9а-яёА-ЯЁ-]{0,61}[a-zA-Z0-9а-яёА-ЯЁ])?'
    const domainHost = `${domainLabel}(?:\\.${domainLabel})*\\.${domainTld}`
    const websiteRes = [
      new RegExp(`(?<![@\\w/])https?:\\/\\/(?:www\\.)?(${domainHost})(?=$|[^\\w.\\-])`, 'giu'),
      new RegExp(`(?<![@\\w/])(?:www\\.)(${domainHost})(?=$|[^\\w.\\-])`, 'giu'),
      new RegExp(`(?<![@\\w./])(${domainHost})(?=$|[^\\w.\\-])`, 'giu'),
    ]
    for (const re of websiteRes) {
      raw.push(
        ...collectRegexMatches(text, re, (m) => {
          const val = m[1] ?? m[0]
          const start = m.index! + m[0].indexOf(val)
          if (isDomainPartOfEmail(text, start)) return null
          const host = val.trim()
          if (!/[a-zA-Zа-яёА-ЯЁ]/u.test(host)) return null
          if (/^\d+(?:\.\d+)+$/u.test(host)) return null
          return {
            start,
            end: start + host.length,
            value: host,
            categoryId: 'website' as const,
            placeholderTag: 'САЙТ' as const,
            typeLabel: 'Сайт / домен',
            priority: 88,
          }
        }),
      )
    }
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
    // ИНН/КПП 1234567890/177101001 или ИНН/КПП [ИНН_3]/177101001
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:^|[^\p{L}\p{N}_])ИНН\s*\/\s*КПП\s*:?\s*(?:\d{10,12}|\[\s*ИНН_\d+\s*\])\s*\/\s*(\d{9})(?=$|[^\p{L}\p{N}_])/giu,
        (m) => {
          const val = m[1] ?? ''
          if (!val) return null
          const start = m.index! + m[0].lastIndexOf(val)
          return {
            start,
            end: start + val.length,
            value: val,
            categoryId: 'kpp' as const,
            placeholderTag: 'КПП' as const,
            typeLabel: 'КПП (ИНН/КПП)',
            priority: 75,
          }
        },
      ),
    )

    raw.push(
      ...collectRegexMatches(
        text,
        /(?:^|[^\p{L}\p{N}_])(?:КПП|кпп)\s*(?:(?::|№)\s*)?(\d{9})(?=$|[^\p{L}\p{N}_])/giu,
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
        /(?:р\s*\/\s*с|р\.с\.|(?:расч(?:ёт|ет)ный|расчетный)[\s\n]{0,24}сч(?:ёт|ет)|р\/с)[\s.:—–-]{0,12}((?:\d[\s]*){19}\d)/giu,
        (m) => {
          const raw = (m[1] ?? '').trim()
          const digits = raw.replace(/\s+/g, '')
          if (digits.length !== 20) return null
          const start = m.index! + m[0].indexOf(m[1] ?? raw)
          return {
            start,
            end: start + raw.length,
            value: raw,
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
    /** После закрывающей кавычки имени — пробел/пунктуация/конец (имя уже ограничено «…») */
    const orgStopQuoted =
      '(?=\\s|,|;|\\.|\\n|\\)|\\]|\\s*\\(|\\s+именуем(?:ое|ый|ая|ые)?(?=$|[^\\p{L}\\p{N}_])|\\s+в\\s+лице(?=$|[^\\p{L}\\p{N}_])|\\s+договор(?:у|а|е|ом)?(?=$|[^\\p{L}\\p{N}_])|\\s+(?:ИНН|КПП|ОГРНИП|ОГРН)(?=$|[^\\p{L}\\p{N}_])|\\s+адрес\\b|\\s+юридический\\b|$)'
    /** Без кавычек — строже: предлоги, следующее юрлицо, реквизиты */
    const orgStop =
      '(?=,|;|\\.|\\n|\\s*\\(|\\s+[А-ЯЁ]\\.|\\s+(?:в|для|по|на|к|у|о|об|от|с|и)(?=$|[^\\p{L}\\p{N}_])|\\s+именуем(?:ое|ый|ая|ые)?(?=$|[^\\p{L}\\p{N}_])|\\s+в\\s+лице(?=$|[^\\p{L}\\p{N}_])|\\s+договор(?:у|а|е|ом)?(?=$|[^\\p{L}\\p{N}_])|\\s+(?:с|и|между)\\s+(?:ООО|АО|ПАО|ЗАО|ОАО|НКО)(?=$|[^\\p{L}\\p{N}_])|\\s+в\\s+(?:ООО|АО|ПАО|ЗАО|ОАО|НКО)(?=$|[^\\p{L}\\p{N}_])|\\s+(?:ИНН|КПП|ОГРНИП|ОГРН)(?=$|[^\\p{L}\\p{N}_])|\\s+адрес\\b|\\s+юридический\\b|\\s+г\\.\\s|\\s+город\\b|\\s+ул\\.\\s|\\s+улица\\b|\\s+р\\/\\s*с\\b|\\s+р\\.с\\.|\\s+к\\/\\s*с\\b|\\s+БИК(?=$|[^\\p{L}\\p{N}_])|\\s+[Бб]анк\\b|$)'

    // «…»: вложенные « в имени до первого » (линейно). "…": ветка на 2 или 3 кавычки, без (A|B)+
    const orgQuotedRu = '«[^»\\n]{1,160}»'
    const orgQuotedEn = '"(?:[^"\\n]{1,160}"[^"\\n]{1,80}|[^"\\n]{1,160})"'

    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          '(?:Обществ[ао]|ОБЩЕСТВ[АО])\\s+с\\s+ограниченной\\s+ответственностью\\s*' +
            '(?:' +
            orgQuotedRu +
            '|' +
            orgQuotedEn +
            ')' +
            orgStopQuoted,
          'giu',
        ),
        (m) => {
          if (isOrgMatchOnBankLine(text, m.index!)) return null
          if (isOrgAfterVBankePrefix(text, m.index!)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r || r.value.length < 12) return null
          if (isOrgInContractTitleContext(text, r.start, r.value)) return null
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
          '(?:ООО|АО|ПАО|ЗАО|ОАО|НКО)\\s+' +
            '(?:' +
            orgQuotedRu +
            orgStopQuoted +
            '|' +
            orgQuotedEn +
            orgStopQuoted +
            '|' +
            // Без кавычек — короткое имя (как было)
            '[А-ЯЁA-Zа-яё0-9\\-]+(?:\\s+[А-ЯЁA-Zа-яё0-9\\-]+){0,4}' +
            orgStop +
            ')',
          'giu',
        ),
        (m) => {
          if (isOrgMatchOnBankLine(text, m.index!)) return null
          if (isOrgAfterVBankePrefix(text, m.index!)) return null
          const r = trimMatchRange(m[0], m.index!)
          if (!r || r.value.length < 5) return null
          if (isOrgInContractTitleContext(text, r.start, r.value)) return null
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

    raw.push(...collectGovernmentOrgMatches(text))

    raw.push(
      ...collectRegexMatches(
        text,
        /(?:^|[\s(])(?:\d+\.\s*)?Работник\s+принимается\s+на\s+работу\s*:\s*((?:ООО|АО|ПАО|ЗАО|ОАО|НКО|ИП)\s+(?:«[^»\n]{1,160}»|"(?:[^"\n]{1,160})"|(?:[А-ЯЁA-Z][А-ЯЁA-Zа-яё0-9\-]+(?:\s+[А-ЯЁA-Z][А-ЯЁA-Zа-яё0-9\-]+){0,3})))(?=\s*$|[\s,;.(]|$)/giu,
        (m) => {
          if (isOrgMatchOnBankLine(text, m.index!)) return null
          if (isOrgAfterVBankePrefix(text, m.index!)) return null
          const inner = (m[1] ?? '').trim()
          const start = m.index! + m[0].indexOf(inner)
          const end = start + inner.length
          if (inner.length < 5) return null
          if (isOrgInContractTitleContext(text, start, inner)) return null
          return {
            start,
            end,
            value: inner,
            categoryId: 'org_ip' as const,
            placeholderTag: 'ОРГАНИЗАЦИЯ' as const,
            typeLabel: 'Организация (работодатель)',
            priority: 60,
          }
        },
      ),
    )
  }

  if (enabled.has('fio')) {
    const poaFioWord = '[А-ЯЁ][а-яё]{1,28}'
    const poaFioCtx =
      '(?:настоящей\\s+доверенностью\\s+)?уполномочивает\\s*:?\\s*(?:\\r?\\n\\s*)?'
    const poaFioStop =
      '(?=\\s*,|\\s*\\r?\\n\\s*(?:граждан(?:ин|ка|ки|ку|ом|е)?|паспорт|зарегистрир|действующ)|,\\s*(?:граждан|паспорт|зарегистрир|действующ))'

    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          `${poaFioCtx}(${poaFioWord}\\s+${poaFioWord}\\s+${poaFioWord})${poaFioStop}`,
          'giu',
        ),
        (m) => mapPoaAuthorizedFioMatch(text, m),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(`${poaFioCtx}(${poaFioWord}\\s+${poaFioWord})${poaFioStop}`, 'giu'),
        (m) => mapPoaAuthorizedFioMatch(text, m),
      ),
    )

    const fioRe =
      /(?:^|[\s,.:;()_\-])(?!Обществ|Приложение|ПРИЛОЖЕНИЕ|Форма|ФОРМА|Таблица|ТАБЛИЦА)([А-ЯЁ][а-яё]{1,24})\s+([А-ЯЁ][а-яё]{1,24})\s+((?:[А-ЯЁ][а-яё]*(?:ович|евич|вна|ична|ича|оглы|кызы|ич)(?:[аеиоуыья])?)|(?:[А-ЯЁ][а-яё]{7,}))(?=[\s,.:;()\]_\-]|$)/gu
    raw.push(
      ...collectRegexMatches(text, fioRe, (m) => {
        const w1 = m[1] ?? ''
        const w2 = m[2] ?? ''
        const w3 = m[3] ?? ''
        if (!isLikelyFio([w1, w2, w3])) return null
        const inner = `${w1} ${w2} ${w3}`
        const start = m.index! + m[0].indexOf(w1)
        const end = start + inner.length
        if (isFioOnAppendixFormLine(text, start)) return null
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
        if (isFalseFioNearAppendixNumber(text, start, end)) return null
        if (isFalseFioSealOrPartyRole(text, start, end, inner)) return null
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
        /(?:^|[\s,.:;()_\-/])(\/)([А-ЯЁ][а-яё]{1,24})\s+([А-ЯЁ]\.\s*[А-ЯЁ]\.?,?)(\/)(?=[\s,.\n]|$)/gu,
        (m) => {
          const w1 = m[2] ?? ''
          const w2 = (m[3] ?? '').replace(/\s+/g, ' ').replace(/,+$/, '')
          if (!isLikelyShortFioSurname(w1)) return null
          const inner = `${w1} ${w2}`
          const start = m.index! + m[0].indexOf(w1)
          const end = start + inner.length
          if (isStandaloneSealLine(text, start)) return null
          if (isFioOnAppendixFormLine(text, start)) return null
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
          if (isFalseFioNearAppendixNumber(text, start, end)) return null
          if (isFalseFioSealOrPartyRole(text, start, end, inner)) return null
          return {
            start,
            end,
            value: inner,
            categoryId: 'fio' as const,
            placeholderTag: 'ФИО' as const,
            typeLabel: 'ФИО (подпись)',
            priority: 56,
          }
        },
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:^|[\s,.:;()_\-/])([А-ЯЁ][а-яё]{1,24})\s+([А-ЯЁ]\.\s*[А-ЯЁ]\.?)(?=[\s,.:;()\]_\-,/]|$)/gu,
        (m) => {
          const w1 = m[1] ?? ''
          const w2 = (m[2] ?? '').replace(/\s+/g, ' ')
          if (!isLikelyShortFioSurname(w1)) return null
          const inner = `${w1} ${w2}`
          const start = m.index! + m[0].indexOf(w1)
          const end = start + inner.length
          if (isStandaloneSealLine(text, start)) return null
          if (isFioOnAppendixFormLine(text, start)) return null
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
          if (isFalseFioNearAppendixNumber(text, start, end)) return null
          if (isFalseFioSealOrPartyRole(text, start, end, inner)) return null
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

    // Подписи вида «Д.В.Павлов», «Д.В. Павлов», «Д. В. Павлов»
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:^|[\s,;:(\[]|_{2,})([А-ЯЁ]\.\s*[А-ЯЁ]\.\s*[А-ЯЁ][а-яё]{1,32})(?=$|[\s,.:;)\]\n_-])/gu,
        (m) => {
          const rawVal = m[1] ?? ''
          if (!rawVal) return null
          // небольшой фильтр против мусора; фамилия должна быть русской
          const sm = rawVal.match(/^([А-ЯЁ])\.\s*([А-ЯЁ])\.\s*([А-ЯЁ][а-яё]{1,32})$/u)
          if (!sm) return null
          if (isSealPlaceInitials(sm[1]!, sm[2]!)) return null
          if (isFioPartyRoleWord(sm[3]!)) return null
          const start = m.index! + m[0].indexOf(rawVal)
          const r = trimMatchRange(rawVal, start)
          if (!r) return null
          if (isFioOnAppendixFormLine(text, r.start)) return null
          if (isFalseFioNearAppendixNumber(text, r.start, r.end)) return null
          if (isFalseFioSealOrPartyRole(text, r.start, r.end, r.value)) return null

          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'fio' as const,
            placeholderTag: 'ФИО' as const,
            typeLabel: 'ФИО (инициалы + фамилия)',
            priority: 55,
          }
        },
      ),
    )
  }

  if (enabled.has('passport')) {
    const passTag = 'ПАСПОРТНЫЕ_ДАННЫЕ' as const
    const passLabel = 'Паспортные данные' as const

    raw.push(...collectMultilinePassportBlocks(text))

    // Доверенности/анкеты: «паспорт 40 12 247258, выданный ... 03 марта 2011 года, к/п 780-035»
    // Важно: маскируем единым блоком, останавливаемся перед адресом/регистрацией/новым смысловым блоком.
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          String.raw`(?:^|[^\p{L}\p{N}_])(` +
            String.raw`паспорт\s+(?:\d{2}\s*\d{2}|\d{4})\s*(?:(?:№|N)\s*)?\d{6}` +
            String.raw`\s*,?\s*(?:выдан|выданный|выдана|выданной)[^\n]{0,420}?` +
            String.raw`(?:` +
            String.raw`(?:0[1-9]|[12]\d|3[01])\.(?:0[1-9]|1[0-2])\.(?:19|20)\d{2}(?:\s*г(?:\.|ода?)?)?` +
            String.raw`|` +
            String.raw`(?:[12]?\d|3[01])\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(?:19|20)\d{2}(?:\s+года?)?` +
            String.raw`)` +
            String.raw`(?:[^\n]{0,140}?(?:,|\s)\s*(?:к\/п|код\s+подразделения|№\s*подр\.?|подр\.|подразделени[ея])\s*\d{3}[\-–]\d{3})?` +
            String.raw`)` +
            String.raw`(?=,?\s*(?:` +
            String.raw`зарегистрирован(?:ный|ная|ное|ные|ную|ным|ной|ному|ных|ными)?|` +
            String.raw`зарегистрирован\b|` +
            String.raw`по\s+адресу|` +
            String.raw`зарегистрирован(?:ный|ная)?\s+по\s+адресу|` +
            String.raw`адрес\s+регистрации|место\s+регистрации|` +
            String.raw`проживающ(?:ий|ая)|` +
            String.raw`представлять|настоящей\s+доверенностью|` +
            String.raw`Страховое\s+свидетельство|СНИЛС|\s*ИНН\b` +
            String.raw`)(?=$|[^\p{L}\p{N}_])|\n|$)`,
          'giu',
        ),
        (m) => {
          const full = m[1] ?? m[0]
          const start = m.index! + m[0].indexOf(full)
          const r = trimMatchRange(full, start)
          if (!r || r.value.length < 20) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'passport' as const,
            placeholderTag: passTag,
            typeLabel: passLabel,
            priority: 71,
          }
        },
      ),
    )

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

  if (enabled.has('snils')) {
    for (const re of [SNILS_CTX_INSURANCE, SNILS_CTX_LABEL, SNILS_CTX_PENSION]) {
      raw.push(...collectRegexMatches(text, re, (m) => mapSnilsNumberMatch(m, 73)))
    }
  }

  if (enabled.has('contract_number')) {
    const cnPri = 68
    const noNum = '(?:№|\\u2116)'
    const noSep = '[ \\t\\u00A0]*'
    const contractToken = '[^\\s,;\\n]{2,64}'
    const contractRes: RegExp[] = [
      new RegExp(
        `Государственный\\s+контракт\\s+[^\\n]{0,200}?${noNum}${noSep}${contractToken}`,
        'giu',
      ),
      new RegExp(`к\\s+Договору\\s*${noNum}${noSep}${contractToken}`, 'giu'),
      new RegExp(
        `Договор\\s*${noNum}${noSep}${contractToken}\\s+от\\s*(?:0[1-9]|[12]\\d|3[01])\\.(?:0[1-9]|1[0-2])\\.(?:19|20)\\d{2}`,
        'giu',
      ),
      new RegExp(`Договор\\s*${noNum}${noSep}${contractToken}`, 'giu'),
      new RegExp(`Контракт\\s*${noNum}${noSep}${contractToken}`, 'giu'),
    ]

    // Договор(а/у) №/N 1786656 от 27.04.2017 — важна дата целиком.
    // Не считаем пунктами (1.1/2.2.1): номер только цифры (>=3 знаков).
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:^|[^\p{L}\p{N}_])(договор(?:у|а)?\s*(?:№|\u2116|N)\s*\d{3,12}\s*от\s*(?:0[1-9]|[12]\d|3[01])\.(?:0[1-9]|1[0-2])\.(?:19|20)\d{2})(?=$|[^\p{L}\p{N}_])/giu,
        (m) => {
          const full = m[1] ?? m[0]
          const start = m.index! + m[0].indexOf(full)
          const r = trimMatchRange(full, start)
          if (!r) return null
          // дополнительная защита от "договор № 1.1" (не пройдёт по \d{3,12}, но оставим)
          const nm = r.value.match(/(?:№|\u2116|N)\s*([^\s]+)/iu)?.[1] ?? ''
          if (nm && isContractClauseRef(nm)) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'contract_number' as const,
            placeholderTag: 'НОМЕР_ДОГОВОРА' as const,
            typeLabel: 'Номер договора / документа' as const,
            priority: cnPri + 2,
          }
        },
      ),
    )

    // «…ДОГОВОР… № 59» в заголовке — только «№» и номер, без всего заголовка
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          `(?:^|[^\\p{L}\\p{N}_])(${noNum}${noSep}([^\\s,;\\n]{1,64}))(?=$|[^\\p{L}\\p{N}_]|\\s*[,;])`,
          'giu',
        ),
        (m) => {
          const numPart = m[1] ?? ''
          const tok = (m[2] ?? '').trim()
          if (!isValidContractNumberToken(tok)) return null
          const lead = m[0].length - m[0].trimStart().length
          const innerStart = m.index! + lead
          const inner = numPart.trim()
          const start = innerStart + numPart.indexOf(inner)
          const end = start + inner.length
          const lineStart = text.lastIndexOf('\n', start - 1) + 1
          const lineEndIdx = text.indexOf('\n', start)
          const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
          const posInLine = start - lineStart
          const noIdx = line.indexOf('№', posInLine)
          const noIdx2 = noIdx >= 0 ? noIdx : line.indexOf('\u2116', posInLine)
          if (noIdx2 < 0 || !isContractNumberLineContext(line, noIdx2)) return null
          return {
            start,
            end,
            value: inner,
            categoryId: 'contract_number' as const,
            placeholderTag: 'НОМЕР_ДОГОВОРА' as const,
            typeLabel: 'Номер договора / документа' as const,
            priority: cnPri + 3,
          }
        },
      ),
    )

    for (const re of contractRes) {
      raw.push(
        ...collectRegexMatches(text, re, (m) => {
          const full = m[0]
          if (/^приложение\s*(?:№|\u2116|N|No)/iu.test(full)) return null
          const tok = tokenAfterLastNoSign(full)
          if (!tok || !isValidContractNumberToken(tok)) return null
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

    // Лизинг: «договор(у) лизинга № ... от dd.dd.yyyy», а также «№ ... от ...» рядом со словами «договор...лизинга».
    const leaseRes: RegExp[] = [
      new RegExp(
        `(?:по\\s+)?договор(?:у|а)?\\s+лизинга${noSep}${noNum}${noSep}${contractToken}(?:\\s+от\\s*(?:0[1-9]|[12]\\d|3[01])\\.(?:0[1-9]|1[0-2])\\.(?:19|20)\\d{2})?`,
        'giu',
      ),
      new RegExp(
        `договор(?:у|а)?\\s+лизинга[^\\n]{0,40}?${noNum}${noSep}${contractToken}\\s+от\\s*(?:0[1-9]|[12]\\d|3[01])\\.(?:0[1-9]|1[0-2])\\.(?:19|20)\\d{2}`,
        'giu',
      ),
    ]
    for (const re of leaseRes) {
      raw.push(
        ...collectRegexMatches(text, re, (m) => {
          const full = m[0]
          // хотим начинать плейсхолдер с «договор...», даже если в тексте было «по договору...»
          const innerIdx = full.toLowerCase().indexOf('договор')
          const baseStart = m.index! + (innerIdx >= 0 ? innerIdx : 0)
          const inner = innerIdx >= 0 ? full.slice(innerIdx) : full

          if (/^приложение\s*(?:№|\u2116|N|No)/iu.test(inner)) return null
          const tok = tokenAfterLastNoSign(inner)
          if (!tok || !isValidContractNumberToken(tok)) return null

          const r = trimMatchRange(inner, baseStart)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'contract_number' as const,
            placeholderTag: 'НОМЕР_ДОГОВОРА' as const,
            typeLabel: 'Номер договора (лизинг)' as const,
            priority: cnPri + 1,
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

    // Суммы с прописью: захватываем целиком (цифры + (пропись) + рубли/копейки)
    // Приоритет выше, чтобы не оставалась пропись в тексте.
    raw.push(
      ...collectRegexMatches(
        text,
        /\b(?:\d{1,3}(?:\s+\d{3})+|\d{4,})(?:,\s*\d{2})?(?!\s*%)(?:\s*\([^)\n]{3,360}\))?\s*(?:руб\.?|рубля|рублей|рубль)(?:\s+\d{2}\s*копе(?:йка|йки|ек))?(?=$|[^\p{L}\p{N}_])/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          // не путаем с пунктами договора (и вообще «2.2.1» сюда не подходит по формату, но оставим защиту)
          if (/^\d{1,2}\.\d{1,2}(?:\.\d+)?$/u.test(r.value)) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'money_amount' as const,
            placeholderTag: sumTag,
            typeLabel: sumLabel,
            priority: sumPri + 6,
          }
        },
      ),
    )

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

    // Десятичные суммы (с пробелом после запятой) + опционально рубли рядом
    raw.push(
      ...collectRegexMatches(
        text,
        /\b(?:\d{1,3}(?:\s+\d{3})+|\d{5,}),\s*\d{2}(?:\s*(?:руб\.?|рубля|рублей|рубль))?(?=$|[^\p{L}\p{N}_])(?!\s*%)/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          // не ловим номера пунктов вроде 2.2.1 (на всякий случай, хотя тут запятая)
          if (/^\d{1,2}\.\d{1,2}(?:\.\d+)?$/.test(r.value)) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'money_amount' as const,
            placeholderTag: sumTag,
            typeLabel: sumLabel,
            priority: sumPri + 2,
          }
        },
      ),
    )

    raw.push(
      ...collectRegexMatches(
        text,
        /\b(?:\d{1,3}(?:\s+\d{3})+|\d{5,}),\s*\d{2}(?!\s*%)\b/gu,
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

  if (enabled.has('vin')) {
    const vinPri = 64
    const vinTag = 'VIN' as const
    const vinLabel = 'VIN / номер кузова' as const
    const vinValue = '[A-HJ-NPR-Z0-9]{17}'
    const vinRes: RegExp[] = [
      new RegExp(`Идентификационный\\s+номер\\s*\\(VIN\\)\\s*[:\\-–]\\s*${vinValue}`, 'giu'),
      new RegExp(`\\bVIN\\s*[:\\-–]\\s*${vinValue}`, 'giu'),
      new RegExp(`Номер\\s+кузова\\s*[:\\-–]\\s*${vinValue}`, 'giu'),
    ]
    for (const re of vinRes) {
      raw.push(
        ...collectRegexMatches(text, re, (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          if (!extractVinPayload(r.value)) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'vin' as const,
            placeholderTag: vinTag,
            typeLabel: vinLabel,
            priority: vinPri,
          }
        }),
      )
    }
  }

  if (enabled.has('vehicle_plate')) {
    const platePri = 63
    const plateTag = 'ГОСНОМЕР' as const
    const plateLabel = 'Госномер ТС' as const
    const plateValue = '[АВЕКМНОРСТУХABEKMHOPCTYXA]\\d{3}[АВЕКМНОРСТУХABEKMHOPCTYXA]{2}\\d{2,3}'
    const plateRes: RegExp[] = [
      new RegExp(`Государственный\\s+регистрационный\\s+знак\\s*[:\\-–]\\s*${plateValue}`, 'giu'),
      new RegExp(`\\bГосномер\\s*[:\\-–]\\s*${plateValue}`, 'giu'),
      new RegExp(`Регистрационный\\s+знак\\s*[:\\-–]\\s*${plateValue}`, 'giu'),
    ]
    for (const re of plateRes) {
      raw.push(
        ...collectRegexMatches(text, re, (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'vehicle_plate' as const,
            placeholderTag: plateTag,
            typeLabel: plateLabel,
            priority: platePri,
          }
        }),
      )
    }
  }

  if (enabled.has('pts')) {
    const ptsPri = 62
    const ptsTag = 'ПТС' as const
    const ptsLabel = 'ПТС / ЭПТС' as const
    // 8–15 цифр, допускаем пробелы внутри (например: 16430 0222)
    const ptsNum = '\\d[\\d\\s]{6,18}\\d'
    // High-priority: «ПТС/ЭПТС … электронный паспорт … (оформлен dd.mm.yyyy,) … номер 16430 0222»
    // Важно: захватываем строку целиком до переноса, чтобы дата не маскировалась отдельно.
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(
          `(?:^|[\\s\\u00A0(\\[])(?:(?:ПТС|ЭПТС)\\s*[:\\-–]?\\s*)?электронный\\s+паспорт[^\\n]{0,320}?(?:оформлен\\s+(?:0[1-9]|[12]\\d|3[01])\\.(?:0[1-9]|1[0-2])\\.(?:19|20)\\d{2}[^\\n]{0,80}?)?номер[^\\d\\n]{0,30}${ptsNum}`,
          'giu',
        ),
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          const numM = r.value.match(new RegExp(ptsNum, 'u'))
          if (!numM || !isValidPtsNumber(numM[0])) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'pts' as const,
            placeholderTag: ptsTag,
            typeLabel: ptsLabel,
            priority: ptsPri + 10,
          }
        },
      ),
    )

    const ptsRes: RegExp[] = [
      new RegExp(
        `(?:ПТС|ЭПТС)\\s*:\\s*электронный\\s+паспорт[^\\n]{0,300}?\\bномер\\s+${ptsNum}\\b`,
        'giu',
      ),
      new RegExp(
        `(?:ПТС|ЭПТС)\\b\\s+электронный\\s+паспорт[^\\n]{0,300}?\\bномер\\s+${ptsNum}\\b`,
        'giu',
      ),
      new RegExp(`\\bЭПТС\\s+${ptsNum}\\b`, 'giu'),
      new RegExp(
        `электронный\\s+паспорт[^\\n]{0,300}?\\bномер\\s+${ptsNum}\\b`,
        'giu',
      ),
      new RegExp(`номер\\s+электронного\\s+паспорта\\s+${ptsNum}\\b`, 'giu'),
      new RegExp(`\\bПТС\\s+электронный\\s+паспорт\\s+номер\\s+${ptsNum}\\b`, 'giu'),
    ]
    for (const re of ptsRes) {
      raw.push(
        ...collectRegexMatches(text, re, (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          const numM = r.value.match(new RegExp(ptsNum, 'u'))
          if (!numM || !isValidPtsNumber(numM[0])) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'pts' as const,
            placeholderTag: ptsTag,
            typeLabel: ptsLabel,
            priority: ptsPri,
          }
        }),
      )
    }
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
        /(?<![\p{L}\p{N}_])(?:[А-ЯЁ][а-яёA-ZА-ЯЁа-яё\-]{2,24}\s+){1,4}филиал(?:\s+банка)?\s+(?:ПАО|АО|ЗАО|ОАО|НКО)(?:\s+(?:КБ|Банк))?\s+(?:«[^»\n]{1,80}»|"[^"\n]{1,80}")/giu,
        (m) => mapBankInstitutionMatch(text, m, 'Банк / филиал'),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?<![\p{L}\p{N}_])(?:ПАО|АО|ЗАО|ОАО|НКО)(?:\s+(?:КБ|Банк))?\s+"[^"]*БАНК\s+"[^"]+"/giu,
        (m) => mapBankInstitutionMatch(text, m),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?<![\p{L}\p{N}_])(?:ПАО|АО|ЗАО|ОАО|НКО)(?:\s+(?:КБ|Банк))?\s+«[^»\n]*БАНК[^»\n]*»/giu,
        (m) => mapBankInstitutionMatch(text, m),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?<![\p{L}\p{N}_])(?:ПАО|АО|ЗАО|ОАО|НКО)(?:\s+(?:КБ|Банк))?\s+(?:«[^»\n]{1,80}»|"[^"\n]{1,80}")/giu,
        (m) => mapBankInstitutionMatch(text, m),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?<![\p{L}\p{N}_])(?:ПАО|АО|ЗАО|ОАО|НКО)\s+(?:Банк\s+)?[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z\-]{2,48}(?=\s*(?:БИК|бик|\[БИК_|\[КОРР_СЧЕТ_|,|\)|$))/giu,
        (m) => mapBankInstitutionMatch(text, m),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?<![\p{L}\p{N}_])Банк\s+(?:ВТБ|Газпром(?:банк)?|Сбербанк|Т-?Банк|ТБанк|[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z\-]{2,40})(?=\s*(?:БИК|бик|,|\)|$|\[БИК_))/giu,
        (m) => mapBankInstitutionMatch(text, m),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?<![\p{L}\p{N}_])ПАО\s+Сбербанк(?=\s*(?:БИК|бик|,|\)|$|\[БИК_))/giu,
        (m) => mapBankInstitutionMatch(text, m),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        /(?<![\p{L}\p{N}_])АО\s+Альфа[\-\s]?Банк[^\n]{0,80}/giu,
        (m) => mapBankInstitutionMatch(text, m),
      ),
    )
    const bankNameBody =
      '(?:ПАО|АО|ЗАО|ОАО|НКО)(?:\\s+(?:КБ|Банк))?\\s+(?:«[^»\\n]{1,80}»|"[^"\\n]{1,80}"|[А-ЯЁA-ZА-ЯЁа-яё][А-ЯЁа-яёA-Za-z\\-«»]+(?:\\s+(?:г\\.|[А-ЯЁA-ZА-ЯЁа-яё][А-ЯЁа-яёA-Za-z\\-«»\\.]+)){0,4})'
    const bankInlineStop =
      '(?=\\s*$|\\s*\\n|\\s*(?:БИК|бик|\\[БИК_|к\\/\\s*с|р\\/\\s*с|расч(?:ёт|ет)|Телефон|тел\\.|Email|E-mail|адрес\\b|,))'
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(`(?<![\\p{L}\\p{N}_])в\\s+банке\\s+(${bankNameBody})${bankInlineStop}`, 'giu'),
        (m) => mapBankNameValueMatch(text, m, 'Банк (в банке)'),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(`(?<![\\p{L}\\p{N}_])Банк\\s+(${bankNameBody})${bankInlineStop}`, 'giu'),
        (m) => mapBankNameValueMatch(text, m, 'Банк'),
      ),
    )
    const cbrGuName =
      '(?:[А-ЯЁA-Z][А-ЯЁA-Z\\-]{1,48}[\\s\\u00A0]+)?ГУ[\\s\\u00A0]+БАНКА[\\s\\u00A0]+РОССИИ'
    const cbrAlt = `(?:${cbrGuName}|БАНК[\\s\\u00A0]+РОССИИ)`
    const cbrStop =
      '(?=\\s*$|\\s*\\n|\\s*(?:БИК|бик|\\[БИК_|\\[КОРР_СЧЕТ_|к\\/\\s*с|р\\/\\s*с|Телефон|тел\\.|Email|E-mail|адрес\\b))'
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(`(?<![\\p{L}\\p{N}_])в[\\s\\u00A0]+(${cbrGuName})${cbrStop}`, 'giu'),
        (m) => mapBankNameValueMatch(text, m, 'Банк (ГУ Банка России)'),
      ),
    )
    raw.push(
      ...collectRegexMatches(
        text,
        new RegExp(`(?<![\\p{L}\\p{N}_])(${cbrAlt})${cbrStop}`, 'giu'),
        (m) => mapBankNameValueMatch(text, m, 'Банк России'),
      ),
    )
  }

  if (enabled.has('address')) {
    const labeledAddressSpans = collectLabeledAddressSpans(text)

    // Адреса с явной меткой (в т.ч. 2–3 продолжения на следующих строках)
    raw.push(
      ...collectRegexMatches(text, LABELED_ADDRESS_LABEL_RE, (m) => {
        const block = extractLabeledAddressRange(text, m.index!)
        if (!block || block.value.length < 8) return null
        if (/на\s+следующий/i.test(block.value)) return null
        const trimmed = trimAddressCandidate(block.value)
        if (trimmed.length < 8) return null
        if (!isValidAddressCandidate(trimmed)) return null
        const isPostal = /почтовый\s+адрес/i.test(trimmed)
        return {
          start: block.start,
          end: block.start + trimmed.length,
          value: trimmed,
          categoryId: 'address' as const,
          placeholderTag: 'АДРЕС' as const,
          typeLabel: isPostal ? 'Почтовый адрес' : 'Адрес',
          priority: isPostal ? 66 : 65,
        }
      }),
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
          const end = start + trimmed.length
          if (overlapsLabeledAddress(start, end, labeledAddressSpans)) return null
          return {
            start,
            end,
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
        /\b\d{6}\s*,(?:\s*Российская\s+Федерация\s*,)?(?:\s*[^,\n]+,\s*){0,2}(?:г\.|город)\s*[^,\n]+(?:,\s*(?:ул\.?|улица|наб\.?|набережная|пр\.?|пр-кт|просп\.?|проспект|пер\.?|переулок|б-р|бульвар|ш\.?|шоссе)\s*[^,\n]+)?(?:,\s*(?:д\.|дом)\s*[^,\n]+)?(?:,\s*(?:кв\.|квартира|оф\.|офис)\s*[^,\n]*)?/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          const trimmed = trimAddressCandidate(r.value)
          if (trimmed.length < 12) return null
          const end = r.start + trimmed.length
          if (overlapsLabeledAddress(r.start, end, labeledAddressSpans)) return null
          return {
            start: r.start,
            end,
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
        /\b\d{6}\s*,\s*[^\n,]{1,120},\s*(?:ул\.?|улица|наб\.?|набережная|пр\.?|пр-кт|просп\.?|проспект|пер\.?|переулок|б-р|бульвар|ш\.?|шоссе)\s+[^\n,]{1,120}(?:,\s*[^\n,]{1,80}){0,8}/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          const trimmed = trimAddressCandidate(r.value)
          if (trimmed.length < 12) return null
          const end = r.start + trimmed.length
          if (overlapsLabeledAddress(r.start, end, labeledAddressSpans)) return null
          return {
            start: r.start,
            end,
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
        /(?:^|[\s,;])(?:г\.|город)\s+[А-ЯЁA-Zа-яё\-]+(?:\s*,\s*(?:ул\.?|улица|наб\.?|набережная|пр\.?|пр-кт|просп\.?|проспект|пер\.?|переулок|б-р|бульвар|ш\.?|шоссе)\s*[^,\n]+)(?:,\s*д\.?\s*[^,\n]+)?/giu,
        (m) => {
          const full = m[0]
          const lead = /^[\s,;]/.test(full) ? 1 : 0
          const inner = full.slice(lead)
          const r = trimMatchRange(inner, m.index! + lead)
          if (!r) return null
          const trimmed = trimAddressCandidate(r.value)
          if (trimmed.length < 8) return null
          const end = r.start + trimmed.length
          if (overlapsLabeledAddress(r.start, end, labeledAddressSpans)) return null
          return {
            start: r.start,
            end,
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
          const end = r.start + trimmed.length
          if (overlapsLabeledAddress(r.start, end, labeledAddressSpans)) return null
          return {
            start: r.start,
            end,
            value: trimmed,
            categoryId: 'address' as const,
            placeholderTag: 'АДРЕС' as const,
            typeLabel: 'Адрес',
            priority: 44,
          }
        },
      ),
    )

    raw.push(
      ...collectUnlabeledHeaderAddresses(text).filter(
        (m) => !overlapsLabeledAddress(m.start, m.end, labeledAddressSpans),
      ),
    )

    raw.push(...collectAddressPlaceholderCityTails(text))
    extendAddressMatchesWithCityTail(text, raw)
  }

  if (enabled.has('premises')) {
    raw.push(
      ...collectRegexMatches(
        text,
        /(?:кв\.|квартир[аы]?|оф\.|офис|пом\.|помещени[ея]|комн\.|комната|каб\.|кабинет)[\s:]*(?:№\s*)?[\w\-\/]+/giu,
        (m) => {
          const r = trimMatchRange(m[0], m.index!)
          if (!r) return null
          if (isMatchInsideBracketPlaceholder(text, r.start)) return null
          if (isPremisesInsideLabeledAddress(text, r.start, r.end)) return null
          return {
            start: r.start,
            end: r.end,
            value: r.value,
            categoryId: 'premises' as const,
            placeholderTag: 'ПОМЕЩЕНИЕ' as const,
            typeLabel: 'Помещение / офис / кв.',
            priority: 20,
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
  entities: ReadonlyArray<
    Pick<FoundEntity, 'start' | 'end' | 'placeholder' | 'original'> & {
      replace: boolean
      removeOnly?: boolean
    }
  >,
): string {
  const toApply = entities
    .filter((e) => e.replace)
    .sort((a, b) => b.start - a.start)

  let out = source
  for (const e of toApply) {
    const slice = source.slice(e.start, e.end)
    if (slice !== e.original) continue
    if (e.removeOnly) {
      out = out.slice(0, e.start) + out.slice(e.end)
      continue
    }
    out = out.slice(0, e.start) + e.placeholder + out.slice(e.end)
  }
  return out
}
