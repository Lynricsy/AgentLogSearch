import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { createEmbeddingProviderFromEnv } from "../embeddings/embedding-provider.js"
import { SearchController } from "./search.controller.js"
import { SearchService } from "./search.service.js"
import { SearchSqlStore } from "./search-sql.js"

@Module({
  controllers: [SearchController],
  imports: [DatabaseModule],
  providers: [
    SearchSqlStore,
    {
      provide: SearchService,
      useFactory: (store: SearchSqlStore) =>
        new SearchService(createEmbeddingProviderFromEnv(), store),
      inject: [SearchSqlStore],
    },
  ],
})
export class SearchModule {}
