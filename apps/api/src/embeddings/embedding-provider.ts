import { createHash } from "node:crypto"

export const EMBEDDING_DIMENSION = 1024
export const MOCK_EMBEDDING_MODEL = "mock-1024"

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
