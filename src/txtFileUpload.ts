export const MAX_TXT_FILE_BYTES = 2 * 1024 * 1024

/** Сообщение об ошибке или null, если файл подходит */
export function validateTxtFile(file: File): string | null {
  if (!/\.txt$/iu.test(file.name)) {
    return 'Пока поддерживаются только .txt файлы.'
  }
  if (file.size > MAX_TXT_FILE_BYTES) {
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
