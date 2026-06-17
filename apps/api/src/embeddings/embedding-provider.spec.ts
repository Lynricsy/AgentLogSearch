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
