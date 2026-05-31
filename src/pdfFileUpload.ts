import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'

export const MAX_PDF_FILE_BYTES = 10 * 1024 * 1024

export const EMPTY_PDF_ERROR = 'EMPTY_PDF'

let pdfWorkerConfigured = false

function ensurePdfWorker(): void {
  if (pdfWorkerConfigured) return
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href
  pdfWorkerConfigured = true
}

/** Извлечение текстового слоя из .pdf через pdf.js (только в браузере) */
export async function readPdfFile(file: File): Promise<string> {
  ensurePdfWorker()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: arrayBuffer }).promise

  const pageTexts: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    let pageText = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      pageText += item.str
      if (item.hasEOL) pageText += '\n'
    }
    pageTexts.push(pageText)
  }

  const text = pageTexts.join('\n').replace(/\r\n?/g, '\n')
  if (!text.trim()) {
    throw new Error(EMPTY_PDF_ERROR)
  }
  return text
}
