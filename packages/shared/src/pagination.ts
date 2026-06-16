import { z } from "zod"

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
} as const

export const paginationQuerySchema = z.object({
  page: z.number().int().min(1).default(PAGINATION_DEFAULTS.page),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(PAGINATION_DEFAULTS.maxPageSize)
    .default(PAGINATION_DEFAULTS.pageSize),
})

export const paginationQueryStringSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION_DEFAULTS.page),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION_DEFAULTS.maxPageSize)
    .default(PAGINATION_DEFAULTS.pageSize),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export const paginatedResponseSchema = <ItemSchema extends z.ZodType>(itemSchema: ItemSchema) =>
  z.object({
    items: z.array(itemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(PAGINATION_DEFAULTS.maxPageSize),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })

export type PaginatedResponse<Item> = {
  readonly items: readonly Item[]
  readonly page: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
}
