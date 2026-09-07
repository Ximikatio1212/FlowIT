# FlowIT на Netlify — пошаговая настройка

## Что будет где

```text
Netlify: сайт + serverless API
Telegram: уведомления о заявках
```

Отдельный Render-сервер для API в этой схеме не нужен. PostgreSQL можно подключить
позже: сайт уже умеет работать в бесплатном режиме только с Telegram.

## 1. Подготовить Telegram

1. Создайте бота через `@BotFather` в Telegram и получите токен.
2. Добавьте бота в нужный чат или группу.
3. Получите ID чата и сохраните оба значения.

Токен бота и ID чата нельзя добавлять в код или отправлять в чат.

## 2. Необязательно: создать базу Neon

Если нужно хранить историю заявок не только в Telegram:

1. Откройте Neon и создайте бесплатный PostgreSQL-проект.
2. Скопируйте строку подключения в формате `postgresql://...`.
3. Не вставляйте её во frontend и не отправляйте в чат.

Без `DATABASE_URL` заявки всё равно отправляются в Telegram.

## 3. Создать сайт в Netlify

Подключите репозиторий проекта и оставьте корневую директорию проекта пустой.

Используйте настройки:

```text
Build command:
pnpm --filter @workspace/flowit-website run build

Publish directory:
artifacts/flowit-website/dist/public

Functions directory:
artifacts/flowit-website/netlify/functions
```

Файл `netlify.toml` в корне проекта уже содержит эти настройки и проксирует
`/api/leads` в Netlify Function.

## 4. Добавить переменные в Netlify

В Netlify откройте:

```text
Site configuration → Environment variables
```

Добавьте:

```text
TELEGRAM_BOT_TOKEN = токен бота
TELEGRAM_CHAT_ID   = ID чата получателя
BASE_PATH          = /
PORT               = 8888
```

`DATABASE_URL` добавьте только если подключили Neon. `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID` и `DATABASE_URL` должны существовать только в переменных
Netlify. Не добавляйте их в HTML, React-код или публичный репозиторий.

## 5. Что происходит после публикации

1. Посетитель нажимает «Сайт», «Автоматизация», «Разработка» или
   «Консалтинг».
2. Открывается форма с выбранной услугой.
3. При отправке сайт передаёт выбранную услугу вместе с заявкой.
4. Netlify Function отправляет заявку в Telegram.
5. Если добавлен `DATABASE_URL`, заявка также сохраняется в Neon.
6. В Telegram будет отдельная строка `🧭 Выбрано на сайте`.

## 6. Проверка после деплоя

Откройте:

```text
https://ВАШ-САЙТ.netlify.app/api/healthz
```

Должен вернуться ответ:

```json
{"status":"ok"}
```

После этого нажмите на одну из услуг, заполните форму и проверьте Telegram.