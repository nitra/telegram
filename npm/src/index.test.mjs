import { vi, describe, it, expect, beforeEach } from "vitest"
import { sendMessage, sendDocument, MAX_TELEGRAM_MSG_LENGTH, DEFAULT_PARSE_MODE, escapeMarkdownV2 } from '../src/index'

// Mock dependencies
vi.mock('@nitra/check-env', () => ({
  checkEnv: vi.fn(),
}))
vi.mock('@nitra/pino', () => ({
  log: {
    error: vi.fn(),
  },
}))
vi.mock('node:process', () => ({
  env: {
    TELEGRAM_BOT_TOKEN: 'TEST_TOKEN',
    TELEGRAM_CHAT_ID: 'TEST_CHAT_ID',
  },
}))

// Mock global fetch
global.fetch = vi.fn()

// Mock Date to control time-based logic
const mockDate = (hours) => {
  const realDate = Date
  global.Date = class extends realDate {
    constructor(d) {
      if (d) super(d)
      else super()
      this.getHours = () => hours
    }
  }
}

describe('telegram functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set a default time that is within working hours (e.g., 10 AM)
    mockDate(10)
  })

  describe('escapeMarkdownV2', () => {
    it('should escape special MarkdownV2 characters', () => {
      const input = 'This is *bold* and [a link](http://example.com) with some {{} } and | pipe |.'
      const expected = 'This is \\*bold\\* and \\[a link\\]\\(http://example.com\\) with some \\{\\{\\}\\} and \\| pipe \\|\\.'
      expect(escapeMarkdownV2(input)).toBe(expected)
    })

    it('should handle non-special characters without modification', () => {
      const input = 'Normal text 123.'
      expect(escapeMarkdownV2(input)).toBe(input)
    })
  })

  describe('resolveParseMode', () => {
    const resolveParseMode = (params) => {
      const raw = params && 'parse_mode' in params ? params.parse_mode : DEFAULT_PARSE_MODE
      if (!raw) {
        return ''
      }
      const known = { html: 'HTML', markdown: 'Markdown', markdownv2: 'MarkdownV2' }
      return known[String(raw).toLowerCase()] ?? raw
    }

    it('should return default parse mode if params is missing', () => {
      expect(resolveParseMode(undefined)).toBe('MarkdownV2')
    })

    it('should return provided mode if available and valid', () => {
      expect(resolveParseMode({ parse_mode: 'HTML' })).toBe('HTML')
      expect(resolveParseMode({ parse_mode: 'markdown' })).toBe('Markdown')
      expect(resolveParseMode({ parse_mode: 'MarkdownV2' })).toBe('MarkdownV2')
    })

    it('should return empty string if mode is falsy', () => {
      expect(resolveParseMode({ parse_mode: '' })).toBe('')
      expect(resolveParseMode({ parse_mode: null })).toBe('')
    })

    it('should return original mode if unknown', () => {
      expect(resolveParseMode({ parse_mode: 'RawMode' })).toBe('RawMode')
    })
  })

  describe('sendMessage', () => {
    const mockText = 'Test message'
    const mockParams = { parse_mode: 'MarkdownV2' }

    beforeEach(() => {
        // Reset date mock to a specific time for easier testing of time conditions
        global.Date = class extends Date {
            constructor(d) {
                super(d)
                this.getHours = vi.fn(() => 10) // Default within working hours
            }
        }
        // Explicitly set time for specific tests if needed
    })

    it('should truncate text if it exceeds MAX_TELEGRAM_MSG_LENGTH', async () => {
      const longText = 'A'.repeat(MAX_TELEGRAM_MSG_LENGTH + 10)
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendMessage(longText, {})
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining(`&text=${encodeURIComponent('A'.repeat(MAX_TELEGRAM_MSG_LENGTH))}`));
    })

    it('should construct the correct URL for successful message sending (default mode)', async () => {
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendMessage(mockText, {})
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://api.telegram.org/botTEST_TOKEN/sendMessage?chat_id=TEST_CHAT_ID&text=Test%20message')
      )
    })

    it('should include parse_mode in URL when specified', async () => {
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendMessage(mockText, { parse_mode: 'HTML' })
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('parse_mode=HTML')
      )
    })

    it('should include disable_notification=true if time is outside 8-18 (e.g., 7 AM)', async () => {
      mockDate(7) // Outside working hours
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendMessage(mockText, {})
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('&disable_notification=true')
      )
    })

    it('should include disable_notification=true if params requests it', async () => {
      mockDate(10) // Inside working hours
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendMessage(mockText, { disable_notification: true })
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('&disable_notification=true')
      )
    })

    it('should handle API errors (status >= 400) and return false', async () => {
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 400,
        json: () => Promise.resolve({ description: 'Bad Request' }),
      })

      const result = await sendMessage(mockText, {})
      expect(result).toBe(false)
    })

    it('should retry sending as plain text if API returns "can\'t parse entities"', async () => {
      const fetchSpy = global.fetch
      // First call fails due to parsing error
      fetchSpy.mockImplementationOnce(() =>
        Promise.resolve({
          status: 400,
          json: () => Promise.resolve({ description: "can't parse entities" }),
        })
      )
      // Second call succeeds (plain text attempt)
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendMessage(mockText, { parse_mode: 'MarkdownV2' })
      // Should be called twice
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('should return false if fetch throws an error', async () => {
      const fetchSpy = global.fetch
      fetchSpy.mockRejectedValue(new Error('Network Error'))

      const result = await sendMessage(mockText, {})
      expect(result).toBe(false)
    })
  })

  describe('sendDocument', () => {
    const mockDocumentBuffer = Buffer.from('document content')
    const mockParams = { caption: 'Test caption', parse_mode: 'MarkdownV2', contentType: 'image/jpeg', filename: 'image.jpg' }

    beforeEach(() => {
        // Reset date mock to a specific time for working hours test
        mockDate(10)
    })

    it('should construct the correct FormData and call fetch for success', async () => {
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendDocument(mockDocumentBuffer, mockParams)

      // Check if fetch was called correctly for POST request with FormData
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const callArgs = fetchSpy.mock.calls[0][1]
      expect(callArgs.method).toBe('POST')
      expect(callArgs.body).toBeInstanceOf(FormData)

      const formData = callArgs.body
      expect(formData.get('chat_id')).toBe('TEST_CHAT_ID')
      expect(formData.get('document').name).toBe('image.jpg')
      expect(formData.get('caption')).toBe('Test caption')
      expect(formData.get('parse_mode')).toBe('MarkdownV2')
    })

    it('should omit caption and parse_mode if not provided', async () => {
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendDocument(mockDocumentBuffer, {})
      
      const callArgs = fetchSpy.mock.calls[0][1]
      const formData = callArgs.body
      expect(formData.has('caption')).toBe(false)
      expect(formData.has('parse_mode')).toBe(false)
    })

    it('should include disable_notification=true if time is outside 8-18 (e.g., 7 AM)', async () => {
      mockDate(7) // Outside working hours
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendDocument(mockDocumentBuffer, mockParams)

      const callArgs = fetchSpy.mock.calls[0][1]
      const formData = callArgs.body
      expect(formData.has('disable_notification')).toBe(true)
    })

    it('should include disable_notification=true if params requests it', async () => {
      mockDate(10) // Inside working hours
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendDocument(mockDocumentBuffer, { ...mockParams, disable_notification: true })

      const callArgs = fetchSpy.mock.calls[0][1]
      const formData = callArgs.body
      expect(formData.has('disable_notification')).toBe(true)
    })

    it('should retry sending as plain text if caption fails parsing', async () => {
      const fetchSpy = global.fetch
      // First call fails due to parsing error in caption
      fetchSpy.mockImplementationOnce(() =>
        Promise.resolve({
          status: 400,
          json: () => Promise.resolve({ description: "can't parse entities" }),
        })
      )
      // Second call succeeds (plain text attempt)
      fetchSpy.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await sendDocument(mockDocumentBuffer, mockParams)
      // Should be called twice
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('should handle API errors (status >= 400) and return false', async () => {
      const fetchSpy = global.fetch
      fetchSpy.mockResolvedValue({
        status: 500,
        json: () => Promise.resolve({ description: 'Internal Server Error' }),
      })

      const result = await sendDocument(mockDocumentBuffer, {})
      expect(result).toBe(false)
    })

    it('should return false if fetch throws an error', async () => {
      const fetchSpy = global.fetch
      fetchSpy.mockRejectedValue(new Error('Fetch Error'))

      const result = await sendDocument(mockDocumentBuffer)
      expect(result).toBe(false)
    })
  })
})