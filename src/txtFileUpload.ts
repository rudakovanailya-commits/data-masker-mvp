import { MAX_DOCUMENT_FILE_BYTES, readTxtFile } from './documentFileUpload'

/** @deprecated Используйте MAX_DOCUMENT_FILE_BYTES */
export const MAX_TXT_FILE_BYTES = MAX_DOCUMENT_FILE_BYTES

/** @deprecated Используйте validateDocumentFile */
export function validateTxtFile(file: File): string | null {
  if (!/\.txt$/iu.test(file.name)) {
    return 'Пока поддерживаются только .txt файлы.'
  }
  if (file.size > MAX_DOCUMENT_FILE_BYTES) {
    return 'Файл слишком большой для пробной версии. Попробуйте вставить фрагмент текста.'
  }
  return null
}

export { readTxtFile }
