import { checkEnv } from '@nitra/check-env'
import { log } from '@nitra/pino'
import { env } from 'node:process'

checkEnv(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'])

export const MAX_TELEGRAM_MSG_LENGTH = 4096

export const sendMessage = async (text, params) => {
  const currentHour = new Date().getHours()
  // if (process.env.TELEGRAM_ROUND_CLOCK || (currentHour >= 8 && currentHour <= 18)) {
  // Max length of a Telegram message is 4096 characters
  if (text.length >= MAX_TELEGRAM_MSG_LENGTH) {
    text = text.slice(0, MAX_TELEGRAM_MSG_LENGTH)
  }

  const useHtml = params?.parse_mode?.toLowerCase() === 'html'

  // Telegram HTML не підтримує <br> (і його варіанти </br>, <br/>) — конвертуємо
  // у звичайний перенос рядка, інакше парсер падає з "can't parse entities".
  if (useHtml) {
    text = text.replaceAll(/<\/?br\s*\/?>/gi, '\n')
  }

  let url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${
    env.TELEGRAM_CHAT_ID
  }&text=${encodeURIComponent(text)}`

  if (useHtml) {
    url += '&parse_mode=HTML'
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

    // Якщо HTML-парсер усе ж не впорався з довільним текстом — повторюємо один раз
    // як plain text (без parse_mode), щоб повідомлення гарантовано дійшло й не
    // плодило каскад помилок. Повтор без HTML вже не дасть "can't parse entities".
    if (useHtml && /can't parse entities/i.test(data.description ?? '')) {
      return sendMessage(text, { ...params, parse_mode: undefined })
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
