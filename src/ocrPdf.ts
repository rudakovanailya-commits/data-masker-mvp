import { getDocument } from 'pdfjs-dist'
import { createWorker } from 'tesseract.js'
import { ensurePdfWorker } from './pdfFileUpload'

export const MAX_OCR_PDF_PAGES = 3

export const EMPTY_OCR_PDF_ERROR = 'EMPTY_OCR_PDF'

export type OcrPdfProgress = {
  page: number
  totalPages: number
  status?: string
  percent?: number
}

export type OcrPdfResult = {
  text: string
  truncated: boolean
  totalPages: number
  processedPages: number
}

export const OCR_RENDER_SCALE = 3

const OCR_CANVAS_BACKGROUND = '#ffffff'

async function renderPdfPageToCanvas(pageNum: number, pdf: Awaited<ReturnType<typeof getDocument>['promise']>) {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('CANVAS_CONTEXT_UNAVAILABLE')
  }
  context.fillStyle = OCR_CANVAS_BACKGROUND
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, viewport, background: OCR_CANVAS_BACKGROUND }).promise
  return canvas
}

/** Локальное OCR PDF-скана: рендер страниц через pdf.js, распознавание через tesseract.js */
export async function ocrPdfFile(
  file: File,
  onProgress?: (progress: OcrPdfProgress) => void,
): Promise<OcrPdfResult> {
  ensurePdfWorker()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: arrayBuffer }).promise

  const totalPages = pdf.numPages
  const pagesToProcess = Math.min(totalPages, MAX_OCR_PDF_PAGES)
  const truncated = totalPages > MAX_OCR_PDF_PAGES

  let currentPage = 1
  const worker = await createWorker('rus+eng', undefined, {
    logger: (message) => {
      if (message.status !== 'recognizing text') return
      onProgress?.({
        page: currentPage,
        totalPages: pagesToProcess,
        status: message.status,
        percent: Math.round(message.progress * 100),
      })
    },
  })

  const pageTexts: string[] = []
  try {
    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      currentPage = pageNum
      onProgress?.({
        page: pageNum,
        totalPages: pagesToProcess,
        status: 'rendering',
      })

      const canvas = await renderPdfPageToCanvas(pageNum, pdf)

      onProgress?.({
        page: pageNum,
        totalPages: pagesToProcess,
        status: 'recognizing',
      })

      const { data } = await worker.recognize(canvas)
      pageTexts.push(data.text.trim())
    }
  } finally {
    await worker.terminate()
  }

  const text = pageTexts.join('\n\n').replace(/\r\n?/g, '\n').trim()
  if (!text) {
    throw new Error(EMPTY_OCR_PDF_ERROR)
  }

  return {
    text,
    truncated,
    totalPages,
    processedPages: pagesToProcess,
  }
}

export function formatOcrPdfProgress(progress: OcrPdfProgress): string {
  const base = `Распознавание страницы ${progress.page} из ${progress.totalPages}…`
  if (progress.percent != null && progress.status === 'recognizing text') {
    return `${base} ${progress.percent}%`
  }
  return base
}
