import { createServer, type Server } from "node:http"
import request from "supertest"
import { createMcpHttpHandler, MCP_PATH } from "../src/mcp-http"

const MCP_PROTOCOL_VERSION = "2025-11-25"

describe("Streamable HTTP MCP endpoint", () => {
  let server: Server

  beforeAll(() => {
    const mcpHandler = createMcpHttpHandler({
      apiBaseUrl: "http://127.0.0.1:9/api",
    })

    server = createServer(async (nodeRequest, nodeResponse) => {
      if (nodeRequest.url?.startsWith(MCP_PATH)) {
        await mcpHandler(nodeRequest, nodeResponse)
        return
      }

      nodeResponse.statusCode = 404
      nodeResponse.end()
    })
  })

  it("serves the MCP tools through /mcp without an /api prefix", async () => {
    const initializeResponse = await request(server)
      .post("/mcp")
      .set("accept", "application/json, text/event-stream")
      .set("content-type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "api-mcp-e2e",
            version: "0.1.0",
          },
        },
      })

    expect(initializeResponse.status).toBe(200)
    expect(initializeResponse.body).toEqual(
      expect.objectContaining({
        jsonrpc: "2.0",
        id: 1,
        result: expect.objectContaining({
          serverInfo: expect.objectContaining({
            name: "agent-log-search",
          }),
        }),
      }),
    )

    const sessionId = initializeResponse.headers["mcp-session-id"]
    expect(typeof sessionId).toBe("string")

    const initializedResponse = await request(server)
      .post("/mcp")
      .set("accept", "application/json, text/event-stream")
      .set("content-type", "application/json")
      .set("mcp-protocol-version", MCP_PROTOCOL_VERSION)
      .set("mcp-session-id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      })

    expect([200, 202]).toContain(initializedResponse.status)

    const toolsResponse = await request(server)
      .post("/mcp")
      .set("accept", "application/json, text/event-stream")
      .set("content-type", "application/json")
      .set("mcp-protocol-version", MCP_PROTOCOL_VERSION)
      .set("mcp-session-id", sessionId)
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      })

    expect(toolsResponse.status).toBe(200)
    expect(toolsResponse.body.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "search_engineering_history" }),
        expect.objectContaining({ name: "check_failed_attempt" }),
        expect.objectContaining({ name: "get_experience_evidence" }),
      ]),
    )

    await request(server)
      .delete("/mcp")
      .set("mcp-protocol-version", MCP_PROTOCOL_VERSION)
      .set("mcp-session-id", sessionId)
  })

  it("keeps /api/mcp unavailable so clients use the transport endpoint", async () => {
    const response = await request(server).post("/api/mcp").send({})

    expect(response.status).toBe(404)
  })
})
