import { parsePytestOutput } from "./pytest-output-parser.js"

describe("parsePytestOutput", () => {
  it("parses failed pytest summary lines with skipped and expected-failure counts", () => {
    const summary = parsePytestOutput({
      commandFamily: "test",
      exitCode: 1,
      normalizedCommand: "pytest tests/test_api.py",
      output: [
        "FAILED tests/test_api.py::test_login - AssertionError: expected 200",
        "ERROR tests/test_jobs.py::test_worker - RuntimeError: broken fixture",
        "================ 2 failed, 43 passed, 1 skipped, 2 xfailed, 1 xpassed, 1 error in 3.21s ================",
      ].join("\n"),
    })

    expect(summary).toMatchObject({
      failed: 4,
      failedFiles: ["tests/test_api.py", "tests/test_jobs.py"],
      failedTests: ["tests/test_api.py::test_login", "tests/test_jobs.py::test_worker"],
      framework: "pytest",
      passed: 43,
      skipped: 3,
      status: "failed",
      testCount: 50,
      todo: 0,
    })
  })

  it("marks all-passing pytest output as succeeded when exit code is zero", () => {
    const summary = parsePytestOutput({
      commandFamily: "test",
      exitCode: 0,
      normalizedCommand: "pytest",
      output: "================ 12 passed in 0.44s ================",
    })

    expect(summary).toMatchObject({
      failed: 0,
      framework: "pytest",
      passed: 12,
      status: "succeeded",
      testCount: 12,
    })
  })
})
