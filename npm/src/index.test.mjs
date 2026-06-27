import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@nitra/check-env', () => ({ checkEnv: vi.fn() }))

const { mockLog } = vi.hoisted(() => ({ mockLog: { error: vi.fn() } }))
vi.mock('@nitra/pino', () => ({ log: mockLog }))

// Set env vars before dynamic import so checkEnv stub sees them
process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN'
process.env.TELEGRAM_CHAT_ID = 'TEST_CHAT_ID'

const { sendMessage, sendDocument, MAX_TELEGRAM_MSG_LENGTH, DEFAULT_PARSE_MODE, escapeMarkdownV2 } =
  await import('./index.js')

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

const reply = (status, body = {}) =>
  Promise.resolve({ status, json: () => Promise.resolve(body) })

const lastUrl = () => globalThis.fetch.mock.calls.at(-1)[0]

let realNow
beforeEach(() => {
  globalThis.fetch = vi.fn(() => reply(200))
  mockLog.error.mockReset()
  realNow = Date.now
})
afterEach(() => {
  Date.now = realNow
})

const setHour = hour => vi.spyOn(Date.prototype, 'getHours').mockReturnValue(hour)

describe('constants', () => {
  it('MAX_TELEGRAM_MSG_LENGTH is 4096', () => {
    expect(MAX_TELEGRAM_MSG_LENGTH).toBe(4096)
  })

  it('DEFAULT_PARSE_MODE is MarkdownV2', () => {
    expect(DEFAULT_PARSE_MODE).toBe('MarkdownV2')
  })

  it('escapeMarkdownV2 escapes reserved chars', () => {
    expect(escapeMarkdownV2('a.b!')).toBe(String.raw`a\.b\!`)
  })
})

describe('sendMessage', () => {
  it('calls fetch with correct chat_id and text', async () => {
    await sendMessage('hello', {})
    expect(lastUrl()).toContain(`chat_id=${CHAT_ID}`)
    expect(lastUrl()).toContain(`text=${encodeURIComponent('hello')}`)
  })

  it('uses MarkdownV2 by default', async () => {
    await sendMessage('hi', {})
    expect(lastUrl()).toContain('parse_mode=MarkdownV2')
  })

  it('uses custom parse_mode', async () => {
    await sendMessage('hi', { parse_mode: 'HTML' })
    expect(lastUrl()).toContain('parse_mode=HTML')
  })

  it('omits parse_mode when empty string', async () => {
    await sendMessage('hi', { parse_mode: '' })
    expect(lastUrl()).not.toContain('parse_mode')
  })

  it('truncates text at MAX_TELEGRAM_MSG_LENGTH', async () => {
    const long = 'A'.repeat(MAX_TELEGRAM_MSG_LENGTH + 10)
    await sendMessage(long, {})
    expect(lastUrl()).toContain(encodeURIComponent('A'.repeat(MAX_TELEGRAM_MSG_LENGTH)))
  })

  it('adds disable_notification when outside 8-18', async () => {
    setHour(7)
    await sendMessage('hi', {})
    expect(lastUrl()).toContain('disable_notification=true')
  })

  it('no disable_notification during 8-18', async () => {
    setHour(10)
    await sendMessage('hi', {})
    expect(lastUrl()).not.toContain('disable_notification=true')
  })

  it('logs error and returns false on non-retryable 4xx', async () => {
    globalThis.fetch = vi.fn(() => reply(400, { description: 'Bad Request' }))
    const result = await sendMessage('hi', {})
    expect(result).toBe(false)
    expect(mockLog.error).toHaveBeenCalled()
  })

  it("retries as plain text on can't parse entities", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(reply(400, { description: "can't parse entities" }))
      .mockResolvedValueOnce(reply(200))
    await sendMessage('*bad*', { parse_mode: 'MarkdownV2' })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(lastUrl()).not.toContain('parse_mode')
  })

  it('returns false when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network Error'))
    const result = await sendMessage('hi', {})
    expect(result).toBe(false)
    expect(mockLog.error).toHaveBeenCalled()
  })
})

describe('sendDocument', () => {
  const doc = Buffer.from('test doc')

  it('calls correct URL with POST', async () => {
    await sendDocument(doc, { contentType: 'application/pdf', filename: 'a.pdf' })
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`)
    expect(opts.method).toBe('POST')
  })

  it('returns false on non-retryable API error', async () => {
    globalThis.fetch = vi.fn(() => reply(403, { description: 'Forbidden' }))
    const result = await sendDocument(doc, {})
    expect(result).toBe(false)
    expect(mockLog.error).toHaveBeenCalled()
  })

  it('returns false when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network Error'))
    const result = await sendDocument(doc, {})
    expect(result).toBe(false)
    expect(mockLog.error).toHaveBeenCalled()
  })

  it("retries without parse_mode on can't parse entities in caption", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(reply(400, { description: "can't parse entities" }))
      .mockResolvedValueOnce(reply(200))
    await sendDocument(doc, { caption: '*bold*', parse_mode: 'MarkdownV2' })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
})
