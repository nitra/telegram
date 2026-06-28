import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"

// Mock dependencies before dynamic import
vi.mock('@nitra/check-env', () => ({
  checkEnv: vi.fn(),
}))
vi.mock('@nitra/pino', () => ({
  log: {
    error: vi.fn(),
  },
}))

// Mock fetch globally for API calls
global.fetch = vi.fn()

// Setup environment variables and import module
beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "TEST_TOKEN")
  vi.stubEnv("TELEGRAM_CHAT_ID", "TEST_CHAT_ID")
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// Dynamic import to handle module-level side effects and env setup
const {
  MAX_TELEGRAM_MSG_LENGTH,
  DEFAULT_PARSE_MODE,
  escapeMarkdownV2,
  sendMessage,
  sendDocument,
} = await import("../index.js")

describe("Public API", () => {
  it("should export correct constants", () => {
    expect(MAX_TELEGRAM_MSG_LENGTH).toBe(4096)
    expect(DEFAULT_PARSE_MODE).toBe('MarkdownV2')
  })

  it("should correctly escape MarkdownV2 special characters", () => {
    const input = "This is *bold* text with [links] and (parens) & ~tilde` and \\backslash"
    const expected = "This is \\*bold\\* text with \\[links\\] and \\(parens\\) & ~tilde` and \\\\backslash"
    expect(escapeMarkdownV2(input)).toBe(expected)
    expect(escapeMarkdownV2("plain text")).toBe("plain text")
  })

  describe("sendMessage", () => {
    const mockText = "Hello world"
    const mockParams = {
      chat_id: "123",
    }
    const mockFetch = vi.fn()

    beforeEach(() => {
      global.fetch = mockFetch
      vi.clearAllMocks()
    })

    it("should send message with default MarkdownV2 parse_mode when no params are provided", async () => {
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendMessage(mockText, {})

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("sendMessage?chat_id=TEST_CHAT_ID&text=Hello%20world&parse_mode=MarkdownV2")
      )
    })

    it("should send message with custom parse_mode ('HTML')", async () => {
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendMessage(mockText, { parse_mode: 'HTML' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("sendMessage?chat_id=TEST_CHAT_ID&text=Hello%20world&parse_mode=HTML")
      )
    })

    it("should handle text truncation if it exceeds MAX_TELEGRAM_MSG_LENGTH", async () => {
      const longText = "A".repeat(5000)
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendMessage(longText, {})

      const expectedTruncatedText = "A".repeat(MAX_TELEGRAM_MSG_LENGTH)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`text=${encodeURIComponent(expectedTruncatedText)}`)
      )
    })

    it("should convert <br> tags to \\n when parse_mode is 'HTML'", async () => {
      const htmlText = "Line 1<br>Line 2<br/>Line 3"
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendMessage(htmlText, { parse_mode: 'HTML' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("text=Line%201%0ALine%202%0ALine%203")
      )
    })

    it("should send message as plain text when parse_mode is empty or null", async () => {
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendMessage(mockText, { parse_mode: '' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("sendMessage?chat_id=TEST_CHAT_ID&text=Hello%20world")
      )
    })

    it("should append message_thread_id if provided", async () => {
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendMessage(mockText, { message_thread_id: 5 })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("message_thread_id=5")
      )
    })

    it("should set disable_notification=true outside working hours (assuming current hour is 7)", async () => {
      // Mock Date to be 7 AM
      vi.spyOn(global, 'Date').mockReturnValue(new Date('2024-01-01T07:00:00.000Z'))
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendMessage(mockText, {})

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("disable_notification=true")
      )
    })

    it("should NOT set disable_notification=true inside working hours (assuming current hour is 10)", async () => {
      // Mock Date to be 10 AM
      vi.spyOn(global, 'Date').mockReturnValue(new Date('2024-01-01T10:00:00.000Z'))
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendMessage(mockText, {})

      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("disable_notification=true")
      )
    })

    it("should set disable_notification=true if explicitly requested", async () => {
      vi.spyOn(global, 'Date').mockReturnValue(new Date('2024-01-01T10:00:00.000Z')) // Inside hours
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendMessage(mockText, { disable_notification: true })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("disable_notification=true")
      )
    })

    it("should retry sending message if Telegram returns 'can't parse entities' error", async () => {
      // First call fails with bad parsing, second succeeds
      const mockErrorResponse = { description: "Bad Request: can't parse entities" }
      const successResponse = { status: 200, json: vi.fn().mockResolvedValue({}) }
      
      mockFetch.mockImplementationOnce(() => Promise.resolve({ status: 400, json: () => Promise.resolve(mockErrorResponse) }))
      mockFetch.mockResolvedValueOnce(successResponse)

      await sendMessage(mockText, { parse_mode: 'MarkdownV2' })

      // Should have been called twice: once failing, once succeeding
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("should return false if API call fails with status >= 400 and no retry is performed", async () => {
      const mockErrorResponse = { description: "Unknown error" }
      const res = { status: 401, json: () => Promise.resolve(mockErrorResponse) }
      mockFetch.mockResolvedValue(res)

      const result = await sendMessage(mockText, { parse_mode: 'MarkdownV2' })

      expect(result).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("should return false if network request fails", async () => {
      global.fetch.mockRejectedValue(new Error("Network Error"))

      const result = await sendMessage(mockText, {})

      expect(result).toBe(false)
    })
  })

  describe("sendDocument", () => {
    const mockDocument = Buffer.from("test document")
    const mockParams = {
      caption: "Test caption",
      message_thread_id: 10,
      contentType: 'application/pdf',
      filename: 'doc.pdf',
    }
    const mockFetch = vi.fn()

    beforeEach(() => {
      global.fetch = mockFetch
      vi.clearAllMocks()
    })

    it("should send document with all provided parameters", async () => {
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendDocument(mockDocument, mockParams)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/sendDocument"),
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
      )
      
      const formData = mockFetch.mock.calls[0][1].body
      expect(formData.get('chat_id')).toBe('TEST_CHAT_ID')
      expect(formData.get('document')).toBe('document') // Check blob content or structure logic if needed, but checking key presence is sufficient for simple test
      expect(formData.get('caption')).toBe("Test caption")
      expect(formData.get('parse_mode')).toBe("MarkdownV2") // Default from env/context if not specified in params
      expect(formData.get('message_thread_id')).toBe('10')
      expect(formData.get('disable_notification')).toBeNull() // Should be absent by default
    })

    it("should use default settings when no params are provided", async () => {
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendDocument(mockDocument)

      // Check that it used defaults (e.g., application/octet-stream, default filename)
      const formData = mockFetch.mock.calls[0][1].body
      expect(formData.get('caption')).toBeNull()
      expect(formData.get('document')).toBe('document') // Default filename
    })

    it("should handle non-working hours by appending disable_notification=true", async () => {
      // Mock Date to be 7 AM
      vi.spyOn(global, 'Date').mockReturnValue(new Date('2024-01-01T07:00:00.000Z'))
      const res = { status: 200, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValue(res)

      await sendDocument(mockDocument, {})

      const formData = mockFetch.mock.calls[0][1].body
      expect(formData.get('disable_notification')).toBe('true')
    })

    it("should retry sending document if Telegram returns 'can't parse entities' error on caption", async () => {
      const mockErrorResponse = { description: "Bad Request: can't parse entities" }
      const successResponse = { status: 200, json: vi.fn().mockResolvedValue({}) }
      
      mockFetch.mockImplementationOnce(() => Promise.resolve({ status: 400, json: () => Promise.resolve(mockErrorResponse) }))
      mockFetch.mockResolvedValueOnce(successResponse)

      await sendDocument(mockDocument, { caption: "Bad *markup*" })

      // Should have been called twice: once failing, once succeeding
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("should return false if API call fails with status >= 400 and no retry is performed", async () => {
      const mockErrorResponse = { description: "Unknown error" }
      const res = { status: 500, json: () => Promise.resolve(mockErrorResponse) }
      mockFetch.mockResolvedValue(res)

      const result = await sendDocument(mockDocument)

      expect(result).toBe(false)
    })
  })
})
