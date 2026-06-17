export class EmbeddingSourceNotFoundError extends Error {
  public readonly name = "EmbeddingSourceNotFoundError"

  public constructor(public readonly sourceId: bigint) {
    super(`Embedding source not found: ${sourceId.toString()}`)
  }
}

export function summarizeEmbeddingError(error: unknown): string {
  if (error instanceof Error) {
    return truncateEmbeddingError(error.message)
  }
  return truncateEmbeddingError(String(error))
}

export function truncateEmbeddingError(message: string): string {
  return message.length <= 1_000 ? message : `${message.slice(0, 997)}...`
}
