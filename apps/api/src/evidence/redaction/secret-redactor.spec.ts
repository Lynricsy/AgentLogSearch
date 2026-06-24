import { SecretRedactor } from "./secret-redactor.js"

describe("SecretRedactor", () => {
  const redactor = new SecretRedactor()

  it.each([
    ["private-key", "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"],
    ["url-credentials", "https://user:pass@example.com/repo.git"],
    ["authorization", "Authorization: Bearer abc.def.ghi"],
    ["github-token", "ghp_1234567890abcdefghijklmnop"],
    ["github-pat", "github_pat_1234567890abcdefghijklmnop"],
    ["aws-access-key", "AKIA1234567890ABCDEF"],
    ["env-secret", "SECRET_TOKEN_SHOULD_NOT_BE_PERSISTED=super-secret-value"],
    ["json-secret", '{"apiKey":"super-secret-value"}'],
  ])("redacts %s", (_type, value) => {
    const result = redactor.redact(value)

    expect(result.text).toContain("<redacted:")
    expect(result.text).not.toContain("super-secret-value")
    expect(result.text).not.toContain("abc.def.ghi")
  })

  it("redacts nested structured secret fields", () => {
    expect(
      redactor.redactUnknown({
        ok: "visible",
        nested: { token: "super-secret-value" },
      }),
    ).toEqual({
      ok: "visible",
      nested: { token: "<redacted:json-secret>" },
    })
  })
})
