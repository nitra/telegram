import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@nitra/check-env', () => ({ checkEnv: vi.fn() }))
vi.mock('@nitra/pino', () => ({
  log: {
    error: vi.fn()
  }
}))

const { MAX_TELEGRAM_MSG_LENGTH, DEFAULT_PARSE_MODE, escapeMarkdownV2, sendMessage, sendDocument } =
  await import('../index.js')

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockResolvedValue({ status: 200, json: async () => ({}) })
  vi.stubEnv('TELEGRAM_CHAT_ID', 'test_value')
  vi.stubEnv('TELEGRAM_THREAD_ID', 'test_value')
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test_value')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2024-01-01T02:00:00')) // поза робочими годинами
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('MAX_TELEGRAM_MSG_LENGTH', () => {
  it('should be equal to 4096', () => {
    expect(MAX_TELEGRAM_MSG_LENGTH).toBe(4096)
  })
})

describe('DEFAULT_PARSE_MODE', () => {
  it("should be 'MarkdownV2'", () => {
    expect(DEFAULT_PARSE_MODE).toBe('MarkdownV2')
  })
})

describe('escapeMarkdownV2', () => {
  it('should escape special characters correctly', () => {
    expect(escapeMarkdownV2('*')).toBe('\\*')
    expect(escapeMarkdownV2('_')).toBe('\\_')
    expect(escapeMarkdownV2('[')).toBe('\\[')
    expect(escapeMarkdownV2(']')).toBe('\\]')
    expect(escapeMarkdownV2('(')).toBe('\\(')
    expect(escapeMarkdownV2(')')).toBe('\\)')
    expect(escapeMarkdownV2('~')).toBe('\\~')
    expect(escapeMarkdownV2('`')).toBe('\\`')
    expect(escapeMarkdownV2('>')).toBe('\\>')
    expect(escapeMarkdownV2('#')).toBe('\\#')
    expect(escapeMarkdownV2('+')).toBe('\\+')
    expect(escapeMarkdownV2('-')).toBe('\\-')
    expect(escapeMarkdownV2('=')).toBe('\\=')
    expect(escapeMarkdownV2('|')).toBe('\\|')
    expect(escapeMarkdownV2('{')).toBe('\\{')
    expect(escapeMarkdownV2('}')).toBe('\\}')
    expect(escapeMarkdownV2('.')).toBe('\\.')
    expect(escapeMarkdownV2('!')).toBe('\\!')
    expect(escapeMarkdownV2('\\')).toBe('\\\\')
  })

  it('should return the input as a string for normal text', () => {
    expect(escapeMarkdownV2('hello')).toBe('hello')
    expect(escapeMarkdownV2('hello world')).toBe('hello world')
  })

  it('should handle null, undefined, and empty string inputs', () => {
    expect(escapeMarkdownV2(null)).toBe('null')
    expect(escapeMarkdownV2(undefined)).toBe('undefined')
    expect(escapeMarkdownV2('')).toBe('')
  })

  it('should convert number inputs to string and return', () => {
    expect(escapeMarkdownV2(0)).toBe('0')
    expect(escapeMarkdownV2(42)).toBe('42')
  })
})

describe('sendMessage', () => {
  it('should call fetch with the correct URL and params for a simple text message when chat_id is provided', async () => {
    const text = 'Hello world'
    const params = { chat_id: 'specific_chat_id', parse_mode: 'MarkdownV2' }

    await sendMessage(text, params)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('https://api.telegram.org/bottest_value/sendMessage')
    expect(url).toContain('chat_id=specific_chat_id')
    expect(url).toContain('text=Hello%20world')
    expect(url).toContain('parse_mode=MarkdownV2')
  })

  it('should handle empty text input', async () => {
    const text = ''
    const params = { chat_id: 'test_value' }

    await sendMessage(text, params)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('https://api.telegram.org/bottest_value/sendMessage')
    expect(url).toContain('chat_id=test_value')
    expect(url).toContain('text=')
  })

  it('should handle text input with special MarkdownV2 characters correctly', async () => {
    const text = '*[text](link) { } ~` >#+-=|{}.'
    const params = { chat_id: 'test_value', parse_mode: 'MarkdownV2' }

    await sendMessage(text, params)

    const encodedText = encodeURIComponent(text)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('chat_id=test_value')
    expect(url).toContain(`text=${encodedText}`)
    expect(url).toContain('parse_mode=MarkdownV2')
  })

  it('should handle text longer than MAX_TELEGRAM_MSG_LENGTH by truncating it', async () => {
    const longText = 'A'.repeat(MAX_TELEGRAM_MSG_LENGTH + 10)
    const params = { chat_id: 'test_value' }

    await sendMessage(longText, params)

    const truncatedText = 'A'.repeat(MAX_TELEGRAM_MSG_LENGTH)
    const encodedTruncatedText = encodeURIComponent(truncatedText)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('chat_id=test_value')
    expect(url).toContain(`text=${encodedTruncatedText}`)
  })

  it("should append disable_notification=true when 'silent' is true in params", async () => {
    const text = 'Silent message'
    const params = { chat_id: 'test_value', silent: true }

    await sendMessage(text, params)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('disable_notification=true')
    expect(url).toContain('text=Silent%20message')
  })

  it('should append message_thread_id when provided', async () => {
    const text = 'Threaded message'
    const params = { chat_id: 'test_value', message_thread_id: '12345' }

    await sendMessage(text, params)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('message_thread_id=12345')
    expect(url).toContain('text=Threaded%20message')
  })

  it('should convert <br> tags to \\n when parseMode is HTML', async () => {
    const text = 'Line 1<br>Line 2<br/>Line 3'
    const params = { chat_id: 'test_value', parse_mode: 'HTML' }

    await sendMessage(text, params)

    const expectedText = 'Line 1\nLine 2\nLine 3'
    const expectedEncodedText = encodeURIComponent(expectedText)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('parse_mode=HTML')
    expect(url).toContain(`text=${expectedEncodedText}`)
  })

  it('should handle cases where chat_id is missing, falling back to TELEGRAM_CHAT_ID', async () => {
    const text = 'Fallback chat'
    const params = { parse_mode: 'MarkdownV2' } // chat_id missing

    await sendMessage(text, params)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('chat_id=test_value')
    expect(url).toContain('text=Fallback%20chat')
    expect(url).toContain('parse_mode=MarkdownV2')
  })

  it('should handle cases where parse_mode is missing, resulting in no parse_mode parameter', async () => {
    const text = 'Simple text'
    const params = { chat_id: 'test_value' }

    await sendMessage(text, params)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('chat_id=test_value')
    expect(url).toContain('text=Simple%20text')
    expect(url).not.toContain('parse_mode=')
  })
})

describe('sendDocument', () => {
  it('should return {} when document is null', async () => {
    const result = await sendDocument(null)
    expect(result).toEqual({})
  })

  it('should return {} when document is undefined', async () => {
    const result = await sendDocument(undefined)
    expect(result).toEqual({})
  })

  it('should return {} when document is an empty string', async () => {
    const result = await sendDocument('')
    expect(result).toEqual({})
  })

  it('should return {} when document is a single character string', async () => {
    const result = await sendDocument('*')
    expect(result).toEqual({})
  })

  it('should return {} when document is a digit', async () => {
    const result = await sendDocument(0)
    expect(result).toEqual({})
  })

  it('should handle a simple document successfully and return API response', async () => {
    const mockContent = new Blob(['test content'], { type: 'application/octet-stream' })
    const mockParams = {
      contentType: 'application/octet-stream',
      filename: 'test.txt',
      caption: 'Test Caption',
      parse_mode: 'MarkdownV2'
    }

    // Mock fetch to simulate success
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ ok: true, result: 'success' })
    })

    const result = await sendDocument(mockContent, mockParams)

    // Check fetch call
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.telegram.org/bottest_value/sendDocument'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    )

    // Check return value
    expect(result).toEqual({ ok: true, result: 'success' })
  })

  it('should handle a document without caption and threadId', async () => {
    const mockContent = new Blob(['data'], { type: 'image/jpeg' })
    const mockParams = {
      contentType: 'image/jpeg',
      filename: 'image.jpg'
    }

    // Mock fetch to simulate success
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ ok: true, result: 'success' })
    })

    const result = await sendDocument(mockContent, mockParams)

    // Check fetch call
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.telegram.org/bottest_value/sendDocument'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    )

    // Check return value
    expect(result).toEqual({ ok: true, result: 'success' })
  })
})
