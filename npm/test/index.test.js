import { beforeEach, describe, expect, it, vi } from 'vitest'

// checkEnv() виконується при імпорті — задаємо env до динамічного імпорту модуля.
process.env.TELEGRAM_BOT_TOKEN = 'TOKEN'
process.env.TELEGRAM_CHAT_ID = 'CHAT'

const { sendMessage, escapeMarkdownV2, DEFAULT_PARSE_MODE } = await import('../src/index.js')

// Мок відповіді Telegram API (без async — щоб не дратувати require-await).
const reply = (status, body) => Promise.resolve({ status, json: () => Promise.resolve(body) })
const ok = () => reply(200, { ok: true })

const lastUrl = () => globalThis.fetch.mock.calls.at(-1)[0]
const parseModeOf = url => new URL(url).searchParams.get('parse_mode')

beforeEach(() => {
  globalThis.fetch = vi.fn(ok)
})

describe('escapeMarkdownV2', () => {
  it('екранує всі зарезервовані символи MarkdownV2', () => {
    expect(escapeMarkdownV2('a_b*c.d-e!')).toBe(String.raw`a\_b\*c\.d\-e\!`)
    expect(escapeMarkdownV2('path/to (x) [y]')).toBe(String.raw`path/to \(x\) \[y\]`)
  })
})

describe('sendMessage parse_mode', () => {
  it('дефолт — MarkdownV2, коли parse_mode не передано', async () => {
    await sendMessage('hello')
    expect(parseModeOf(lastUrl())).toBe('MarkdownV2')
    expect(DEFAULT_PARSE_MODE).toBe('MarkdownV2')
  })

  it('override на HTML працює', async () => {
    await sendMessage('hi', { parse_mode: 'HTML' })
    expect(parseModeOf(lastUrl())).toBe('HTML')
  })

  it('порожній parse_mode вимикає розмітку (plain text)', async () => {
    await sendMessage('hi', { parse_mode: '' })
    expect(parseModeOf(lastUrl())).toBeNull()
  })

  it('у HTML-режимі <br>/</br>/<br/> → перенос рядка', async () => {
    await sendMessage('a<br>b</br>c<br/>d', { parse_mode: 'HTML' })
    expect(new URL(lastUrl()).searchParams.get('text')).toBe('a\nb\nc\nd')
  })
})

describe('fallback на невалідній розмітці', () => {
  it("повторює як plain text при 'can't parse entities'", async () => {
    globalThis.fetch = vi
      .fn()
      .mockReturnValueOnce(reply(400, { description: "Bad Request: can't parse entities: end" }))
      .mockReturnValueOnce(ok())

    await sendMessage('broken_markdown.!')

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(parseModeOf(globalThis.fetch.mock.calls[0][0])).toBe('MarkdownV2')
    expect(parseModeOf(globalThis.fetch.mock.calls[1][0])).toBeNull()
  })

  it('інші 400-помилки не ретраяться, повертає false', async () => {
    globalThis.fetch = vi.fn(() => reply(400, { description: 'Bad Request: chat not found' }))

    const res = await sendMessage('hi')

    expect(res).toBe(false)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})
