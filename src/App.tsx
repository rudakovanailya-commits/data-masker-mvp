import { useCallback, useMemo, useState } from 'react'
import {
  applyMasking,
  CATEGORY_OPTIONS,
  findSensitiveEntities,
  type CategoryId,
  type FoundEntity,
} from './masking'
import { OfficialBanner, TrustFooter, UnofficialHostWarning } from './TrustChrome'
import { downloadReplacementMap } from './replacementMap'
import { isAllowedHostname } from './trustConfig'

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

export default function App() {
  const [sourceText, setSourceText] = useState('')
  const [enabledCategories, setEnabledCategories] = useState<Set<CategoryId>>(
    () => defaultEnabledCategories(),
  )
  const [rows, setRows] = useState<Row[]>([])
  const [resultText, setResultText] = useState('')
  const [copyHint, setCopyHint] = useState<string | null>(null)

  const hasRows = rows.length > 0
  const hasReplaceableRows = rows.some((r) => r.replace)

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
    setCopyHint(null)
  }, [])

  const handleClearAll = useCallback(() => {
    setSourceText('')
    setRows([])
    setResultText('')
    setEnabledCategories(defaultEnabledCategories())
    setCopyHint(null)
  }, [])

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
        <h1 className="app__title">Маскирование данных</h1>
        <p className="app__lead">
          Локальный поиск и замена реквизитов в тексте. Все вычисления выполняются
          в вашем браузере.
        </p>
      </header>

      <section className="panel">
        <label className="field-label" htmlFor="source">
          Исходный текст
        </label>
        <textarea
          id="source"
          className="textarea textarea--tall"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
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
        <textarea
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
          <button type="button" className="btn btn--danger" onClick={handleClearAll}>
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
