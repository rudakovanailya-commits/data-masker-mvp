import mammoth from 'mammoth'

export const MAX_DOCUMENT_FILE_BYTES = 5 * 1024 * 1024

export const EMPTY_DOCX_ERROR = 'EMPTY_DOCX'

export type DocumentFileKind = 'txt' | 'docx'

export function getDocumentFileKind(file: File): DocumentFileKind | null {
  if (/\.txt$/iu.test(file.name)) return 'txt'
  if (/\.docx$/iu.test(file.name)) return 'docx'
  return null
}

/** Сообщение об ошибке или null, если файл подходит */
export function validateDocumentFile(file: File): string | null {
  if (!getDocumentFileKind(file)) {
    return 'Пока поддерживаются только .txt и .docx файлы.'
  }
  if (file.size > MAX_DOCUMENT_FILE_BYTES) {
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

/** Извлечение текста из .docx через mammoth (только в браузере) */
export async function readDocxFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  if (!result.value.trim()) {
    throw new Error(EMPTY_DOCX_ERROR)
  }
  return result.value
}

/** Универсальное чтение .txt / .docx */
export async function readTextFromFile(file: File): Promise<string> {
  const kind = getDocumentFileKind(file)
  if (kind === 'txt') return readTxtFile(file)
  if (kind === 'docx') return readDocxFile(file)
  throw new Error('UNSUPPORTED_FILE')
}
