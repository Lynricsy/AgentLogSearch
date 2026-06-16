import {
  type AgentSource,
  type CreateSourceRequest,
  createSourceRequestSchema,
  type SourcePresetMetadata,
  type UpdateSourceRequest,
  updateSourceRequestSchema,
} from "@agent-log-search/shared"
import { Bind, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { SourcesService } from "./sources.service.js"
import { ZodValidationPipe } from "./zod-validation.pipe.js"

@Controller("sources")
export class SourcesController {
  public constructor(private readonly sources: SourcesService) {}

  @Get()
  public async list(): Promise<readonly AgentSource[]> {
    return this.sources.list()
  }

  @Get("presets")
  public listPresets(): readonly SourcePresetMetadata[] {
    return this.sources.listPresets()
  }

  @Post()
  @Bind(Body(new ZodValidationPipe(createSourceRequestSchema)))
  public async create(body: CreateSourceRequest): Promise<AgentSource> {
    return this.sources.create(body)
  }

  @Patch(":id")
  @Bind(Param("id"), Body(new ZodValidationPipe(updateSourceRequestSchema)))
  public async update(id: string, body: UpdateSourceRequest): Promise<AgentSource> {
    return this.sources.update(id, body)
  }

  @Delete(":id")
  @HttpCode(204)
  @Bind(Param("id"))
  public async delete(id: string): Promise<void> {
    await this.sources.delete(id)
  }
}
