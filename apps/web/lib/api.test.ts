// @vitest-environment node

import { describe, expect, it } from "vitest"

import { ApiClientError, createApiClient } from "./api"

describe("createApiClient", () => {
  it("uses the default API base URL when no override is provided", () => {
    const client = createApiClient({ fetcher: async () => new Response("{}") })

    expect(client.baseUrl).toBe("http://localhost:3001/api")
  })

  it("uses the configured API base URL when an override is provided", () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api/",
      fetcher: async () => new Response("{}"),
    })

    expect(client.baseUrl).toBe("http://api.test/api")
  })

  it("throws a typed API client error when the server returns an error response", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () =>
        new Response(JSON.stringify({ error: { code: "bad_request", message: "Invalid query" } }), {
          headers: { "content-type": "application/json" },
          status: 400,
        }),
    })

    await expect(
      client.searchSemantic({ query: "login", sessionLimit: 10, topK: 50 }),
    ).rejects.toMatchObject({
      code: "bad_request",
      message: "Invalid query",
      name: ApiClientError.name,
      status: 400,
    })
  })

  it("throws a typed API client error when the response contract is invalid", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () => new Response(JSON.stringify({ records: [{ score: 2 }] })),
    })

    await expect(
      client.searchSemantic({ query: "login", sessionLimit: 10, topK: 50 }),
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: "API response did not match the expected contract.",
      name: ApiClientError.name,
      status: 0,
    })
  })
})
