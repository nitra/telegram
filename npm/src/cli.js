#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { sendDocument, sendMessage } from './index.js'

const [, , command, ...rest] = process.argv

const parseArgs = args => {
  const result = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      result[key] = args[i + 1] ?? true
      i++
    }
  }
  return result
}

const commands = {
  async sendMessage() {
    const { text, ...params } = parseArgs(rest)
    if (!text) {
      console.error('Usage: telegram sendMessage --text "..." [--chat_id ID] [--parse_mode html]')
      process.exit(1)
    }
    const ok = await sendMessage(text, params)
    process.exit(ok === false ? 1 : 0)
  },

  async sendDocument() {
    const { file, caption, ...params } = parseArgs(rest)
    if (!file) {
      console.error('Usage: telegram sendDocument --file path [--caption "..."] [--filename name.txt]')
      process.exit(1)
    }
    const content = readFileSync(file)
    const ok = await sendDocument(content, { caption, ...params })
    process.exit(ok === false ? 1 : 0)
  }
}

if (!command || !commands[command]) {
  console.error(`Unknown command: ${command ?? '(none)'}`)
  console.error(`Available: ${Object.keys(commands).join(', ')}`)
  process.exit(1)
}

commands[command]()
