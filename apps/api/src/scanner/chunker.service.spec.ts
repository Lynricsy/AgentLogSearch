import type { AgentRole } from "@agent-log-search/shared"
import type { ParsedMessage, ParsedSession } from "../parsers/index.js"
import { type ChunkDraft, ChunkerService } from "./chunker.service.js"
import type { SourceConfig } from "./scanner.types.js"

describe("ChunkerService", () => {
  it("creates one chunk when a session is shorter than the chunk size", () => {
    // Given：短会话不需要切分
    const service = new ChunkerService()
    const messages = [message(0, "user", "hello"), message(1, "assistant", "hi")]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：输出一个完整 chunk
    expect(chunkSpans(chunks)).toEqual([{ start: 0, end: 1 }])
    expect(chunks[0]?.chunkText).toContain("Agent: codex")
    expect(chunks[0]?.chunkText).toContain("CWD: /workspace")
    expect(chunks[0]?.chunkText).toContain("Thread: thread-1")
    expect(chunks[0]?.chunkText).toContain("User: hello")
    expect(chunks[0]?.chunkText).toContain("Assistant: hi")
  })

  it("keeps non-user preface messages in the first chunk", () => {
    // Given：会话开头先出现 assistant 前言，再进入用户问题
    const service = new ChunkerService()
    const messages = [
      message(0, "assistant", "preface"),
      message(1, "user", "question"),
      message(2, "assistant", "answer"),
    ]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：首个 chunk 从第一条非空消息开始，不丢弃前置内容
    expect(chunkSpans(chunks)).toEqual([{ start: 0, end: 2 }])
    expect(chunks[0]?.chunkText).toContain("Assistant: preface")
    expect(chunks[0]?.chunkText).toContain("User: question")
    expect(chunks[0]?.chunkText).toContain("Assistant: answer")
  })

  it("keeps two messages of overlap when a session exceeds the chunk size", () => {
    // Given：消息数量超过单 chunk 上限
    const service = new ChunkerService()
    const messages = Array.from({ length: 17 }, (_, index) =>
      message(index, index % 2 === 0 ? "user" : "assistant"),
    )

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：第二个 chunk 从前一个 chunk 的最后两条消息开始
    expect(chunkSpans(chunks)).toEqual([
      { start: 0, end: 15 },
      { start: 14, end: 16 },
    ])
  })

  it("keeps overlap when the next user message is outside the overlap window", () => {
    // Given：下一条 user 在 overlap 窗口之后，不能为了 user-start 跳过重叠消息
    const service = new ChunkerService()
    const messages = [
      message(0, "user"),
      message(1, "assistant"),
      message(2, "assistant"),
      message(3, "assistant"),
      message(4, "assistant"),
      message(5, "assistant"),
      message(6, "assistant"),
      message(7, "assistant"),
      message(8, "user"),
      message(9, "assistant"),
      message(10, "assistant"),
      message(11, "assistant"),
      message(12, "assistant"),
      message(13, "assistant"),
      message(14, "assistant"),
      message(15, "assistant"),
      message(16, "assistant"),
    ]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：第二个 chunk 保留两条重叠消息，而不是直接从 seq8 开始
    expect(chunkSpans(chunks)).toEqual([
      { start: 0, end: 15 },
      { start: 14, end: 16 },
    ])
  })

  it("places a long message in its own chunk", () => {
    // Given：中间消息超过目标大小
    const service = new ChunkerService()
    const longContent = "x".repeat(2_001)
    const messages = [
      message(0, "user", "before"),
      message(1, "assistant", longContent),
      message(2, "user", "after"),
    ]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：长消息独立成块，不与前后短消息混合
    expect(chunkSpans(chunks)).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 2 },
    ])
    expect(chunks[1]?.chunkText).toContain(longContent)
    expect(chunks[1]?.chunkText).not.toContain("before")
    expect(chunks[1]?.chunkText).not.toContain("after")
  })

  it("splits a very long single message into bounded chunk texts", () => {
    // Given：真实历史里可能包含一次性粘贴的大段日志或文件内容
    const service = new ChunkerService()
    const longContent = `${"x".repeat(3_199)}🦊${"y".repeat(3_199)}🦊tail`
    const messages = [message(0, "assistant", longContent)]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：单条超长消息被拆成多个可向量化片段，并保留顺序标记
    expect(chunks).toHaveLength(3)
    expect(chunkSpans(chunks)).toEqual([
      { start: 0, end: 0 },
      { start: 0, end: 0 },
      { start: 0, end: 0 },
    ])
    expect(chunks[0]?.chunkText).toContain("Part: 1/3")
    expect(chunks[1]?.chunkText).toContain("Part: 2/3")
    expect(chunks[2]?.chunkText).toContain("Part: 3/3")
    expect(chunks.some((chunk) => hasLoneSurrogate(chunk.chunkText))).toBe(false)
    expect(Math.max(...chunks.map((chunk) => chunk.chunkText.length))).toBeLessThan(3_400)
  })

  it("prefers line boundaries when splitting long line-oriented content", () => {
    // Given：长配置、日志摘录等内容通常天然按行组织
    const service = new ChunkerService()
    const line = `${"x".repeat(399)}\n`
    const messages = [message(0, "assistant", line.repeat(20))]

    // When：对长文本执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：切分优先保持完整行，不把行切到两个 chunk 中间
    expect(chunks).toHaveLength(3)
    expect(chunks[0]?.chunkText).toContain("Part: 1/3")
    expect(chunks[1]?.chunkText).toContain("Part: 2/3")
    expect(chunks[2]?.chunkText).toContain("Part: 3/3")
    expect(
      chunks.every((chunk) => chunk.chunkText.endsWith("\n") || chunk.chunkText.endsWith("x")),
    ).toBe(true)
    expect(chunks.some((chunk) => hasLoneSurrogate(chunk.chunkText))).toBe(false)
  })

  it("avoids creating a tiny trailing long-message part", () => {
    // Given：尾部只剩很短内容时，单独建 chunk 会降低检索密度
    const service = new ChunkerService()
    const messages = [message(0, "assistant", `${"a".repeat(3_200)}short tail`)]

    // When：对长消息执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：短尾巴不会单独成为一个几乎无信息量的 chunk
    expect(chunks).toHaveLength(2)
    expect(chunks[1]?.chunkText).toContain("short tail")
    expect(chunks[1]?.chunkText.length).toBeGreaterThan(600)
  })

  it("skips messages whose content is empty after trimming", () => {
    // Given：会话里包含空内容和纯空白内容
    const service = new ChunkerService()
    const messages = [
      message(0, "user", ""),
      message(1, "assistant", " \n\t "),
      message(2, "user", "kept"),
    ]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：只保留非空消息
    expect(chunkSpans(chunks)).toEqual([{ start: 2, end: 2 }])
    expect(chunks[0]?.chunkText).toContain("User: kept")
    expect(chunks[0]?.chunkText).not.toContain("Assistant:")
  })

  it("skips tool result messages when building searchable chunks", () => {
    // Given：assistant 里保留工具调用描述，tool 消息包含工具返回输出
    const service = new ChunkerService()
    const messages = [
      message(0, "user", "需要读取配置"),
      message(1, "assistant", "调用 shell 读取 config.json"),
      message(2, "tool", "secret tool output should not be searchable"),
      message(3, "assistant", "配置里启用了 mcp servers"),
    ]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：工具返回不进入搜索文本，但 assistant 的工具调用描述仍保留
    expect(chunkSpans(chunks)).toEqual([{ start: 0, end: 3 }])
    expect(chunks[0]?.chunkText).toContain("调用 shell 读取 config.json")
    expect(chunks[0]?.chunkText).toContain("配置里启用了 mcp servers")
    expect(chunks[0]?.chunkText).not.toContain("Tool:")
    expect(chunks[0]?.chunkText).not.toContain("secret tool output")
  })

  it("prefers a user message as the next chunk start when overlap starts at assistant", () => {
    // Given：重叠起点是 assistant，下一条是 user
    const service = new ChunkerService()
    const messages = [
      message(0, "user"),
      message(1, "assistant"),
      message(2, "assistant"),
      message(3, "assistant"),
      message(4, "assistant"),
      message(5, "assistant"),
      message(6, "assistant"),
      message(7, "user"),
      message(8, "assistant"),
      message(9, "assistant"),
      message(10, "assistant"),
      message(11, "assistant"),
      message(12, "assistant"),
      message(13, "assistant"),
      message(14, "assistant"),
      message(15, "user"),
      message(16, "assistant"),
      message(17, "assistant"),
    ]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：第二个 chunk 从 user 消息开始
    expect(chunkSpans(chunks)).toEqual([
      { start: 0, end: 15 },
      { start: 15, end: 17 },
    ])
  })

  it("uses the missing cwd label in the header when cwd is null", () => {
    // Given：解析结果没有记录 cwd
    const service = new ChunkerService()

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session([message(0, "user")], null))

    // Then：header 使用中文缺省值，结构化 cwd 仍保持 null
    expect(chunks[0]?.cwd).toBeNull()
    expect(chunks[0]?.chunkText).toContain("CWD: 未记录")
  })
})

const SOURCE = {
  id: 1n,
  name: "Codex",
  sourcePreset: "codex",
  parserType: "generic-jsonl",
  readerType: "file-glob",
  rootPath: "/logs",
  fileGlob: "*.jsonl",
  resumeTemplate: "codex resume {quoted threadId}",
} satisfies SourceConfig

function message(
  sequence: number,
  role: AgentRole,
  content = `message ${sequence}`,
): ParsedMessage {
  return {
    role,
    content,
    model: null,
    sequence,
    createdAt: null,
  }
}

function session(
  messages: readonly ParsedMessage[],
  cwd: string | null = "/workspace",
): ParsedSession {
  return {
    parserType: "generic-jsonl",
    sourcePath: "/logs/session.jsonl",
    threadId: "thread-1",
    cwd,
    title: "Thread",
    model: "model",
    startedAt: null,
    updatedAt: null,
    messages,
  }
}

function chunkSpans(
  chunks: readonly ChunkDraft[],
): readonly { readonly start: number; readonly end: number }[] {
  return chunks.map((chunk) => ({
    start: chunk.startMessageSeq,
    end: chunk.endMessageSeq,
  }))
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true
      }
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}
