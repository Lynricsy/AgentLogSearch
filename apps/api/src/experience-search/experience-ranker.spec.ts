import { rankExperiences } from "./experience-ranker.js"
import { extractExperienceQueryFeatures } from "./query-feature-extractor.js"

describe("experience search ranking", () => {
  it("extracts code and path focused lexical features", () => {
    const features = extractExperienceQueryFeatures({
      query: "TS2339 apps/api/src/foo.ts vitest",
      files: ["apps/api/src/foo.ts"],
    })

    expect(features.errorCodes).toContain("TS2339")
    expect(features.pathTokens).toEqual(
      expect.arrayContaining(["apps/api/src/foo.ts", "foo.ts", "src/foo.ts"]),
    )
    expect(features.commandFamilies).toContain("test")
    expect(features.lexicalText).toContain("TS2339")
  })

  it("turns fuzzy Prisma and scanner text into structured search signals", () => {
    const features = extractExperienceQueryFeatures({
      query: "Invalid historyFile.findUnique invocation scanner unknown data source Prisma",
    })

    expect(features.pathTokens).toEqual(
      expect.arrayContaining(["scanner", "prisma/schema.prisma", "schema.prisma"]),
    )
    expect(features.symbolTokens).toEqual(
      expect.arrayContaining([
        "historyFile.findUnique",
        "historyFile",
        "history_File",
        "findUnique",
      ]),
    )
  })

  it("ranks by available structured and lexical signals", () => {
    const features = extractExperienceQueryFeatures({
      query: "TS2339 foo.ts test",
      files: ["apps/api/src/foo.ts"],
    })
    const ranked = rankExperiences(
      [
        {
          id: "1",
          outcome: "FAILED",
          evidenceScore: 0.9,
          searchText: "TS2339 apps/api/src/foo.ts test",
          pathTokens: ["apps/api/src/foo.ts"],
          symbolTokens: [],
          errorCodes: ["TS2339"],
          errorSignatures: [],
          commandFamilies: ["test"],
        },
        {
          id: "2",
          outcome: "SUCCEEDED",
          evidenceScore: 0.4,
          searchText: "unrelated",
          pathTokens: ["apps/api/src/bar.ts"],
          symbolTokens: [],
          errorCodes: [],
          errorSignatures: [],
          commandFamilies: [],
        },
      ],
      features,
      10,
    )

    expect(ranked[0]?.id).toBe("1")
    expect((ranked[0]?.finalScore ?? 0) > (ranked[1]?.finalScore ?? 0)).toBe(true)
    expect(ranked[0]?.matchedPaths).toContain("apps/api/src/foo.ts")
    expect(ranked[0]?.matchedErrors).toContain("TS2339")
  })

  it("prefers structured code matches over broad lexical overlap", () => {
    const features = extractExperienceQueryFeatures({
      query: "Invalid historyFile.findUnique invocation scanner unknown data source Prisma",
    })
    const ranked = rankExperiences(
      [
        {
          id: "1",
          outcome: "SUCCEEDED",
          evidenceScore: 1,
          searchText: "Invalid Prisma scanner-file-runner historyFile findUnique scan failure",
          pathTokens: ["apps/api/src/scanner/scanner-file-runner.ts", "prisma/schema.prisma"],
          symbolTokens: [],
          errorCodes: [],
          errorSignatures: [],
          commandFamilies: ["test", "typecheck", "lint"],
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        {
          id: "2",
          outcome: "PARTIAL",
          evidenceScore: 1,
          searchText: "Invalid unknown invocation data source",
          pathTokens: ["apps/web/components/session-detail-workspace.tsx"],
          symbolTokens: [],
          errorCodes: [],
          errorSignatures: [],
          commandFamilies: [],
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      features,
      10,
    )

    expect(ranked[0]?.id).toBe("1")
    expect(ranked[0]?.matchedPaths).toContain("prisma/schema.prisma")
    expect(ranked[0]?.scoreBreakdown.pathMatch).toBeGreaterThan(0.35)
    expect(ranked[1]?.scoreBreakdown.pathMatch).toBeLessThan(0.1)
  })

  it("recalls useful experience from fuzzy Chinese problem descriptions", () => {
    const features = extractExperienceQueryFeatures({
      query: "经验详情页面 API 响应不符合预期契约 是怎么回事",
    })
    const ranked = rankExperiences(
      [
        {
          id: "1",
          outcome: "SUCCEEDED",
          evidenceScore: 1,
          searchText: "修复经验详情 API 响应不符合预期契约 rawPointer schema evidence",
          title: "经验详情 rawPointer 契约不一致修复",
          taskText: "经验详情页显示 API 响应不符合预期契约",
          templateSummary: "将 rawPointer 转换为共享 schema 期望的 filePath/line/jsonPointer。",
          pathTokens: ["apps/api/src/experience-search/experience-search.service.ts"],
          symbolTokens: ["toEvidenceEventSummary", "rawPointer"],
          errorCodes: [],
          errorSignatures: [],
          commandFamilies: ["test", "typecheck"],
        },
        {
          id: "2",
          outcome: "UNKNOWN",
          evidenceScore: 1,
          searchText: "会话详情界面优化 markdown 卡片布局",
          title: "会话详情界面优化",
          taskText: "优化会话详情页面",
          templateSummary: "没有记录到修改后的验证结果。",
          pathTokens: ["apps/web/components/session-detail-workspace.tsx"],
          symbolTokens: [],
          errorCodes: [],
          errorSignatures: [],
          commandFamilies: [],
        },
      ],
      features,
      10,
    )

    expect(ranked[0]?.id).toBe("1")
    expect(ranked[0]?.scoreBreakdown.lexical).toBeGreaterThan(0.4)
  })
})
