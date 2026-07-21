import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockSendMessage = vi.fn()
const mockSendDocument = vi.fn()
const mockReadFileSync = vi.fn()

vi.mock('../index.js', () => ({
  sendMessage: mockSendMessage,
  sendDocument: mockSendDocument
}))
vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync
}))

const originalArgv = process.argv

// cli.js reads process.argv and runs its command handler at import time,
// so each test needs a fresh module instance with argv set beforehand.
// cli.js's async command handler isn't awaited at module top level, so our
// mocked process.exit() throws into an unhandled rejection instead of the
// real synchronous process-kill — swallow expected EXIT_* rejections only.
const swallowExpectedExit = error => {
  if (!/^EXIT_/.test(error?.message ?? '')) throw error
}

const runCli = async (...args) => {
  process.argv = ['node', 'cli.js', ...args]
  vi.resetModules()
  process.once('unhandledRejection', swallowExpectedExit)
  try {
    await import('../cli.js')
  } catch (error) {
    swallowExpectedExit(error)
  }
  await new Promise(resolve => setImmediate(resolve))
  process.off('unhandledRejection', swallowExpectedExit)
}

describe('cli', () => {
  let exitSpy
  let errorSpy

  beforeEach(() => {
    vi.clearAllMocks()
    // process.exit is mocked to throw so a real exit()'s control-flow halt is
    // reproduced — without this, code after process.exit(1) keeps running.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`EXIT_${code}`)
    })
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('exits with 1 and prints usage for an unknown command', async () => {
    await runCli('unknownCmd')

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown command: unknownCmd'))
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('exits with 1 and prints usage when sendMessage is called without --text', async () => {
    await runCli('sendMessage', '--chat_id', '123')

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: telegram sendMessage'))
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('calls sendMessage with parsed args and exits 0 on success', async () => {
    mockSendMessage.mockResolvedValue(true)

    await runCli('sendMessage', '--text', 'Hello world', '--chat_id', '123', '--parse_mode', 'html')

    expect(mockSendMessage).toHaveBeenCalledWith('Hello world', { chat_id: '123', parse_mode: 'html' })
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('exits with 1 when sendMessage resolves false', async () => {
    mockSendMessage.mockResolvedValue(false)

    await runCli('sendMessage', '--text', 'Hello world')

    expect(mockSendMessage).toHaveBeenCalledWith('Hello world', {})
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with 1 and prints usage when sendDocument is called without --file', async () => {
    await runCli('sendDocument', '--caption', 'hi')

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: telegram sendDocument'))
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(mockSendDocument).not.toHaveBeenCalled()
  })

  it('reads the file and calls sendDocument with its content, exiting 0 on success', async () => {
    const content = Buffer.from('test content')
    mockReadFileSync.mockReturnValue(content)
    mockSendDocument.mockResolvedValue(true)

    await runCli('sendDocument', '--file', 'path/to/file.txt', '--caption', 'Some caption', '--filename', 'file.txt')

    expect(mockReadFileSync).toHaveBeenCalledWith('path/to/file.txt')
    expect(mockSendDocument).toHaveBeenCalledWith(content, { caption: 'Some caption', filename: 'file.txt' })
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('exits with 1 when sendDocument resolves false', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('data'))
    mockSendDocument.mockResolvedValue(false)

    await runCli('sendDocument', '--file', 'path/to/file.txt')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
