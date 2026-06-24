import type { SemanticSearchRequest, SemanticSearchResponse } from "@agent-log-search/shared"
import { Injectable } from "@nestjs/common"
import type { EmbeddingProvider } from "../embeddings/embedding-provider.js"
import { aggregateSemanticHits } from "./search-records.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { SearchSqlStore } from "./search-sql.js"

@Injectable()
export class SearchService {
  public constructor(
    private readonly provider: EmbeddingProvider,
    private readonly store: SearchSqlStore,
  ) {}

  public async semantic(input: SemanticSearchRequest): Promise<SemanticSearchResponse> {
    const queryVector = await this.provider.embed(input.query)
    const hits = await this.store.searchChunks({
      queryVector,
      topK: input.topK,
      ...(input.agentName === undefined ? {} : { agentName: input.agentName }),
      ...(input.cwdKeyword === undefined ? {} : { cwdKeyword: input.cwdKeyword }),
    })
    return aggregateSemanticHits(hits, input.sessionLimit)
  }
}
