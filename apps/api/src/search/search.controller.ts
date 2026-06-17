import {
  type SemanticSearchRequest,
  type SemanticSearchResponse,
  semanticSearchRequestSchema,
} from "@agent-log-search/shared"
import { Bind, Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ZodValidationPipe } from "../sources/zod-validation.pipe.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { SearchService } from "./search.service.js"

@Controller("search")
export class SearchController {
  public constructor(private readonly search: SearchService) {}

  @Post("semantic")
  @HttpCode(HttpStatus.OK)
  @Bind(Body(new ZodValidationPipe(semanticSearchRequestSchema)))
  public async semantic(body: SemanticSearchRequest): Promise<SemanticSearchResponse> {
    return this.search.semantic(body)
  }
}
