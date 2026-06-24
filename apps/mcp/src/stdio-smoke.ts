import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

const client = new Client({
  name: "stdio-smoke-client",
  version: "0.1.0",
})
const transport = new StdioClientTransport({
  args: ["dist/main.js"],
  command: process.execPath,
  env: {
    AGENT_LOG_SEARCH_API_BASE_URL: "http://127.0.0.1:9/api",
    NODE_ENV: "test",
  },
  stderr: "pipe",
})

try {
  await client.connect(transport)
  const tools = await client.listTools()
  const names = tools.tools.map((tool) => tool.name).sort()
  const expected = ["check_failed_attempt", "get_experience_evidence", "search_engineering_history"]
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected MCP tools: ${names.join(", ")}`)
  }
  if (!tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)) {
    throw new Error("Expected every MCP tool to advertise readOnlyHint=true.")
  }
  if (!tools.tools.every((tool) => tool.annotations?.destructiveHint === false)) {
    throw new Error("Expected every MCP tool to advertise destructiveHint=false.")
  }
  await client.close()
} catch (error) {
  await client.close().catch(() => undefined)
  throw error
}
