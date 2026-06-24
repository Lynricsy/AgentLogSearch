import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { PrismaService } from "../database/prisma.service.js"
import { createEmbeddingProviderFromEnv } from "./embedding-provider.js"
import { EmbeddingSqlStore } from "./embedding-sql.js"
import { EmbeddingWorker, readEmbeddingWorkerConfig } from "./embedding-worker.js"
import { EmbeddingsController } from "./embeddings.controller.js"
import { EmbeddingsService } from "./embeddings.service.js"

@Module({
  controllers: [EmbeddingsController],
  imports: [DatabaseModule],
  providers: [
    EmbeddingSqlStore,
    {
      provide: EmbeddingsService,
      useFactory: (prisma: PrismaService, store: EmbeddingSqlStore) =>
        new EmbeddingsService(prisma, store, createEmbeddingProviderFromEnv()),
      inject: [PrismaService, EmbeddingSqlStore],
    },
    {
      provide: EmbeddingWorker,
      useFactory: (embeddings: EmbeddingsService, store: EmbeddingSqlStore) =>
        new EmbeddingWorker(embeddings, store, readEmbeddingWorkerConfig()),
      inject: [EmbeddingsService, EmbeddingSqlStore],
    },
  ],
})
export class EmbeddingsModule {}
