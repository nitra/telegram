# @nitra/telegram

Мінімальний хелпер для надсилання повідомлень і документів у Telegram.

## Встановлення

```sh
bun add @nitra/telegram
```

## Налаштування

Потрібні змінні середовища (перевіряються при імпорті через `@nitra/check-env`):

| Змінна               | Опис                         |
| -------------------- | ---------------------------- |
| `TELEGRAM_BOT_TOKEN` | токен бота                   |
| `TELEGRAM_CHAT_ID`   | id чату/каналу для відправки |

## Формат за замовчуванням

Дефолтний `parse_mode` — **MarkdownV2**. Telegram вимагає екранувати спецсимволи
`_ * [ ] ( ) ~ \` > # + - = | { } . !`— для динамічного контенту (тексти помилок,
змінні) використовуйте`escapeMarkdownV2()`:

```js
import { sendMessage, escapeMarkdownV2 } from '@nitra/telegram'

await sendMessage(`*Помилка:* ${escapeMarkdownV2(err.message)}`)
```

Якщо розмітка все одно невалідна, повідомлення **не губиться** — бібліотека один раз
повторює запит без розмітки (plain text).

## API

### `sendMessage(text, params?)`

```js
// MarkdownV2 (дефолт)
await sendMessage('*жирний* текст')

// HTML
await sendMessage('<b>жирний</b>', { parse_mode: 'HTML' })

// без розмітки (plain text)
await sendMessage('будь-який текст', { parse_mode: '' })

// без звуку
await sendMessage('тихо', { disable_notification: true })
```

`params`:

| Поле                   | Тип                                          | За замовчуванням | Опис                                    |
| ---------------------- | -------------------------------------------- | ---------------- | --------------------------------------- |
| `parse_mode`           | `'MarkdownV2' \| 'Markdown' \| 'HTML' \| ''` | `'MarkdownV2'`   | формат розмітки; `''`/`null` — вимкнути |
| `disable_notification` | `boolean`                                    | —                | надіслати без звуку                     |

> У робочі години (08:00–18:00) сповіщення зі звуком; поза ними — автоматично тихо.
> Повідомлення довші за 4096 символів обрізаються.

### `sendDocument(document, params?)`

```js
await sendDocument(Buffer.from(csv), {
  filename: 'report.csv',
  contentType: 'text/csv',
  caption: `*Звіт:* ${escapeMarkdownV2('users_2026.csv')}`
})
```

`params`: `filename`, `contentType`, `caption`, `parse_mode` (дефолт MarkdownV2, лише
для `caption`), `disable_notification`. Як і в `sendMessage`, невалідна розмітка caption
не блокує відправку — повтор без розмітки.

### `escapeMarkdownV2(text)`

Екранує всі зарезервовані символи MarkdownV2. Застосовуйте до **динамічних** частин
(не до всього повідомлення — інакше зникне навмисна розмітка).

```js
escapeMarkdownV2('a_b.c!') // → 'a\\_b\\.c\\!'
```

### `DEFAULT_PARSE_MODE`

Константа з дефолтним форматом (`'MarkdownV2'`).
