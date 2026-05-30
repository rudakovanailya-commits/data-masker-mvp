/**
 * Эвристическая проверка очищенного текста на возможные остаточные чувствительные данные.
 * Только подсказки для ручной проверки — не заменяет основное маскирование.
 */

export type ResidualRisk = {
  type: string
  fragment: string
  context: string
  index: number
}

const MAX_RISKS = 50
const CONTEXT_RADIUS = 48
const LABEL_PLACEHOLDER_RADIUS = 30

/** Плейсхолдер маскирования: [ИНН_1], [АДРЕС_2] и т.п. */
const MASKING_PLACEHOLDER_RE = /\[[А-ЯЁA-Z][А-ЯЁA-Z0-9_]*_\d+\]/u

type ResidualRule = {
  type: string
  re: RegExp
  /** Дополнительная проверка (контекст, формат) */
  validate?: (text: string, start: number, end: number, fragment: string) => boolean
}

function isInsidePlaceholder(text: string, start: number, end: number): boolean {
  let depth = 0
  for (let i = 0; i < start; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']') depth = Math.max(0, depth - 1)
  }
  if (depth > 0) return true
  const frag = text.slice(start, end).trim()
  if (/^\[[^\]\n]{1,64}\]$/.test(frag)) return true
  return MASKING_PLACEHOLDER_RE.test(frag)
}

/** Метка реквизита/контакта → ожидаемые теги плейсхолдера после неё */
const LABEL_TO_PLACEHOLDER_TAGS: ReadonlyArray<{ re: RegExp; tags: readonly string[] }> = [
  { re: /^ИНН$/iu, tags: ['ИНН'] },
  { re: /^КПП$/iu, tags: ['КПП'] },
  { re: /^ОГРНИП$/iu, tags: ['ОГРН'] },
  { re: /^ОГРН$/iu, tags: ['ОГРН'] },
  { re: /^БИК$/iu, tags: ['БИК'] },
  { re: /^р\s*\/\s*с$/iu, tags: ['РАСЧЕТНЫЙ_СЧЕТ'] },
  { re: /^р\.с\.$/iu, tags: ['РАСЧЕТНЫЙ_СЧЕТ'] },
  { re: /^расч[её]тный\s+сч[её]т$/iu, tags: ['РАСЧЕТНЫЙ_СЧЕТ'] },
  { re: /^к\s*\/\s*с$/iu, tags: ['КОРР_СЧЕТ', 'ПАСПОРТНЫЕ_ДАННЫЕ'] },
  { re: /^корреспондентский\s+сч[её]т$/iu, tags: ['КОРР_СЧЕТ'] },
  { re: /^адрес$/iu, tags: ['АДРЕС'] },
  { re: /^юридический\s+адрес$/iu, tags: ['АДРЕС'] },
  { re: /^почтовый\s+адрес$/iu, tags: ['АДРЕС'] },
  { re: /^телефон$/iu, tags: ['ТЕЛЕФОН'] },
  { re: /^e-?mail$/iu, tags: ['EMAIL'] },
  { re: /^email$/iu, tags: ['EMAIL'] },
  { re: /^снилс$/iu, tags: ['СНИЛС'] },
  {
    re: /^страховое\s+свидетельство\s+обязательного\s+пенсионного\s+страхования$/iu,
    tags: ['СНИЛС'],
  },
  { re: /^паспорт$/iu, tags: ['ПАСПОРТНЫЕ_ДАННЫЕ'] },
]

function getLabelPlaceholderTags(fragment: string): readonly string[] | null {
  const f = fragment.trim()
  for (const { re, tags } of LABEL_TO_PLACEHOLDER_TAGS) {
    if (re.test(f)) return tags
  }
  return null
}

/** Метка уже закрыта плейсхолдером в ближайших 30 символах — не риск */
function isLabelFollowedByExpectedPlaceholder(
  text: string,
  labelEnd: number,
  fragment: string,
): boolean {
  const tags = getLabelPlaceholderTags(fragment)
  if (!tags) return false
  const tail = text.slice(labelEnd, labelEnd + LABEL_PLACEHOLDER_RADIUS)
  const tagAlt = tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(String.raw`\[\s*(?:${tagAlt})_\d+\s*\]`, 'iu').test(tail)
}

function hasMaskingPlaceholderNearby(
  text: string,
  start: number,
  end: number,
  radius: number,
  tag?: string,
): boolean {
  const a = Math.max(0, start - radius)
  const b = Math.min(text.length, end + radius)
  const slice = text.slice(a, b)
  if (tag) {
    const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(String.raw`\[\s*${esc}_\d+\s*\]`, 'iu').test(slice)
  }
  return MASKING_PLACEHOLDER_RE.test(slice)
}

/** «г. Санкт-Петербург», строка даты «__» … 20__ г. — не остаточный адрес */
function isDocumentCityOrDateContext(text: string, start: number, end: number): boolean {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEndIdx = text.indexOf('\n', end)
  const line = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx)
  const trimmed = line.trim()

  if (/«\s*_{1,}\s*»|_{4,}|20_{2,}\s*г\.?/iu.test(trimmed)) return true
  if (/^(?:г\.\s*)?(?:Санкт[\s-]?Петербург|Москва)\s*,?\s*$/iu.test(trimmed)) return true
  if (/(?:^|[\s,«"])г\.\s*(?:Санкт[\s-]?Петербург|Москва)\s*$/iu.test(trimmed)) return true

  return false
}

function shouldSkipAddressFragment(text: string, start: number, end: number): boolean {
  if (hasMaskingPlaceholderNearby(text, start, end, 80, 'АДРЕС')) return true
  if (isDocumentCityOrDateContext(text, start, end)) return true
  return false
}

function buildContext(text: string, start: number, end: number): string {
  const a = Math.max(0, start - CONTEXT_RADIUS)
  const b = Math.min(text.length, end + CONTEXT_RADIUS)
  let ctx = text.slice(a, b).replace(/\s+/g, ' ').trim()
  if (a > 0) ctx = `…${ctx}`
  if (b < text.length) ctx = `${ctx}…`
  return ctx
}

function normalizeDedupKey(type: string, fragment: string): string {
  return `${type}::${fragment.trim().replace(/\s+/g, ' ').toLowerCase()}`
}

function hasNearby(text: string, start: number, end: number, radius: number, re: RegExp): boolean {
  const a = Math.max(0, start - radius)
  const b = Math.min(text.length, end + radius)
  return re.test(text.slice(a, b))
}

const ADDRESS_MARKER_RE =
  /(?:адрес|г\.|город|ул\.|улица|пр-кт|проспект|наб\.|набережная|д\.|дом|к\.|кв\.|квартира|пом\.|помещение|санкт|петербург|москва)/iu

const SNILS_CTX_RE = /(?:снилс|страхов(?:ое|ого)\s+свидетельств|пенсионного\s+страхован)/iu

const REQUISITE_LABEL_RE = /(?:инн|кпп|огрн|бик|р\s*\/\s*с|к\s*\/\s*с|расч[её]т|корреспондент)/iu

/** Граница слова для кириллицы (\\b в JS не работает с \\p{L}) */
const WL = String.raw`(?<![\p{L}\p{N}_])`
const WR = String.raw`(?![\p{L}\p{N}_])`
const W = (inner: string) => `${WL}${inner}${WR}`

const RULES: ResidualRule[] = [
  // —— Паспорт ——
  {
    type: 'Паспорт (ключевое слово)',
    re: new RegExp(W(String.raw`(?:паспорт|выдан|выдана|выданный|выданной)`), 'giu'),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'Паспорт (к/п, код подразделения)',
    re: new RegExp(W(String.raw`(?:к\/п|код\s+подразделения)`), 'giu'),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'Паспорт (серия/номер)',
    re: new RegExp(W(String.raw`(?:\d{2}\s+\d{2}|\d{4})\s*(?:№|N)?\s*\d{6}`), 'giu'),
    validate: (text, start, end) =>
      hasNearby(
        text,
        start,
        end,
        80,
        /(?:^|[^\p{L}\p{N}_])(?:паспорт|серия|номер|выдан|к\/п)(?![\p{L}\p{N}_])/iu,
      ),
  },
  {
    type: 'Паспорт (серия/номер)',
    re: new RegExp(W(String.raw`(?:серия|номер)\s+(?:\d{2}\s+\d{2}|\d{4})`), 'giu'),
  },

  // —— Реквизиты ——
  {
    type: 'Реквизит (метка)',
    re: new RegExp(W(String.raw`(?:ИНН|КПП|ОГРН(?:ИП)?|БИК|бик)`), 'giu'),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'Реквизит (счёт)',
    re: new RegExp(W(String.raw`(?:к\/\s*с|р\/\s*с|р\.с\.)`), 'giu'),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'Реквизит (счёт)',
    re: new RegExp(W(String.raw`(?:расч[её]тный|корреспондентский)\s+сч[её]т`), 'giu'),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'Реквизит (БИК)',
    re: /\b04\d{7}\b/g,
    validate: (text, start, end) =>
      hasNearby(text, start, end, 64, REQUISITE_LABEL_RE) ||
      hasNearby(text, start, end, 32, /(?:^|[^\p{L}\p{N}_])банк(?![\p{L}\p{N}_])/iu),
  },
  {
    type: 'Реквизит (счёт 20 цифр)',
    re: /\b(?:40[78]|301)\d{17}\b/g,
    validate: (text, start, end) => hasNearby(text, start, end, 72, REQUISITE_LABEL_RE),
  },
  {
    type: 'Реквизит (ИНН)',
    re: new RegExp(W(String.raw`(?:ИНН|инн)\s*[:№]?\s*\d{10,12}`), 'giu'),
  },
  {
    type: 'Реквизит (КПП)',
    re: new RegExp(W(String.raw`(?:КПП|кпп)\s*[:№]?\s*\d{9}`), 'giu'),
  },

  // —— Организации ——
  {
    type: 'Организация (форма)',
    re: new RegExp(W(String.raw`(?:ООО|АО|ПАО|ЗАО|ОАО|НКО)`), 'gu'),
  },
  {
    type: 'ИП',
    re: /(?:^|[^\p{L}\p{N}_])ИП\s+(?=[А-ЯЁA-Z])/gmu,
  },
  {
    type: 'Банк',
    re: new RegExp(W(String.raw`(?:банк|БАНК)`), 'gu'),
  },
  {
    type: 'Банк России',
    re: new RegExp(
      W(
        String.raw`(?:[А-ЯЁA-Z][А-ЯЁA-Z\-]{1,48}[\s\u00A0]+)?ГУ[\s\u00A0]+БАНКА[\s\u00A0]+РОССИИ|БАНКА[\s\u00A0]+РОССИИ|БАНК[\s\u00A0]+РОССИИ`,
      ),
      'giu',
    ),
  },
  {
    type: 'Госорган (налог)',
    re: new RegExp(W(String.raw`(?:ФНС|ИФНС|УФНС)`), 'gu'),
  },

  // —— Адрес ——
  {
    type: 'Адрес (метка)',
    re: new RegExp(W(String.raw`(?:адрес|юридический\s+адрес|почтовый\s+адрес)`), 'giu'),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'Адрес (город)',
    re: /(?:^|[^\p{L}\p{N}_])(?:г\.|город)(?![\p{L}\p{N}_])/giu,
    validate: (text, start, end, frag) =>
      frag.trim().length <= 12 && !shouldSkipAddressFragment(text, start, end),
  },
  {
    type: 'Адрес (улица)',
    re: new RegExp(W(String.raw`(?:ул\.|улица|пр-кт|проспект|наб\.|набережная)`), 'giu'),
    validate: (text, start, end) => !shouldSkipAddressFragment(text, start, end),
  },
  {
    type: 'Адрес (дом/квартира)',
    re: new RegExp(W(String.raw`(?:д\.|дом|кв\.|квартира|пом\.|помещение)`), 'giu'),
    validate: (text, start, end) => !shouldSkipAddressFragment(text, start, end),
  },
  {
    type: 'Адрес (город)',
    re: new RegExp(W(String.raw`(?:Санкт[\s-]?Петербург|Москва)`), 'giu'),
    validate: (text, start, end) => !shouldSkipAddressFragment(text, start, end),
  },
  {
    type: 'Адрес (индекс)',
    re: /\b\d{6}\b/g,
    validate: (text, start, end) => {
      if (shouldSkipAddressFragment(text, start, end)) return false
      return hasNearby(text, start, end, 72, ADDRESS_MARKER_RE)
    },
  },

  // —— Контакты ——
  {
    type: 'Контакт (метка)',
    re: new RegExp(W(String.raw`(?:Телефон|телефон)`), 'giu'),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'Контакт (метка)',
    re: new RegExp(W(String.raw`(?:E-mail|Email|e-mail|email)`), 'giu'),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'Телефон',
    re: /(?:\+7|8)[\s\-–]?(?:\(\s*\d{3}\s*\)|\d{3})[\s\-–]?\d{3}[\s\-–]?\d{2}[\s\-–]?\d{2}/g,
  },
  {
    type: 'Email',
    re: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  },
  { type: 'Сайт (URL)', re: /\bhttps?:\/\/[^\s<>"']{4,120}/gi },
  { type: 'Сайт (www)', re: /\bwww\.[a-zA-Z0-9.-]{2,80}\.[a-zA-Z]{2,6}\b/gi },
  {
    type: 'Сайт (домен)',
    re: /\b[a-zA-Z0-9][a-zA-Z0-9-]{0,62}[a-zA-Z0-9]\.(?:ru|com|org|net|рф)\b/giu,
    validate: (text, start) => text[start - 1] !== '@',
  },

  // —— СНИЛС ——
  {
    type: 'СНИЛС (метка)',
    re: new RegExp(W(String.raw`(?:СНИЛС|снилс)`), 'giu'),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'СНИЛС (метка)',
    re: new RegExp(
      W(String.raw`Страховое\s+свидетельство\s+обязательного\s+пенсионного\s+страхования`),
      'giu',
    ),
    validate: (text, _s, end, frag) =>
      !isLabelFollowedByExpectedPlaceholder(text, end, frag),
  },
  {
    type: 'СНИЛС',
    re: /\d{3}[\-–\s]\d{3}[\-–\s]\d{3}[\-–\s]\d{2}/g,
    validate: (text, start, end) => hasNearby(text, start, end, 96, SNILS_CTX_RE),
  },
  {
    type: 'СНИЛС',
    re: /\b\d{11}\b/g,
    validate: (text, start, end, frag) => {
      if (!hasNearby(text, start, end, 96, SNILS_CTX_RE)) return false
      return frag.replace(/\D/g, '').length === 11
    },
  },
]

function collectRuleMatches(text: string, rule: ResidualRule): ResidualRisk[] {
  const out: ResidualRisk[] = []
  const flags = rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`
  const rx = new RegExp(rule.re.source, flags)
  for (const m of text.matchAll(rx)) {
    if (m.index === undefined) continue
    const fragment = m[0]
    const start = m.index
    const end = start + fragment.length
    if (isInsidePlaceholder(text, start, end)) continue
    if (isLabelFollowedByExpectedPlaceholder(text, end, fragment)) continue
    if (rule.validate && !rule.validate(text, start, end, fragment)) continue
    out.push({
      type: rule.type,
      fragment,
      context: buildContext(text, start, end),
      index: start,
    })
  }
  return out
}

/** Поиск возможных остаточных чувствительных данных в уже очищенном тексте */
export function findResidualRisks(text: string): ResidualRisk[] {
  if (!text.trim()) return []

  const seen = new Set<string>()
  const out: ResidualRisk[] = []

  for (const rule of RULES) {
    for (const risk of collectRuleMatches(text, rule)) {
      const key = normalizeDedupKey(risk.type, risk.fragment)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(risk)
      if (out.length >= MAX_RISKS) {
        out.sort((a, b) => a.index - b.index)
        return out
      }
    }
  }

  out.sort((a, b) => a.index - b.index)
  return out
}
