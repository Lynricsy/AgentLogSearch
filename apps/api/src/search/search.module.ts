import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { MockEmbeddingProvider } from "../embeddings/embedding-provider.js"
import { SearchController } from "./search.controller.js"
import { SearchService } from "./search.service.js"
import { SearchSqlStore } from "./search-sql.js"

@Module({
  controllers: [SearchController],
  imports: [DatabaseModule],
  providers: [MockEmbeddingProvider, SearchService, SearchSqlStore],
})
export class SearchModule {}
