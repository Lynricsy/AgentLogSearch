import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { MockEmbeddingProvider } from "./embedding-provider.js"
import { EmbeddingSqlStore } from "./embedding-sql.js"
import { EmbeddingsController } from "./embeddings.controller.js"
import { EmbeddingsService } from "./embeddings.service.js"

@Module({
  controllers: [EmbeddingsController],
  imports: [DatabaseModule],
  providers: [EmbeddingSqlStore, EmbeddingsService, MockEmbeddingProvider],
})
export class EmbeddingsModule {}
