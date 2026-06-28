import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@nitra/check-env', () => ({ checkEnv: vi.fn() }))
vi.mock('@nitra/pino', () => ({ log: { error: vi.fn() } }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.stubEnv('TELEGRAM_BOT_TOKEN', 'TEST_TOKEN')
vi.stubEnv('TELEGRAM_CHAT_ID', 'TEST_CHAT_ID')

const {
  MAX_TELEGRAM_MSG_LENGTH,
  DEFAULT_PARSE_MODE,
  escapeMarkdownV2,
  sendMessage,
  sendDocument,
} = await import('../index.js')

const { log } = await import('@nitra/pino')

const mockText = 'Test message content'
const TEXT_ENC = encodeURIComponent(mockText)
const BASE_URL = `https://api.telegram.org/botTEST_TOKEN/sendMessage?chat_id=TEST_CHAT_ID&text=${TEXT_ENC}`

describe('escapeMarkdownV2', () => {
  // Regex: /[_*[\]()#+\-=|{}.!\\]/g  — екранує: _ * [ ] ( ) # + - = | { } . ! \
  it('escapes all MarkdownV2 special characters', () => {
    // Charset: _ * [ ] ( ) # + - = | { } . ! \
    expect(escapeMarkdownV2('*bold*')).toBe('\\*bold\\*')
    expect(escapeMarkdownV2('hello!')).toBe('hello\\!')
    expect(escapeMarkdownV2('[link](url)')).toBe('\\[link\\]\\(url\\)')
    expect(escapeMarkdownV2('1+1=2')).toBe('1\\+1\\=2')
    // backslash itself gets escaped
    expect(escapeMarkdownV2('a\\b')).toBe('a\\\\b')
  })

  it('converts non-string argument to string first', () => {
    expect(escapeMarkdownV2(123)).toBe('123')
  })

  it('returns empty string for empty input', () => {
    expect(escapeMarkdownV2('')).toBe('')
  })
})

describe('constants', () => {
  it('MAX_TELEGRAM_MSG_LENGTH is 4096', () => {
    expect(MAX_TELEGRAM_MSG_LENGTH).toBe(4096)
  })

  it('DEFAULT_PARSE_MODE is MarkdownV2', () => {
    expect(DEFAULT_PARSE_MODE).toBe('MarkdownV2')
  })
})

describe('sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ status: 200, json: async () => ({}) })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-28T10:00:00Z')) // робочий час (UTC+0, 10:00)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('constructs URL with parse_mode and message_thread_id', async () => {
    await sendMessage(mockText, { parse_mode: 'HTML', message_thread_id: '123' })
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}&parse_mode=HTML&message_thread_id=123`
    )
  })

  it('adds disable_notification=true outside working hours', async () => {
    vi.setSystemTime(new Date('2026-06-28T23:00:00Z'))
    await sendMessage(mockText, {})
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('&disable_notification=true')
    )
  })

  it('slices text at MAX_TELEGRAM_MSG_LENGTH', async () => {
    await sendMessage('A'.repeat(5000), {})
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`text=${'A'.repeat(4096)}`)
    )
  })

  it('returns false and calls log.error on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'))
    const result = await sendMessage(mockText, {})
    expect(result).toBe(false)
    expect(vi.mocked(log.error)).toHaveBeenCalledWith(new Error('timeout'))
  })

  it('returns false and logs description on Telegram 4xx error', async () => {
    mockFetch.mockResolvedValue({
      status: 400,
      json: async () => ({ description: 'Bad Request' })
    })
    const result = await sendMessage(mockText, {})
    expect(result).toBe(false)
    expect(vi.mocked(log.error)).toHaveBeenCalledWith('Bad Request', mockText)
  })

  it('retries without parse_mode when can\'t parse entities', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 400,
        json: async () => ({ description: "can't parse entities: bad" })
      })
      .mockResolvedValue({ status: 200, json: async () => ({}) })

    await sendMessage(mockText, { parse_mode: 'HTML', message_thread_id: '123' })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    // перший виклик — з parse_mode
    expect(mockFetch.mock.calls[0][0]).toContain('parse_mode=HTML')
    // другий виклик — без parse_mode (plain text retry)
    expect(mockFetch.mock.calls[1][0]).not.toContain('parse_mode=')
  })
})

describe('sendDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ status: 200, json: async () => ({}) })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-28T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls fetch with POST and FormData body', async () => {
    await sendDocument(Buffer.from('data'), {
      caption: 'Test',
      contentType: 'application/pdf',
      filename: 'doc.pdf'
    })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendDocument'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    )
  })

  it('retries without caption parse_mode on parse error', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 400,
        json: async () => ({ description: "can't parse entities" })
      })
      .mockResolvedValue({ status: 200, json: async () => ({}) })

    await sendDocument(Buffer.from('data'), {
      caption: 'Bold *text*',
      parse_mode: 'MarkdownV2',
      contentType: 'application/pdf',
      filename: 'doc.pdf'
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
