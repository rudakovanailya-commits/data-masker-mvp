import mammoth from 'mammoth'
import { EMPTY_PDF_ERROR, MAX_PDF_FILE_BYTES, readPdfFile } from './pdfFileUpload'

export const MAX_DOCUMENT_FILE_BYTES = 5 * 1024 * 1024

export const EMPTY_DOCX_ERROR = 'EMPTY_DOCX'

export { EMPTY_PDF_ERROR }

export type DocumentFileKind = 'txt' | 'docx' | 'pdf'

export function getDocumentFileKind(file: File): DocumentFileKind | null {
  if (/\.txt$/iu.test(file.name)) return 'txt'
  if (/\.docx$/iu.test(file.name)) return 'docx'
  if (/\.pdf$/iu.test(file.name)) return 'pdf'
  return null
}

function getMaxBytesForKind(kind: DocumentFileKind): number {
  return kind === 'pdf' ? MAX_PDF_FILE_BYTES : MAX_DOCUMENT_FILE_BYTES
}

/** Сообщение об ошибке или null, если файл подходит */
export function validateDocumentFile(file: File): string | null {
  const kind = getDocumentFileKind(file)
  if (!kind) {
    return 'Пока поддерживаются только .txt, .docx и .pdf файлы.'
  }
  if (file.size > getMaxBytesForKind(kind)) {
    return 'Файл слишком большой для пробной версии. Попробуйте вставить фрагмент текста.'
  }
  return null
}

/** Чтение .txt локально в браузере */
export function readTxtFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsText(file, 'UTF-8')
  })
}

/** ПАО « / " + перенос + БАНК … → одна строка (mammoth разрывает название банка) */
const SPLIT_BANK_ORG_LINE_RE =
  /(ПАО|АО)\s+([«"\u00AB\u201C])\s*\n\s*(БАНК)/giu

/** Склеенные метки реквизитов (Банк — только с двоеточием, чтобы не резать «…БАНК «…») */
const GLUED_REQUISITE_LABEL_RE =
  /(?<=[^\s\n])(?:Юридический\s+адрес|Почтовый\s+адрес|Расч[её]тный\s+сч[её]т|Расчетный\s+счет|Генеральный\s+директор|E-mail|Email|ОГРНИП|ОГРН|ИНН|КПП|Адрес|Телефон|Сайт|БИК|Банк(?=\s*[:：])|к\s*\/\s*с|Р\s*\/\s*[сc])(?=\s*[:：]|\s|$)/giu

/**
 * Нормализация сырого текста из .docx: пробелы, \\r и разделение склеенных реквизитов.
 * Для .txt не используется.
 */
export function normalizeExtractedDocumentText(text: string): string {
  let s = text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n')
  s = s.replace(SPLIT_BANK_ORG_LINE_RE, '$1 $2$3')
  s = s.replace(/\](?=\[)/g, ']\n')
  s = s.replace(GLUED_REQUISITE_LABEL_RE, (label) => `\n${label}`)
  return s
}

/** Извлечение текста из .docx через mammoth (только в браузере) */
export async function readDocxFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  if (!result.value.trim()) {
    throw new Error(EMPTY_DOCX_ERROR)
  }
  return normalizeExtractedDocumentText(result.value)
}

/** Универсальное чтение .txt / .docx / .pdf */
export async function readTextFromFile(file: File): Promise<string> {
  const kind = getDocumentFileKind(file)
  if (kind === 'txt') return readTxtFile(file)
  if (kind === 'docx') return readDocxFile(file)
  if (kind === 'pdf') return readPdfFile(file)
  throw new Error('UNSUPPORTED_FILE')
}
