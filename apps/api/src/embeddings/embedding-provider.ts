import { createHash } from "node:crypto"

export const EMBEDDING_DIMENSION = 1024
export const MOCK_EMBEDDING_MODEL = "mock-1024"
export const DEFAULT_OLLAMA_EMBEDDING_MODEL = "qwen3-embedding:8b-q4_K_M"
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"

export type EmbeddingVector = readonly number[]

export interface EmbeddingProvider {
  readonly model: string
  readonly dimension: number
  embed(text: string): Promise<EmbeddingVector>
}

export abstract class EmbeddingProviderContract implements EmbeddingProvider {
  public abstract readonly model: string
  public abstract readonly dimension: number
  public abstract embed(text: string): Promise<EmbeddingVector>
}

export class EmbeddingDimensionMismatchError extends Error {
  public readonly name = "EmbeddingDimensionMismatchError"

  public constructor(
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(`Embedding provider dimension mismatch: expected ${expected}, got ${actual}`)
  }
}

export class DatabaseEmbeddingDimensionMismatchError extends Error {
  public readonly name = "DatabaseEmbeddingDimensionMismatchError"

  public constructor(
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(`DB embedding dimension mismatch: expected ${expected}, got ${actual}`)
  }
}

export class MockEmbeddingProvider extends EmbeddingProviderContract {
  public readonly model = MOCK_EMBEDDING_MODEL
  public readonly dimension = EMBEDDING_DIMENSION

  public async embed(text: string): Promise<EmbeddingVector> {
    const values = Array.from({ length: this.dimension }, () => 0)
    for (const feature of tokenizeFeatures(text)) {
      const index = featureIndex(feature, this.dimension)
      values[index] = (values[index] ?? 0) + featureSign(feature)
    }
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
    if (norm === 0) {
      values[0] = 1
      return values
    }
    return values.map((value) => roundVectorValue(value / norm))
  }
}

type OllamaEmbedResponse = {
  readonly model?: unknown
  readonly embeddings?: unknown
}

type OllamaEmbeddingProviderOptions = {
  readonly baseUrl: string
  readonly dimension: number
  readonly fetcher?: typeof fetch
  readonly keepAlive?: string
  readonly model: string
  readonly timeoutMs: number
}

export class OllamaEmbeddingProvider extends EmbeddingProviderContract {
  public readonly baseUrl: string
  public readonly dimension: number
  public readonly keepAlive: string | undefined
  public readonly model: string
  public readonly timeoutMs: number

  private readonly fetcher: typeof fetch

  public constructor({
    baseUrl,
    dimension,
    fetcher = fetch,
    keepAlive,
    model,
    timeoutMs,
  }: OllamaEmbeddingProviderOptions) {
    super()
    this.baseUrl = trimTrailingSlash(baseUrl)
    this.dimension = dimension
    this.fetcher = fetcher
    this.keepAlive = keepAlive
    this.model = model
    this.timeoutMs = timeoutMs
  }

  public async embed(text: string): Promise<EmbeddingVector> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetcher(`${this.baseUrl}/api/embed`, {
        body: JSON.stringify({
          dimensions: this.dimension,
          input: text,
          keep_alive: this.keepAlive,
          model: this.model,
          truncate: true,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new OllamaEmbeddingProviderError(
          `Ollama embedding request failed with HTTP ${response.status}`,
        )
      }
      return readOllamaEmbedding(await response.json())
    } catch (error) {
      if (error instanceof OllamaEmbeddingProviderError) {
        throw error
      }
      throw new OllamaEmbeddingProviderError(summarizeOllamaError(error))
    } finally {
      clearTimeout(timeout)
    }
  }
}

export class OllamaEmbeddingProviderError extends Error {
  public readonly name = "OllamaEmbeddingProviderError"
}

export class UnknownEmbeddingProviderError extends Error {
  public readonly name = "UnknownEmbeddingProviderError"

  public constructor(public readonly provider: string) {
    super(`Unknown embedding provider: ${provider}`)
  }
}

export function createEmbeddingProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingProvider {
  const provider = normalizeProviderName(readEnv(env, "EMBEDDING_PROVIDER"))
  if (provider === "mock") {
    return new MockEmbeddingProvider()
  }
  if (provider === "ollama") {
    const keepAlive = readOptionalStringEnv(readEnv(env, "EMBEDDING_OLLAMA_KEEP_ALIVE"))
    const options = {
      baseUrl: readStringEnv(readEnv(env, "EMBEDDING_OLLAMA_BASE_URL"), DEFAULT_OLLAMA_BASE_URL),
      dimension: readIntegerEnv(readEnv(env, "EMBEDDING_DIMENSION"), EMBEDDING_DIMENSION),
      model: readStringEnv(readEnv(env, "EMBEDDING_MODEL"), DEFAULT_OLLAMA_EMBEDDING_MODEL),
      timeoutMs: readIntegerEnv(readEnv(env, "EMBEDDING_OLLAMA_TIMEOUT_MS"), 120_000),
      ...(keepAlive === undefined ? {} : { keepAlive }),
    }
    return new OllamaEmbeddingProvider(options)
  }
  throw new UnknownEmbeddingProviderError(provider)
}

export function assertProviderDimension(provider: EmbeddingProvider): void {
  assertEmbeddingDimension(provider.dimension)
}

export function assertEmbeddingDimension(actual: number): void {
  if (actual !== EMBEDDING_DIMENSION) {
    throw new EmbeddingDimensionMismatchError(EMBEDDING_DIMENSION, actual)
  }
}

function tokenizeFeatures(text: string): readonly string[] {
  const normalized = text.toLocaleLowerCase("zh-CN")
  const words = normalized.match(/[\p{Letter}\p{Number}]+/gu) ?? []
  return [...words, ...characterNgrams(normalized, 2), ...characterNgrams(normalized, 3)]
}

function characterNgrams(text: string, size: number): readonly string[] {
  const chars = [...text.replace(/[^\p{Letter}\p{Number}]+/gu, "")]
  const grams: string[] = []
  for (let index = 0; index + size <= chars.length; index += 1) {
    grams.push(chars.slice(index, index + size).join(""))
  }
  return grams
}

function featureIndex(feature: string, dimension: number): number {
  const digest = createHash("sha256").update(feature).digest()
  return digest.readUInt32BE(0) % dimension
}

function featureSign(feature: string): number {
  const digest = createHash("sha256").update("sign:").update(feature).digest()
  const raw = digest.readUInt32BE(0) / 0xffff_ffff
  return raw < 0.5 ? -1 : 1
}

function roundVectorValue(value: number): number {
  return Number(value.toFixed(8))
}

function normalizeProviderName(value: string | undefined): string {
  const provider = value?.trim().toLocaleLowerCase("en-US")
  if (provider === undefined || provider === "" || provider === "mock-1024") {
    return "mock"
  }
  return provider
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key]
}

function readStringEnv(value: string | undefined, fallback: string): string {
  const normalized = value?.trim()
  return normalized === undefined || normalized === "" ? fallback : normalized
}

function readOptionalStringEnv(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === undefined || normalized === "" ? undefined : normalized
}

function readIntegerEnv(value: string | undefined, fallback: number): number {
  const normalized = value?.trim()
  if (normalized === undefined || normalized === "") {
    return fallback
  }
  const parsed = Number.parseInt(normalized, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function readOllamaEmbedding(value: unknown): EmbeddingVector {
  if (!isOllamaEmbedResponse(value) || !Array.isArray(value.embeddings)) {
    throw new OllamaEmbeddingProviderError("Ollama embedding response did not include embeddings")
  }
  const [embedding] = value.embeddings
  if (!Array.isArray(embedding) || !embedding.every((item) => typeof item === "number")) {
    throw new OllamaEmbeddingProviderError("Ollama embedding response had an invalid vector")
  }
  return embedding
}

function isOllamaEmbedResponse(value: unknown): value is OllamaEmbedResponse {
  return typeof value === "object" && value !== null
}

function summarizeOllamaError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Ollama embedding request failed"
}
