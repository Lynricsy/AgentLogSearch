import { parseCargoTestOutput } from "./cargo-test-output-parser.js"

describe("parseCargoTestOutput", () => {
  it("parses failed cargo test result summaries", () => {
    const summary = parseCargoTestOutput({
      commandFamily: "test",
      exitCode: 101,
      normalizedCommand: "cargo test",
      output: [
        "test auth::tests::login_rejects_bad_token ... FAILED",
        "",
        "failures:",
        "",
        "failures:",
        "    auth::tests::login_rejects_bad_token",
        "",
        "test result: FAILED. 9 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.42s",
      ].join("\n"),
    })

    expect(summary).toMatchObject({
      failed: 1,
      failedFiles: [],
      failedTests: ["auth::tests::login_rejects_bad_token"],
      framework: "cargo-test",
      passed: 9,
      skipped: 1,
      status: "failed",
      suiteCount: 1,
      suiteFailed: 1,
      testCount: 11,
      todo: 0,
    })
  })

  it("parses passing cargo test result summaries", () => {
    const summary = parseCargoTestOutput({
      commandFamily: "test",
      exitCode: 0,
      normalizedCommand: "cargo test",
      output:
        "test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.21s",
    })

    expect(summary).toMatchObject({
      failed: 0,
      framework: "cargo-test",
      passed: 10,
      status: "succeeded",
      suiteCount: 1,
      suitePassed: 1,
      testCount: 10,
    })
  })
})
