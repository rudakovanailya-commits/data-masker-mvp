import { OFFICIAL_APP_URL } from './trustConfig'

export function OfficialBanner() {
  return (
    <div className="trust-banner" role="status">
      <p className="trust-banner__text">
        Официальная версия сервиса доступна только по адресу:{' '}
        <a className="trust-banner__link" href={OFFICIAL_APP_URL}>
          {OFFICIAL_APP_URL}
        </a>
      </p>
    </div>
  )
}

export function UnofficialHostWarning() {
  return (
    <div className="trust-warning" role="alert">
      <p className="trust-warning__title">Внимание: это неофициальная копия сервиса</p>
      <p className="trust-warning__text">
        Не вставляйте конфиденциальные документы. Официальная версия доступна только по
        адресу:{' '}
        <a className="trust-warning__link" href={OFFICIAL_APP_URL}>
          {OFFICIAL_APP_URL}
        </a>
      </p>
    </div>
  )
}

export function TrustFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <p className="app-footer__line">© 2026. Все права защищены.</p>
        <p className="app-footer__line">
          Оригинальная версия:{' '}
          <a className="app-footer__link" href={OFFICIAL_APP_URL}>
            {OFFICIAL_APP_URL}
          </a>
        </p>
        <p className="app-footer__line">
          Документы обрабатываются локально в браузере и не отправляются на сервер.
        </p>
        <p className="app-footer__line">
          Сервис помогает маскировать чувствительные данные, но не гарантирует полную
          юридическую анонимизацию.
        </p>

        <details className="legal-details" id="terms">
          <summary className="legal-details__summary">Пользовательское соглашение</summary>
          <div className="legal-details__body">
            <p>
              Настоящее соглашение регулирует использование веб-сервиса маскирования
              чувствительных данных в тексте.
            </p>
            <ul>
              <li>
                Сервис предоставляется «как есть», без каких-либо явных или подразумеваемых
                гарантий пригодности для конкретной цели.
              </li>
              <li>
                Пользователь самостоятельно проверяет результат маскирования перед
                использованием или передачей документа третьим лицам.
              </li>
              <li>
                Сервис не гарантирует полную юридическую анонимизацию, удаление всех
                персональных или иных чувствительных данных и соответствие требованиям
                применимого законодательства без дополнительной проверки пользователем.
              </li>
              <li>
                Официальная версия сервиса доступна только по адресу{' '}
                <a href={OFFICIAL_APP_URL}>{OFFICIAL_APP_URL}</a>. Копии, размещённые на
                других доменах, не являются официальной версией и могут отличаться по
                функциональности и безопасности.
              </li>
            </ul>
          </div>
        </details>

        <details className="legal-details" id="privacy">
          <summary className="legal-details__summary">Политика конфиденциальности</summary>
          <div className="legal-details__body">
            <ul>
              <li>
                Обработка текста выполняется локально в браузере пользователя; введённые
                данные не передаются на сервер приложения для анализа или хранения в рамках
                описанной здесь модели работы.
              </li>
              <li>
                Документы и фрагменты текста не сохраняются в базе данных сервиса при
                стандартном использовании через официальную веб-версию.
              </li>
              <li>
                Пользователь самостоятельно решает, какие тексты вставлять в сервис, и несёт
                ответственность за соблюдение внутренних правил и договоров своей организации.
              </li>
              <li>
                Перед передачей очищенного текста третьим лицам необходимо вручную проверить,
                что из документа удалены или заменены все требуемые сведения.
              </li>
            </ul>
          </div>
        </details>
      </div>
    </footer>
  )
}
