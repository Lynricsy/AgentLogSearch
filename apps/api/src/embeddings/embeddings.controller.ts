import { Bind, Body, Controller, Post } from "@nestjs/common"
import { ZodValidationPipe } from "../sources/zod-validation.pipe.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { EmbeddingsService } from "./embeddings.service.js"

type EmbeddingJobRequest = {
  readonly sourceId?: string
}

type RequestValidationIssue = {
  readonly path: readonly string[]
  readonly message: string
}

type RequestParseResult =
  | {
      readonly success: true
      readonly data: EmbeddingJobRequest
    }
  | {
      readonly success: false
      readonly error: {
        readonly issues: readonly RequestValidationIssue[]
      }
    }

type RequestSchema = {
  readonly safeParse: (value: unknown) => RequestParseResult
}

const embeddingJobRequestSchema: RequestSchema = {
  safeParse(value: unknown): RequestParseResult {
    if (value === undefined || value === null) {
      return { success: true, data: {} }
    }
    if (!isEmbeddingRequestLike(value)) {
      return validationFailure("body", "Expected object body")
    }
    const { sourceId } = value
    if (sourceId === undefined) {
      return { success: true, data: {} }
    }
    if (typeof sourceId === "string" && /^\d+$/.test(sourceId)) {
      return { success: true, data: { sourceId } }
    }
    return validationFailure("sourceId", "sourceId must be an unsigned integer string")
  },
}

@Controller("embeddings")
export class EmbeddingsController {
  public constructor(private readonly embeddings: EmbeddingsService) {}

  @Post("process")
  @Bind(Body(new ZodValidationPipe(embeddingJobRequestSchema)))
  public async process(body: EmbeddingJobRequest) {
    return this.embeddings.process(readSourceId(body))
  }

  @Post("rebuild")
  @Bind(Body(new ZodValidationPipe(embeddingJobRequestSchema)))
  public async rebuild(body: EmbeddingJobRequest) {
    return this.embeddings.rebuild(readSourceId(body))
  }
}

function readSourceId(body: EmbeddingJobRequest): bigint | null {
  return body.sourceId === undefined ? null : BigInt(body.sourceId)
}

function isEmbeddingRequestLike(value: unknown): value is { readonly sourceId?: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validationFailure(path: string, message: string): RequestParseResult {
  return {
    success: false,
    error: {
      issues: [{ path: [path], message }],
    },
  }
}
