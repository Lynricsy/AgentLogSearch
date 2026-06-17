import {
  assertProviderDimension,
  EmbeddingDimensionMismatchError,
  MockEmbeddingProvider,
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
})

function vectorNorm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)
}
