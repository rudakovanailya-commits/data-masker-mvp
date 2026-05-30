import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UsageGuideModal } from './UsageGuideModal'
import {
  applyMasking,
  CATEGORY_OPTIONS,
  findSensitiveEntities,
  type CategoryId,
  type FoundEntity,
} from './masking'
import { findResidualRisks, type ResidualRisk } from './residualCheck'
import { OfficialBanner, TrustFooter, UnofficialHostWarning } from './TrustChrome'
import { downloadReplacementMap } from './replacementMap'
import { isAllowedHostname } from './trustConfig'
import {
  EMPTY_DOCX_ERROR,
  readTextFromFile,
  validateDocumentFile,
} from './documentFileUpload'

type Row = FoundEntity & { replace: boolean }

const REQUIRED_VEHICLE_CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'vin', label: 'VIN / кузов' },
  { id: 'vehicle_plate', label: 'Госномер ТС' },
  { id: 'pts', label: 'ПТС / ЭПТС' },
]

const REQUIRED_EXTRA_CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'website', label: 'Сайт / домен' },
]

function ensureCategoryOptions(
  base: ReadonlyArray<{ id: CategoryId; label: string }>,
): { id: CategoryId; label: string }[] {
  const out = [...base]
  const known = new Set(out.map((c) => c.id))
  for (const c of [...REQUIRED_VEHICLE_CATEGORIES, ...REQUIRED_EXTRA_CATEGORIES]) {
    if (!known.has(c.id)) out.push(c)
  }
  return out
}

function defaultEnabledCategories(): Set<CategoryId> {
  return new Set(ensureCategoryOptions(CATEGORY_OPTIONS).map((c) => c.id))
}

function resolveResidualRiskRange(
  text: string,
  risk: ResidualRisk,
): { start: number; end: number } | null {
  const { index, fragment } = risk
  if (!fragment) return null

  if (index >= 0 && index + fragment.length <= text.length) {
    if (text.slice(index, index + fragment.length) === fragment) {
      return { start: index, end: index + fragment.length }
    }
  }

  const from = index >= 0 ? Math.max(0, index - 32) : 0
  const near = text.indexOf(fragment, from)
  if (near !== -1) {
    return { start: near, end: near + fragment.length }
  }

  const anywhere = text.indexOf(fragment)
  if (anywhere !== -1) {
    return { start: anywhere, end: anywhere + fragment.length }
  }

  return null
}

function scrollTextareaToSelection(textarea: HTMLTextAreaElement): void {
  const start = textarea.selectionStart
  const textBefore = textarea.value.slice(0, start)
  const lineNumber = textBefore.split('\n').length - 1
  const style = window.getComputedStyle(textarea)
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.45
  const target = lineNumber * lineHeight - textarea.clientHeight / 3
  textarea.scrollTop = Math.max(0, target)
}

export default function App() {
  const [sourceText, setSourceText] = useState('')
  const [enabledCategories, setEnabledCategories] = useState<Set<CategoryId>>(
    () => defaultEnabledCategories(),
  )
  const [rows, setRows] = useState<Row[]>([])
  const [resultText, setResultText] = useState('')
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [usageGuideOpen, setUsageGuideOpen] = useState(false)
  const [sourceFileHint, setSourceFileHint] = useState<string | null>(null)
  const [residualRisks, setResidualRisks] = useState<ResidualRisk[] | null>(null)
  const documentFileInputRef = useRef<HTMLInputElement>(null)
  const resultTextareaRef = useRef<HTMLTextAreaElement>(null)
  const inputSectionRef = useRef<HTMLElement>(null)

  const hasRows = rows.length > 0
  const hasReplaceableRows = rows.some((r) => r.replace)
  const hasAnythingToClear =
    Boolean(sourceText) ||
    hasRows ||
    Boolean(resultText) ||
    residualRisks !== null ||
    Boolean(sourceFileHint) ||
    Boolean(copyHint)

  const toggleCategory = useCallback((id: CategoryId) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllCategories = useCallback(() => {
    setEnabledCategories(defaultEnabledCategories())
  }, [])

  const clearCategories = useCallback(() => {
    setEnabledCategories(new Set())
  }, [])

  const handleFind = useCallback(() => {
    setResultText('')
    if (!sourceText.trim()) {
      setRows([])
      return
    }
    const found = findSensitiveEntities(sourceText, enabledCategories)
    setRows(found.map((f) => ({ ...f, replace: true })))
  }, [sourceText, enabledCategories])

  const toggleRow = useCallback((id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, replace: !r.replace } : r)),
    )
  }, [])

  const handleReplace = useCallback(() => {
    setResultText(applyMasking(sourceText, rows))
  }, [sourceText, rows])

  useEffect(() => {
    setResidualRisks(null)
  }, [resultText])

  const handleCopy = useCallback(async () => {
    if (!resultText) return
    try {
      await navigator.clipboard.writeText(resultText)
      setCopyHint('Скопировано')
      window.setTimeout(() => setCopyHint(null), 2000)
    } catch {
      setCopyHint('Не удалось скопировать')
      window.setTimeout(() => setCopyHint(null), 2500)
    }
  }, [resultText])

  const handleDownload = useCallback(() => {
    if (!resultText) return
    const blob = new Blob([resultText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'masked-text.txt'
    a.click()
    URL.revokeObjectURL(url)
  }, [resultText])

  const handleDownloadReplacementMap = useCallback(() => {
    if (!hasRows) return
    downloadReplacementMap(rows)
  }, [rows, hasRows])

  const handleClearSource = useCallback(() => {
    setSourceText('')
    setRows([])
    setResultText('')
    setResidualRisks(null)
    setCopyHint(null)
    setSourceFileHint(null)
  }, [])

  const handleDocumentFilePick = useCallback(() => {
    documentFileInputRef.current?.click()
  }, [])

  const handleDocumentFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return

      const validationError = validateDocumentFile(file)
      if (validationError) {
        setSourceFileHint(validationError)
        return
      }

      try {
        const text = await readTextFromFile(file)
        setSourceText(text)
        setRows([])
        setResultText('')
        setCopyHint(null)
        setSourceFileHint(null)
      } catch (err) {
        if (err instanceof Error && err.message === EMPTY_DOCX_ERROR) {
          setSourceFileHint(
            'Не удалось извлечь текст из .docx. Возможно, документ содержит только скан или изображение.',
          )
        } else {
          setSourceFileHint('Не удалось прочитать файл.')
        }
      }
    },
    [],
  )

  const handleClearAll = useCallback(() => {
    setSourceText('')
    setRows([])
    setResultText('')
    setResidualRisks(null)
    setCopyHint(null)
    setSourceFileHint(null)
    if (documentFileInputRef.current) documentFileInputRef.current.value = ''
    requestAnimationFrame(() => {
      inputSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const handleCheckResiduals = useCallback(() => {
    setResidualRisks(findResidualRisks(resultText))
  }, [resultText])

  const handleJumpToResidualRisk = useCallback(
    (risk: ResidualRisk) => {
      const textarea = resultTextareaRef.current
      if (!textarea) return
      const range = resolveResidualRiskRange(resultText, risk)
      if (!range) return
      textarea.focus()
      textarea.setSelectionRange(range.start, range.end)
      requestAnimationFrame(() => scrollTextareaToSelection(textarea))
    },
    [resultText],
  )

  const enabledCount = useMemo(
    () =>
      ensureCategoryOptions(CATEGORY_OPTIONS).filter((c) =>
        enabledCategories.has(c.id),
      ).length,
    [enabledCategories],
  )

  const categoryOptions = useMemo(
    () => ensureCategoryOptions(CATEGORY_OPTIONS),
    [],
  )

  const isTrustedHost = useMemo(
    () =>
      typeof window !== 'undefined' ? isAllowedHostname(window.location.hostname) : true,
    [],
  )

  return (
    <>
      <OfficialBanner />
      {!isTrustedHost ? <UnofficialHostWarning /> : null}
      <div className="app">
      <header className="app__header">
        <div className="app__header-row">
          <h1 className="app__title">Маскирование данных</h1>
          <button
            type="button"
            className="btn btn--outline app__guide-btn"
            onClick={() => setUsageGuideOpen(true)}
          >
            Как пользоваться
          </button>
        </div>
        <p className="app__lead">
          Локальный поиск и замена реквизитов в тексте. Все вычисления выполняются
          в вашем браузере.
        </p>
      </header>

      <UsageGuideModal open={usageGuideOpen} onClose={() => setUsageGuideOpen(false)} />

      <section className="panel" ref={inputSectionRef}>
        <div className="source-panel__head">
          <label className="field-label" htmlFor="source">
            Исходный текст
          </label>
          <div className="source-upload">
            <input
              ref={documentFileInputRef}
              type="file"
              className="source-upload__input"
              accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleDocumentFileChange}
              tabIndex={-1}
              aria-hidden
            />
            <div className="source-upload__actions">
              <button
                type="button"
                className="btn btn--outline source-upload__btn"
                onClick={handleDocumentFilePick}
              >
                Загрузить .txt / .docx
              </button>
              <button
                type="button"
                className="btn btn--danger source-upload__clear"
                onClick={handleClearAll}
                disabled={!hasAnythingToClear}
              >
                Очистить всё
              </button>
            </div>
            <p className="source-upload__note">
              Файл читается локально в браузере.
            </p>
            <details className="source-upload__docx-details">
              <summary className="source-upload__docx-summary">Ограничения .docx</summary>
              <p className="source-upload__docx-body">
                Для .docx извлекается основной текст документа. Колонтитулы, текстовые
                поля, изображения и сканы могут не распознаться. Проверьте результат
                вручную.
              </p>
            </details>
          </div>
        </div>
        {sourceFileHint ? (
          <p className="source-upload__hint" role="alert">
            {sourceFileHint}
          </p>
        ) : null}
        <textarea
          id="source"
          className="textarea textarea--tall"
          value={sourceText}
          onChange={(e) => {
            setSourceText(e.target.value)
            if (sourceFileHint) setSourceFileHint(null)
          }}
          placeholder="Вставьте текст договора, счёта, письма или выписки…"
          spellCheck={false}
        />
      </section>

      <section className="panel">
        <div className="panel__head">
          <span className="field-label">Категории для поиска</span>
          <span className="muted">{enabledCount} из {CATEGORY_OPTIONS.length}</span>
        </div>
        <div className="category-toolbar">
          <button type="button" className="btn btn--ghost" onClick={selectAllCategories}>
            Выбрать все
          </button>
          <button type="button" className="btn btn--ghost" onClick={clearCategories}>
            Снять все
          </button>
        </div>
        <div className="category-grid">
          {categoryOptions.map((c) => (
            <label key={c.id} className="check">
              <input
                type="checkbox"
                checked={enabledCategories.has(c.id)}
                onChange={() => toggleCategory(c.id)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={handleFind}>
            Найти данные
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={handleClearSource}
            disabled={!sourceText && !hasRows && !resultText}
          >
            Очистить исходный текст
          </button>
        </div>
      </section>

      {hasRows && (
        <section className="panel">
          <div className="panel__head">
            <span className="field-label">Найденные данные</span>
            <span className="muted">{rows.length} совпад.</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-check">Заменить</th>
                  <th>Тип</th>
                  <th>Оригинал</th>
                  <th>Замена</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="col-check">
                      <input
                        type="checkbox"
                        checked={r.replace}
                        onChange={() => toggleRow(r.id)}
                        aria-label={`Заменить: ${r.typeLabel}`}
                      />
                    </td>
                    <td>{r.typeLabel}</td>
                    <td>
                      <code className="cell-code">{r.original}</code>
                    </td>
                    <td>
                      <code className="cell-code cell-code--muted">{r.placeholder}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button type="button" className="btn btn--primary" onClick={handleReplace}>
              Заменить выбранное
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <label className="field-label" htmlFor="result">
          Результат
        </label>
        <p className="result-trial-warning" role="note">
          Проверьте результат вручную перед передачей документа. Это пробная версия: возможны
          пропуски и ложные срабатывания. Сервис ищет общие типы чувствительных данных.
          Специальные коды, артикулы, внутренние номера и иные нестандартные обозначения
          проверьте вручную.
        </p>
        <textarea
          ref={resultTextareaRef}
          id="result"
          className="textarea textarea--tall"
          value={resultText}
          onChange={(e) => setResultText(e.target.value)}
          placeholder="Нажмите «Заменить выбранное», чтобы получить очищенный текст…"
          spellCheck={false}
        />
        <div className="actions actions--wrap">
          <button
            type="button"
            className="btn"
            onClick={handleCopy}
            disabled={!resultText}
          >
            Скопировать
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleDownload}
            disabled={!resultText}
          >
            Скачать .txt
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleDownloadReplacementMap}
            disabled={!hasRows}
          >
            Скачать карту замен .txt
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={handleCheckResiduals}
            disabled={!resultText}
          >
            Проверить остатки
          </button>
          <button type="button" className="btn btn--danger" onClick={handleClearAll} disabled={!hasAnythingToClear}>
            Очистить всё
          </button>
          {copyHint ? <span className="hint">{copyHint}</span> : null}
        </div>
        {hasRows ? (
          <p className="replacement-map-warning" role="note">
            Карта замен содержит исходные чувствительные данные.
            {hasReplaceableRows
              ? null
              : ' Отметьте «Заменить» у нужных строк в таблице.'}
          </p>
        ) : null}
        {residualRisks !== null ? (
          <div className="residual-panel" role="region" aria-label="Возможные остаточные данные">
            <h3 className="residual-panel__title">Возможные остаточные данные</h3>
            {residualRisks.length === 0 ? (
              <p className="residual-panel__empty">
                Явных остаточных данных не найдено. Всё равно проверьте документ вручную.
              </p>
            ) : (
              <>
                <p className="residual-panel__note">
                  Найдено {residualRisks.length} подозрительных фрагментов. Это подсказки для
                  ручной проверки, не автозамена.
                </p>
                <ul className="residual-list">
                  {residualRisks.map((r, i) => (
                    <li key={`${r.index}-${r.type}-${i}`} className="residual-list__item">
                      <div className="residual-list__head">
                        <span className="residual-list__type">{r.type}</span>
                        <button
                          type="button"
                          className="btn btn--ghost residual-list__jump"
                          onClick={() => handleJumpToResidualRisk(r)}
                        >
                          Перейти
                        </button>
                      </div>
                      <code className="residual-list__fragment">{r.fragment}</code>
                      <span className="residual-list__context">{r.context}</span>
                    </li>
                  ))}
                </ul>
                <div className="residual-panel__actions">
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={handleClearAll}
                    disabled={!hasAnythingToClear}
                  >
                    Очистить всё
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>

      <p className="disclaimer" role="note">
        Проверьте результат перед передачей документа. Сервис помогает найти и скрыть
        чувствительные данные, но не гарантирует полную юридическую анонимизацию.
      </p>

      <TrustFooter />
    </div>
    </>
  )
}
