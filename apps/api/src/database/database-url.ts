export const DEFAULT_DATABASE_URL =
  "postgresql://agent_log_search:agent_log_search@localhost:5432/agent_log_search"

export function getDatabaseUrl(): string {
  const { DATABASE_URL } = process.env
  return DATABASE_URL ?? DEFAULT_DATABASE_URL
}
