import { useEffect } from 'react'

type UsageGuideModalProps = {
  open: boolean
  onClose: () => void
}

export function UsageGuideModal({ open, onClose }: UsageGuideModalProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-guide-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id="usage-guide-title" className="modal__title">
            Как пользоваться пробной версией
          </h2>
        </div>
        <div className="modal__body">
          <p>
            Это пробная версия сервиса для маскирования чувствительных данных в текстах
            договоров, доверенностей, счетов, реквизитов и других документов.
          </p>

          <h3 className="modal__section-title">Как работать</h3>
          <ol className="modal__list">
            <li>Вставьте текст документа в поле «Исходный текст».</li>
            <li>Нажмите «Найти данные».</li>
            <li>Проверьте найденные данные в таблице.</li>
            <li>Снимите галочки с тех строк, которые не нужно заменять.</li>
            <li>Нажмите «Заменить выбранное».</li>
            <li>Проверьте очищенный текст вручную.</li>
            <li>При необходимости отредактируйте результат вручную.</li>
            <li>Скачайте очищенный текст или карту замен.</li>
          </ol>

          <h3 className="modal__section-title">Важно</h3>
          <p>
            Сервис помогает найти и скрыть чувствительные данные, но не гарантирует полную
            юридическую анонимизацию. Перед передачей документа третьим лицам обязательно
            проверьте результат вручную.
          </p>
          <p>
            Сервис ориентирован на общие типы чувствительных данных: ФИО, организации,
            реквизиты, адреса, телефоны, email, паспортные данные, счета и похожие сведения.
            Специальные обозначения, внутренние коды, артикулы товаров, номера заявок,
            складские коды, технические идентификаторы и иные специфические данные могут не
            распознаваться автоматически. При необходимости проверьте и удалите их вручную.
          </p>

          <h3 className="modal__section-title">Карта замен</h3>
          <p>
            Файл «карта замен» содержит исходные чувствительные данные и нужен только для
            внутренней проверки. Не передавайте карту замен третьим лицам без необходимости.
          </p>

          <h3 className="modal__section-title">Конфиденциальность</h3>
          <p>
            Обработка текста выполняется локально в браузере. Документ не отправляется на
            сервер приложения и не сохраняется в базе данных.
          </p>

          <h3 className="modal__section-title">Статус версии</h3>
          <p>
            Это MVP / пробная версия. Сервис будет дорабатываться по результатам
            тестирования. Возможны пропуски, ложные срабатывания и ошибки в сложных форматах
            документов.
          </p>
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
