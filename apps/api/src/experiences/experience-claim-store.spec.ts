import { EXPERIENCE_SEARCH_DOCUMENT_VERSION } from "../pipeline-versions.js"
import { ExperienceClaimStore } from "./experience-claim-store.js"

describe("ExperienceClaimStore", () => {
  it("claims ready sessions when their search documents are stale", async () => {
    const pg = createPgFake([
      {
        id: "42",
        trace_revision: "7",
      },
    ])
    const store = new ExperienceClaimStore(pg)

    const sessions = await store.claimBatch(8)

    expect(sessions).toEqual([{ id: 42n, traceRevision: 7 }])
    expect(pg.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /CASE WHEN experience_build_status IN \('PENDING', 'FAILED'\) THEN 0 ELSE 1 END/,
      ),
      [8, "experience-v1", EXPERIENCE_SEARCH_DOCUMENT_VERSION],
    )
  })

  it("counts stale ready sessions as processable", async () => {
    const pg = createPgFake([{ count: "3" }])
    const store = new ExperienceClaimStore(pg)

    await expect(store.countProcessable()).resolves.toBe(3)
    expect(pg.query).toHaveBeenCalledWith(
      expect.stringContaining("search_document_version IS DISTINCT FROM $2"),
      ["experience-v1", EXPERIENCE_SEARCH_DOCUMENT_VERSION],
    )
  })
})

function createPgFake(rows: readonly Record<string, unknown>[]) {
  return {
    query: jest.fn(async () => ({
      rowCount: rows.length,
      rows,
    })),
  } as unknown as ConstructorParameters<typeof ExperienceClaimStore>[0] & {
    readonly query: jest.Mock
  }
}
