import { resolve } from "node:path"

export const ENV_FILE_PATH_OVERRIDE_KEY = "AGENT_LOG_SEARCH_ENV_FILE_PATH"

export function resolveEnvFilePath(): string[] {
  const overridePath = process.env[ENV_FILE_PATH_OVERRIDE_KEY]?.trim()
  if (overridePath !== undefined && overridePath.length > 0) {
    return [overridePath]
  }
  return [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]
}
