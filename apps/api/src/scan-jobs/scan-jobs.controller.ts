import {
  type PaginationQuery,
  paginationQueryStringSchema,
  type ScanJobsResponse,
} from "@agent-log-search/shared"
import { Bind, Controller, Get, Query } from "@nestjs/common"
import { ZodValidationPipe } from "../sources/zod-validation.pipe.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ScanJobsService } from "./scan-jobs.service.js"

@Controller("scan-jobs")
export class ScanJobsController {
  public constructor(private readonly scanJobs: ScanJobsService) {}

  @Get()
  @Bind(Query(new ZodValidationPipe(paginationQueryStringSchema)))
  public async list(query: PaginationQuery): Promise<ScanJobsResponse> {
    return this.scanJobs.list(query)
  }
}
