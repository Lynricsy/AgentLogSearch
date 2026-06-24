import {
  type ExperienceDetail,
  type ExperienceFailedAttemptCheckRequest,
  type ExperienceFailedAttemptCheckResponse,
  type ExperienceRebuildRequest,
  type ExperienceRebuildResponse,
  type ExperienceSearchRequest,
  type ExperienceSearchResponse,
  type ExperienceStatusResponse,
  experienceFailedAttemptCheckRequestSchema,
  experienceRebuildRequestSchema,
  experienceSearchRequestSchema,
} from "@agent-log-search/shared"
import { Bind, Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common"
import { ZodValidationPipe } from "../sources/zod-validation.pipe.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ExperienceSearchService } from "./experience-search.service.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { FailedAttemptSearchService } from "./failed-attempt-search.service.js"

@Controller("experiences")
export class ExperienceSearchController {
  public constructor(
    private readonly experiences: ExperienceSearchService,
    private readonly failedAttempts: FailedAttemptSearchService,
  ) {}

  @Post("search")
  @HttpCode(HttpStatus.OK)
  @Bind(Body(new ZodValidationPipe(experienceSearchRequestSchema)))
  public async search(body: ExperienceSearchRequest): Promise<ExperienceSearchResponse> {
    return this.experiences.search(body)
  }

  @Get("status")
  public async status(): Promise<ExperienceStatusResponse> {
    return this.experiences.status()
  }

  @Get(":id")
  @Bind(Param("id"))
  public async get(id: string): Promise<ExperienceDetail> {
    return this.experiences.get(id)
  }

  @Post("rebuild")
  @HttpCode(HttpStatus.OK)
  @Bind(Body(new ZodValidationPipe(experienceRebuildRequestSchema)))
  public async rebuild(body: ExperienceRebuildRequest): Promise<ExperienceRebuildResponse> {
    return this.experiences.rebuild(body)
  }

  @Post("check-failed-attempt")
  @HttpCode(HttpStatus.OK)
  @Bind(Body(new ZodValidationPipe(experienceFailedAttemptCheckRequestSchema)))
  public async checkFailedAttempt(
    body: ExperienceFailedAttemptCheckRequest,
  ): Promise<ExperienceFailedAttemptCheckResponse> {
    return this.failedAttempts.check(body)
  }

  @Post("check-attempt")
  @HttpCode(HttpStatus.OK)
  @Bind(Body(new ZodValidationPipe(experienceFailedAttemptCheckRequestSchema)))
  public async checkAttempt(
    body: ExperienceFailedAttemptCheckRequest,
  ): Promise<ExperienceFailedAttemptCheckResponse> {
    return this.failedAttempts.check(body)
  }
}
