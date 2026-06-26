declare namespace NodeJS {
  interface ProcessEnv {
    readonly AGENT_LOG_SEARCH_API_BASE_URL?: string
    readonly AGENT_LOG_SEARCH_API_URL?: string
    readonly AGENT_LOG_SEARCH_MCP_API_BASE_URL?: string
    readonly API_PORT?: string
  }
}
