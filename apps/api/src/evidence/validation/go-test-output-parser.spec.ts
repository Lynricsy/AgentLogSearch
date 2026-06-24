import { parseGoTestOutput } from "./go-test-output-parser.js"

describe("parseGoTestOutput", () => {
  it("parses failed go test package and test lines", () => {
    const summary = parseGoTestOutput({
      commandFamily: "test",
      exitCode: 1,
      normalizedCommand: "go test ./...",
      output: [
        "--- FAIL: TestLogin (0.01s)",
        "    auth_test.go:12: expected 200",
        "FAIL    github.com/example/project/auth 0.123s",
        "ok      github.com/example/project/api 0.045s",
        "FAIL",
      ].join("\n"),
    })

    expect(summary).toMatchObject({
      failed: 2,
      failedFiles: ["github.com/example/project/auth"],
      failedTests: ["TestLogin"],
      framework: "go-test",
      passed: 1,
      status: "failed",
      suiteCount: 2,
      suiteFailed: 1,
      suitePassed: 1,
      testCount: 3,
    })
  })

  it("parses passing go test package lines", () => {
    const summary = parseGoTestOutput({
      commandFamily: "test",
      exitCode: 0,
      normalizedCommand: "go test ./...",
      output: [
        "ok      github.com/example/project/auth 0.123s",
        "ok      github.com/example/project/api 0.045s",
      ].join("\n"),
    })

    expect(summary).toMatchObject({
      failed: 0,
      framework: "go-test",
      passed: 2,
      status: "succeeded",
      suiteCount: 2,
      suitePassed: 2,
      testCount: 2,
    })
  })
})
