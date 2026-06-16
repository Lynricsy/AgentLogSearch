import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common"

type ValidationIssue = {
  readonly path: readonly PropertyKey[]
  readonly message: string
}

type SafeParseResult<T> =
  | {
      readonly success: true
      readonly data: T
    }
  | {
      readonly success: false
      readonly error: {
        readonly issues: readonly ValidationIssue[]
      }
    }

type BoundarySchema<T> = {
  readonly safeParse: (value: unknown) => SafeParseResult<T>
}

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  public constructor(private readonly schema: BoundarySchema<T>) {}

  public transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (result.success) {
      return result.data
    }

    throw new BadRequestException({
      error: {
        code: "validation_error",
        message: "Request body failed validation",
        details: {
          issues: result.error.issues.map((issue) => ({
            path: issue.path.map((segment) => segment.toString()).join("."),
            message: issue.message,
          })),
        },
      },
    })
  }
}
