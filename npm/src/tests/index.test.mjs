import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'

vi.mock('@nitra/check-env', () => ({ checkEnv: vi.fn() }))
vi.mock('@nitra/pino', () => ({ log: { error: vi.fn() } }))

const {
  MAX_TELEGRAM_MSG_LENGTH,
  DEFAULT_PARSE_MODE,
  escapeMarkdownV2,
  sendMessage,
  sendDocument,
} = await import('../index.js')

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'TEST_TOKEN')
  vi.stubEnv('TELEGRAM_CHAT_ID', 'TEST_CHAT')
  vi.stubEnv('TELEGRAM_THREAD_ID', '')
  mockFetch.mockResolvedValue({ status: 200 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('MAX_TELEGRAM_MSG_LENGTH', () => {
  it('is 4096', () => {
    expect(MAX_TELEGRAM_MSG_LENGTH).toBe(4096)
  })
})

describe('DEFAULT_PARSE_MODE', () => {
  it('is MarkdownV2', () => {
    expect(DEFAULT_PARSE_MODE).toBe('MarkdownV2')
  })
})

describe('escapeMarkdownV2', () => {
  it('escapes asterisk', () => expect(escapeMarkdownV2('*')).toBe('\\*'))
  it('escapes underscore', () => expect(escapeMarkdownV2('_')).toBe('\\_'))
  it('escapes dot', () => expect(escapeMarkdownV2('.')).toBe('\\.'))
  it('escapes backslash', () => expect(escapeMarkdownV2('\\')).toBe('\\\\'))
  it('escapes opening bracket', () => expect(escapeMarkdownV2('[')).toBe('\\['))
  it('escapes closing paren', () => expect(escapeMarkdownV2(')')).toBe('\\)'))
  it('leaves plain text unchanged', () => expect(escapeMarkdownV2('hello 123')).toBe('hello 123'))
  it('converts null to escaped string', () => expect(escapeMarkdownV2(null)).toBe('null'))
  it('converts undefined to escaped string', () => expect(escapeMarkdownV2(undefined)).toBe('undefined'))
})

describe('sendMessage', () => {
  it('calls fetch with correct URL structure', async () => {
    await sendMessage('hello', {})
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('botTEST_TOKEN/sendMessage')
    expect(url).toContain('chat_id=TEST_CHAT')
    expect(url).toContain(`text=${encodeURIComponent('hello')}`)
  })

  it('includes parse_mode when provided', async () => {
    await sendMessage('hi', { parse_mode: 'HTML' })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('parse_mode=HTML')
  })

  it('truncates text longer than MAX_TELEGRAM_MSG_LENGTH', async () => {
    const long = 'A'.repeat(MAX_TELEGRAM_MSG_LENGTH + 10)
    await sendMessage(long, {})
    const url = mockFetch.mock.calls[0][0]
    const expected = 'A'.repeat(MAX_TELEGRAM_MSG_LENGTH)
    expect(url).toContain(`text=${encodeURIComponent(expected)}`)
  })

  it('converts <br> tags to newlines in HTML mode', async () => {
    await sendMessage('a<br>b<br/>c', { parse_mode: 'HTML' })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain(encodeURIComponent('a\nb\nc'))
  })

  it('includes disable_notification when silent param is true', async () => {
    vi.setSystemTime(new Date('2024-01-01T03:00:00'))
    await sendMessage('msg', { parse_mode: '' })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('disable_notification=true')
  })
})

describe('sendDocument', () => {
  it('calls fetch with POST method and FormData', async () => {
    await sendDocument('file content', { filename: 'test.txt' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('botTEST_TOKEN/sendDocument')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('includes caption when provided', async () => {
    await sendDocument('data', { caption: 'My caption' })
    const [, init] = mockFetch.mock.calls[0]
    const body = init.body
    expect(body.get('caption')).toBe('My caption')
  })
})
