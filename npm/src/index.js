import { checkEnv } from '@nitra/check-env'
import { log } from '@nitra/pino'
import { env } from 'node:process'

checkEnv(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'])

export const MAX_TELEGRAM_MSG_LENGTH = 4096

export const sendMessage = async (text, params) => {
  const currentHour = new Date().getHours()
  if (process.env.TELEGRAM_ROUND_CLOCK || (currentHour >= 8 && currentHour <= 18)) {
    // Max length of a Telegram message is 4096 characters
    if (text >= MAX_TELEGRAM_MSG_LENGTH) {
      text = text.slice(0, MAX_TELEGRAM_MSG_LENGTH)
    }

    let url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${
      env.TELEGRAM_CHAT_ID
    }&text=${encodeURIComponent(text)}`

    if (params?.parse_mode?.toLowerCase() === 'html') {
      url += '&parse_mode=HTML'
    }
    let res
    try {
      res = await fetch(url)
    } catch (error) {
      log.error(error)
      return false
    }
    if (res.status >= 400) {
      log.error('Telegram message skipped, not sent ', text)
      return false
    }
  } else {
    log.info('Telegram message skipped, not in working hours: ', text)
  }
}
