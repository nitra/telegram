import { checkEnv } from '@nitra/check-env'
import { log } from '@nitra/pino'
import { env } from 'node:process'

checkEnv(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'])

export const MAX_TELEGRAM_MSG_LENGTH = 4096

// Дефолтний формат повідомлень. Викликач може перевизначити через params.parse_mode
// ('HTML' | 'Markdown' | 'MarkdownV2'), або вимкнути розмітку ('' / null).
export const DEFAULT_PARSE_MODE = 'MarkdownV2'

// Екранує спецсимволи MarkdownV2. Застосовувати до ДИНАМІЧНОГО контенту (тексти
// помилок, змінні) — інакше Telegram падає з "can't parse entities". Навмисно не
// застосовується авто до всього тексту, бо це знищило б навмисну розмітку.
export const escapeMarkdownV2 = text =>
  String(text).replaceAll(/[_*[\]()~`>#+\-=|{}.!\\]/g, String.raw`\$&`)

// Дефолт — MarkdownV2; явні '' / null / undefined → без розмітки (plain text).
const resolveParseMode = params => {
  const raw = params && 'parse_mode' in params ? params.parse_mode : DEFAULT_PARSE_MODE
  if (!raw) {
    return ''
  }
  const known = { html: 'HTML', markdown: 'Markdown', markdownv2: 'MarkdownV2' }
  return known[String(raw).toLowerCase()] ?? raw
}

export const sendMessage = async (text, params) => {
  const currentHour = new Date().getHours()
  // Max length of a Telegram message is 4096 characters
  if (text.length >= MAX_TELEGRAM_MSG_LENGTH) {
    text = text.slice(0, MAX_TELEGRAM_MSG_LENGTH)
  }

  const parseMode = resolveParseMode(params)

  // Telegram HTML не підтримує <br> (і його варіанти </br>, <br/>) — конвертуємо
  // у звичайний перенос рядка, інакше парсер падає з "can't parse entities".
  if (parseMode === 'HTML') {
    text = text.replaceAll(/<\/?br\s*\/?>/gi, '\n')
  }

  let url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${
    env.TELEGRAM_CHAT_ID
  }&text=${encodeURIComponent(text)}`

  if (parseMode) {
    url += `&parse_mode=${parseMode}`
  }

  // Якщо в неробочий час або відключено сповіщення, то додаємо параметр disable_notification
  if (!(currentHour >= 8 && currentHour <= 18) || params?.disable_notification === true) {
    url += '&disable_notification=true'
  }

  let res
  try {
    res = await fetch(url)
  } catch (error) {
    log.error(error)
    return false
  }

  if (res.status >= 400) {
    const data = await res.json()

    // Якщо парсер розмітки не впорався з довільним текстом — повторюємо один раз
    // як plain text (без parse_mode), щоб повідомлення гарантовано дійшло й не
    // плодило каскад помилок. Повтор без розмітки вже не дасть "can't parse entities".
    if (parseMode && /can't parse entities/i.test(data.description ?? '')) {
      return sendMessage(text, { ...params, parse_mode: '' })
    }

    log.error(data.description, text)
    return false
  }
}

export const sendDocument = async (document, params = {}) => {
  const currentHour = new Date().getHours()

  const formData = new FormData()
  formData.append('chat_id', env.TELEGRAM_CHAT_ID)

  // Додаємо документ як Blob з параметрами
  const blob = new Blob([document], { type: params.contentType || 'application/octet-stream' })
  formData.append('document', blob, params.filename || 'document.txt')

  // Додаємо опціональні параметри
  if (params.caption) {
    formData.append('caption', params.caption)
  }

  if (params.parse_mode) {
    formData.append('parse_mode', params.parse_mode)
  }

  // Якщо в неробочий час або відключено сповіщення, то додаємо параметр disable_notification
  if (!(currentHour >= 8 && currentHour <= 18) || params?.disable_notification === true) {
    formData.append('disable_notification', 'true')
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      body: formData
    })
  } catch (error) {
    log.error(error)
    return false
  }

  if (res.status >= 400) {
    const data = await res.json()
    log.error(data.description)
    return false
  }
}
