import { describe, expect, it } from "vitest"
import { PAGINATION_DEFAULTS, paginationQuerySchema } from "./index"

describe("paginationQuerySchema", () => {
  it("uses pagination defaults when page and pageSize are omitted", () => {
    // Given
    const payload = {}

    // When
    const result = paginationQuerySchema.parse(payload)

    // Then
    expect(result).toEqual({
      page: PAGINATION_DEFAULTS.page,
      pageSize: PAGINATION_DEFAULTS.pageSize,
    })
  })

  it("rejects invalid pagination bounds", () => {
    // Given
    const payloads: readonly unknown[] = [
      { page: 0 },
      { page: -1 },
      { pageSize: 0 },
      { pageSize: 101 },
      { page: 1.5 },
      { pageSize: 10.5 },
    ]

    // When
    const results = payloads.map((payload) => paginationQuerySchema.safeParse(payload))

    // Then
    expect(results.every((result) => !result.success)).toBe(true)
  })
})
