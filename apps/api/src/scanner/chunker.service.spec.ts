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

  it("keeps two messages of overlap when a session has nine messages", () => {
    // Given：九条消息超过单 chunk 上限一条
    const service = new ChunkerService()
    const messages = Array.from({ length: 9 }, (_, index) =>
      message(index, index % 2 === 0 ? "user" : "assistant"),
    )

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：第二个 chunk 从前一个 chunk 的最后两条消息开始
    expect(chunkSpans(chunks)).toEqual([
      { start: 0, end: 7 },
      { start: 6, end: 8 },
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
    ]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：第二个 chunk 保留两条重叠消息，而不是直接从 seq8 开始
    expect(chunkSpans(chunks)).toEqual([
      { start: 0, end: 7 },
      { start: 6, end: 9 },
    ])
  })

  it("places a long message in its own chunk", () => {
    // Given：中间消息超过目标大小
    const service = new ChunkerService()
    const longContent = "x".repeat(1_201)
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
    ]

    // When：对会话执行 chunk
    const chunks = service.chunkSession(SOURCE, session(messages))

    // Then：第二个 chunk 从 user 消息开始
    expect(chunkSpans(chunks)).toEqual([
      { start: 0, end: 7 },
      { start: 7, end: 8 },
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
