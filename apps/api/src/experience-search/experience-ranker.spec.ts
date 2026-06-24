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
})
