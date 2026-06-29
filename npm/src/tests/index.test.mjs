import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"

vi.mock("@nitra/check-env", () => ({ checkEnv: vi.fn() }))
vi.mock("@nitra/pino", () => ({
  log: {
    error: vi.fn()
  }
}))

// Правильний імпорт усіх необхідних компонентів
const { MAX_TELEGRAM_MSG_LENGTH, DEFAULT_PARSE_MODE, escapeMarkdownV2, sendMessage, sendDocument } = await import("../index.js")

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", mockFetch)
  mockFetch.mockResolvedValue({ status: 200, json: async () => ({}) })
  vi.stubEnv("TELEGRAM_CHAT_ID", "12345")
  vi.stubEnv("TELEGRAM_THREAD_ID", "thread_abc")
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "bottest_value") // Використовуємо мок токен для узгодженості
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})


describe("MAX_TELEGRAM_MSG_LENGTH", () => {
  it("should be equal to 4096", () => {
    expect(MAX_TELEGRAM_MSG_LENGTH).toBe(4096)
  })
})

describe("DEFAULT_PARSE_MODE", () => {
  it("повинен дорівнювати 'MarkdownV2'", () => {
    expect(DEFAULT_PARSE_MODE).toBe("MarkdownV2");
  });
});

describe("escapeMarkdownV2", () => {
  it("should convert null to string 'null'", () => {
    expect(escapeMarkdownV2(null)).toBe("null");
  });

  it("should convert undefined to string 'undefined'", () => {
    expect(escapeMarkdownV2(undefined)).toBe("undefined");
  });

  it("should return an empty string for an empty string input", () => {
    expect(escapeMarkdownV2("")).toBe("");
  });

  it("should escape '*' correctly", () => {
    expect(escapeMarkdownV2("*")).toBe("\\*");
  });

  it("should escape '_' correctly", () => {
    expect(escapeMarkdownV2("_")).toBe("\\_");
  });

  it("should escape '[' correctly", () => {
    expect(escapeMarkdownV2("[")).toBe("\\[");
  });

  it("should escape ']' correctly", () => {
    expect(escapeMarkdownV2("]")).toBe("\\]");
  });

  it("should escape '(' correctly", () => {
    expect(escapeMarkdownV2("(")).toBe("\\(");
  });

  it("should escape ')' correctly", () => {
    expect(escapeMarkdownV2(")")).toBe("\\)");
  });

  it("should escape '~' correctly", () => {
    expect(escapeMarkdownV2("~")).toBe("\\~");
  });

  it("should escape '`' correctly", () => {
    expect(escapeMarkdownV2("`")).toBe("\\`");
  });

  it("should escape '>' correctly", () => {
    expect(escapeMarkdownV2(">")).toBe("\\>");
  });

  it("should escape '#' correctly", () => {
    expect(escapeMarkdownV2("#")).toBe("\\#");
  });

  it("should escape '+' correctly", () => {
    expect(escapeMarkdownV2("+")).toBe("\\+");
  });

  it("should escape '-' correctly", () => {
    expect(escapeMarkdownV2("-")).toBe("\\-");
  });

  it("should escape '=' correctly", () => {
    expect(escapeMarkdownV2("=")).toBe("\\=");
  });

  it("should escape '|' correctly", () => {
    expect(escapeMarkdownV2("|")).toBe("\\|");
  });

  it("should escape '{' correctly", () => {
    expect(escapeMarkdownV2("{")).toBe("\\{");
  });

  it("should escape '}' correctly", () => {
    expect(escapeMarkdownV2("}")).toBe("\\}");
  });

  it("should escape '.' correctly", () => {
    expect(escapeMarkdownV2(".")).toBe("\\.");
  });

  it("should escape '!' correctly", () => {
    expect(escapeMarkdownV2("!")).toBe("\\!");
  });

  it("should escape '\\' correctly", () => {
    expect(escapeMarkdownV2("\\")).toBe("\\\\");
  });

  it("should return 'hello' unchanged for plain text", () => {
    expect(escapeMarkdownV2("hello")).toBe("hello");
  });

  it("should return 'hello world' unchanged for plain text with spaces", () => {
    expect(escapeMarkdownV2("hello world")).toBe("hello world");
  });

  it("should convert 0 to string '0'", () => {
    expect(escapeMarkdownV2(0)).toBe("0");
  });

  it("should convert 42 to string '42'", () => {
    expect(escapeMarkdownV2(42)).toBe("42");
  });
});

describe("sendMessage", () => {
  const mockText = "Hello World";
  // Змінено токен на мок токен для відповідності консистентності в тестах
  const mockParams = {
    chat_id: "12345",
    parse_mode: "MarkdownV2",
    message_thread_id: "thread_abc",
    silent: true,
  };
  // Змінено токен на 'bottest_value'
  // Переконаємося, що URL відповідає тому, що створюється з env.TELEGRAM_BOT_TOKEN
  const expectedUrl = "https://api.telegram.org/botbottest_value/sendMessage?chat_id=12345&text=Hello%20World&parse_mode=MarkdownV2&message_thread_id=thread_abc&disable_notification=true";

  beforeEach(() => {
    mockFetch.mockClear()
  })

  it("should call telegramRequest with correct URL and params when parse_mode is MarkdownV2 and silent is true", async () => {
    await sendMessage(mockText, mockParams)

    // Check URL construction. We must check the URL string since fetch always gets 2 arguments (url, init)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(expectedUrl)
    expect(init).toBeUndefined()
  })

  it("should truncate text if it exceeds MAX_TELEGRAM_MSG_LENGTH", async () => {
    const longText = "A".repeat(MAX_TELEGRAM_MSG_LENGTH + 1)
    await sendMessage(longText, { chat_id: "12345" })

    const expectedTruncatedText = "A".repeat(MAX_TELEGRAM_MSG_LENGTH)
    // Згідно з правилами, використовуємо stringContaining
    const expectedTruncatedUrlPart = `text=${encodeURIComponent(expectedTruncatedText)}`;
    
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain(expectedTruncatedUrlPart)
  })

  it("should handle HTML parse mode by replacing <br> with newline", async () => {
    const htmlText = "Hello<br>World";
    await sendMessage(htmlText, { chat_id: "12345", parse_mode: "HTML" })

    // Telegram API expects \n in the URL when using HTML mode for line breaks
    const expectedUrlWithNewline = "https://api.telegram.org/botbottest_value/sendMessage?chat_id=12345&text=Hello%0AWorld&parse_mode=HTML";

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain("text=Hello%0AWorld")
    expect(url).toContain("parse_mode=HTML")
  })

  it("should use default TELEGRAM_CHAT_ID when chat_id is missing in params", async () => {
    // Очікуваний URL з використанням env.TELEGRAM_CHAT_ID="12345"
    const defaultChatIdUrl = "https://api.telegram.org/botbottest_value/sendMessage?chat_id=12345&text=DefaultText&parse_mode=MarkdownV2&message_thread_id=thread_abc&disable_notification=true";
    
    await sendMessage("DefaultText", { parse_mode: "MarkdownV2" })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe(defaultChatIdUrl) // Використовуємо toBe, оскільки це точний URL-рядок
  })
})
