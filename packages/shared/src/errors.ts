import { z } from "zod"

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
})

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>
