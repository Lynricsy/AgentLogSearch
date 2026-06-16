import { Test } from "@nestjs/testing"
import { DatabaseModule } from "./database.module"
import { PgService } from "./pg.service"
import { PrismaService } from "./prisma.service"

describe("Database services", () => {
  it("connect and close cleanly when the database module is initialized", async () => {
    // Given
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile()

    const prismaService = moduleRef.get(PrismaService)
    const pgService = moduleRef.get(PgService)

    // When
    await prismaService.$queryRaw`SELECT 1`
    const result = await pgService.query<{ readonly ok: number }>("SELECT 1::int AS ok")
    await moduleRef.close()

    // Then
    expect(result.rows).toEqual([{ ok: 1 }])
  })
})
