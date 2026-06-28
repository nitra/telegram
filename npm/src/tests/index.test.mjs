import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

// Mocking external dependencies used in src/index.js
// @nitra/check-env and @nitra/pino are side-effecting imports, so we mock them.
vi.mock("@nitra/check-env", () => ({
  checkEnv: vi.fn(),
}));
vi.mock("@nitra/pino", () => ({
  log: {
    error: vi.fn(),
  },
}));

// Since the module has a side-effect upon load (checkEnv call),
// we must set up env variables *before* dynamic import.
vi.stubEnv("TELEGRAM_BOT_TOKEN", "TEST_TOKEN");
vi.stubEnv("TELEGRAM_CHAT_ID", "TEST_CHAT_ID");

describe("Public API Tests (src/index.js)", () => {
  let sendMessage;
  let sendDocument;
  let originalFetch;

  beforeAll(async () => {
    // Set up mock for fetch before importing the module
    originalFetch = global.fetch;
    global.fetch = vi.fn(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve({}),
      })
    );

    // Dynamically import the module after setting up mocks and environment
    const module = await import("../index.js");
    sendMessage = module.sendMessage;
    sendDocument = module.sendDocument;
  });

  afterAll(async () => {
    // Restore original fetch
    global.fetch = originalFetch;
    // Unstub environment variables
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure all environment variables are stubbed/unstubbed correctly across tests if necessary
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "TEST_TOKEN");
    vi.stubEnv("TELEGRAM_CHAT_ID", "TEST_CHAT_ID");
  });

  it("should export correct constants", async () => {
    // Import constants separately to avoid side-effects if they are defined in the module scope
    const module = await import("../index.js");
    const { MAX_TELEGRAM_MSG_LENGTH, DEFAULT_PARSE_MODE } = module;

    expect(MAX_TELEGRAM_MSG_LENGTH).toBe(4096);
    expect(DEFAULT_PARSE_MODE).toBe("MarkdownV2");
  });

  it("should correctly escape MarkdownV2 special characters", async () => {
    const module = await import("../index.js");
    const { escapeMarkdownV2 } = module;
    
    // Test known characters
    expect(escapeMarkdownV2("")).toBe("");
    expect(escapeMarkdownV2("*")).toBe("\\*");
    expect(escapeMarkdownV2("_")).toBe("\\_");
    expect(escapeMarkdownV2("[")).toBe("\\[");
    expect(escapeMarkdownV2("]")).toBe("\\]");
    expect(escapeMarkdownV2("(")).toBe("\\(");
    expect(escapeMarkdownV2(")")).toBe("\\)");
    expect(escapeMarkdownV2("~")).toBe("\\~");
    expect(escapeMarkdownV2("`")).toBe("\\`");
    expect(escapeMarkdownV2(">")).toBe("\\>");
    expect(escapeMarkdownV2("#")).toBe("\\#");
    expect(escapeMarkdownV2("+")).toBe("\\+");
    expect(escapeMarkdownV2("-")).toBe("\\-");
    expect(escapeMarkdownV2("|")).toBe("\\|");
    expect(escapeMarkdownV2("{")).toBe("\\{");
    expect(escapeMarkdownV2(".")).toBe("\\.");
    expect(escapeMarkdownV2("!")).toBe("\\!");
    expect(escapeMarkdownV2("\\")).toBe("\\\\"); // Escape the escape character itself
  });

  describe("sendMessage", () => {
    it("should truncate message if it exceeds MAX_TELEGRAM_MSG_LENGTH", async () => {
      const longText = "A".repeat(4097);
      await sendMessage(longText, {});

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain(`text=${"A".repeat(4096)}`);
    });

    it("should call fetch with correct URL structure for MarkdownV2", async () => {
      const text = "Hello World";
      await sendMessage(text, { parse_mode: "MarkdownV2" });

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain("text=Hello%20World");
      expect(url).toContain("parse_mode=MarkdownV2");
    });

    it("should replace <br> tags with newlines before sending", async () => {
      const text = "<br>Test<br>";
      await sendMessage(text, { parse_mode: "HTML" });

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain(`text=${encodeURIComponent("\nTest\n")}`);
    });

    it("should retry without parse_mode when can't parse entities", async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          status: 400,
          json: () => Promise.resolve({ description: "can't parse entities" }),
        })
      );
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve({}),
        })
      );

      await sendMessage("text", { parse_mode: "MarkdownV2" });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      // first call had parse_mode, retry call did not
      expect(global.fetch.mock.calls[0][0]).toContain("parse_mode=MarkdownV2");
      expect(global.fetch.mock.calls[1][0]).not.toContain("parse_mode=");
    });
  });
});
