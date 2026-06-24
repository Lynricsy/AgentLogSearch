import {
  assertProviderDimension,
  createEmbeddingProviderFromEnv,
  DEFAULT_OLLAMA_EMBEDDING_MODEL,
  EmbeddingDimensionMismatchError,
  MockEmbeddingProvider,
  OllamaEmbeddingProvider,
  OllamaEmbeddingProviderError,
  UnknownEmbeddingProviderError,
} from "./embedding-provider.js"

describe("MockEmbeddingProvider", () => {
  it("returns a deterministic normalized 1024-dimension vector", async () => {
    // Given
    const provider = new MockEmbeddingProvider()

    // When
    const first = await provider.embed("same text")
    const second = await provider.embed("same text")

    // Then
    expect(first).toHaveLength(1024)
    expect(second).toEqual(first)
    expect(first.some((value) => value !== 0)).toBe(true)
    expect(vectorNorm(first)).toBeCloseTo(1, 5)
  })

  it("keeps lexical neighbors closer than unrelated text", async () => {
    // Given
    const provider = new MockEmbeddingProvider()

    // When
    const anchor = await provider.embed("登录接口返回 500")
    const related = await provider.embed("登录接口 500 修复")
    const unrelated = await provider.embed("数据库迁移脚本")

    // Then
    expect(dot(anchor, related)).toBeGreaterThan(dot(anchor, unrelated))
  })

  it("returns a finite unit vector for text without lexical features", async () => {
    // Given
    const provider = new MockEmbeddingProvider()

    // When
    const vector = await provider.embed("   !!!   ")

    // Then
    expect(vector).toHaveLength(1024)
    expect(vector.every(Number.isFinite)).toBe(true)
    expect(vectorNorm(vector)).toBeCloseTo(1, 5)
  })

  it("throws when provider dimension does not match the database vector size", () => {
    // Given
    const provider = { dimension: 128, embed: async () => [], model: "bad" }

    // When / Then
    expect(() => assertProviderDimension(provider)).toThrow(EmbeddingDimensionMismatchError)
  })

  it("creates the default mock provider from empty environment", () => {
    // When
    const provider = createEmbeddingProviderFromEnv({})

    // Then
    expect(provider).toBeInstanceOf(MockEmbeddingProvider)
    expect(provider.model).toBe("mock-1024")
    expect(provider.dimension).toBe(1024)
  })

  it("creates an Ollama provider from environment", () => {
    // When
    const provider = createEmbeddingProviderFromEnv({
      EMBEDDING_DIMENSION: "1024",
      EMBEDDING_MODEL: "qwen3-embedding:8b-q4_K_M",
      EMBEDDING_OLLAMA_BASE_URL: "http://ollama:11434/",
      EMBEDDING_OLLAMA_KEEP_ALIVE: "30m",
      EMBEDDING_OLLAMA_TIMEOUT_MS: "90000",
      EMBEDDING_PROVIDER: "ollama",
    })

    // Then
    expect(provider).toBeInstanceOf(OllamaEmbeddingProvider)
    expect(provider.dimension).toBe(1024)
    expect(provider.model).toBe(DEFAULT_OLLAMA_EMBEDDING_MODEL)
  })

  it("rejects unknown embedding provider names", () => {
    // When / Then
    expect(() => createEmbeddingProviderFromEnv({ EMBEDDING_PROVIDER: "unknown" })).toThrow(
      UnknownEmbeddingProviderError,
    )
  })
})

describe("OllamaEmbeddingProvider", () => {
  it("posts to the Ollama embed endpoint and reads the first embedding", async () => {
    // Given
    const requests: unknown[] = []
    const provider = new OllamaEmbeddingProvider({
      baseUrl: "http://ollama:11434/",
      dimension: 1024,
      fetcher: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)))
        return jsonResponse({ embeddings: [[0.1, 0.2, 0.3]], model: "qwen3-embedding" })
      },
      keepAlive: "30m",
      model: "qwen3-embedding:8b-q4_K_M",
      timeoutMs: 1000,
    })

    // When
    const vector = await provider.embed("登录接口 500")

    // Then
    expect(vector).toEqual([0.1, 0.2, 0.3])
    expect(requests).toEqual([
      {
        dimensions: 1024,
        input: "登录接口 500",
        keep_alive: "30m",
        model: "qwen3-embedding:8b-q4_K_M",
        truncate: true,
      },
    ])
  })

  it("wraps non-2xx Ollama responses as provider errors", async () => {
    // Given
    const provider = new OllamaEmbeddingProvider({
      baseUrl: "http://ollama:11434",
      dimension: 1024,
      fetcher: async () => jsonResponse({ error: "missing model" }, 404),
      model: "qwen3-embedding:8b-q4_K_M",
      timeoutMs: 1000,
    })

    // When / Then
    await expect(provider.embed("text")).rejects.toBeInstanceOf(OllamaEmbeddingProviderError)
  })
})

function vectorNorm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  })
}
