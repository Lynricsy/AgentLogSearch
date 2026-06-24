import type { CanonicalToolKind } from "./evidence-types.js"

const SHELL_TOOL_NAMES = new Set([
  "shell",
  "bash",
  "terminal",
  "exec_command",
  "run_command",
  "local_shell",
])

const PATCH_TOOL_NAMES = new Set(["apply_patch", "patch"])
const WRITE_TOOL_NAMES = new Set(["write_file", "create_file"])
const EDIT_TOOL_NAMES = new Set(["edit_file", "replace", "str_replace"])
const READ_TOOL_NAMES = new Set(["read_file", "read", "cat"])
const SEARCH_TOOL_NAMES = new Set(["search", "grep", "rg"])

export function classifyCanonicalTool(toolName: string | undefined): CanonicalToolKind {
  const normalized = normalizeToolName(toolName)
  if (SHELL_TOOL_NAMES.has(normalized)) return "shell"
  if (PATCH_TOOL_NAMES.has(normalized)) return "apply_patch"
  if (WRITE_TOOL_NAMES.has(normalized)) return "write_file"
  if (EDIT_TOOL_NAMES.has(normalized)) return "edit_file"
  if (READ_TOOL_NAMES.has(normalized)) return "read_file"
  if (SEARCH_TOOL_NAMES.has(normalized)) return "search"
  return "unknown"
}

function normalizeToolName(toolName: string | undefined): string {
  return toolName?.trim().toLocaleLowerCase("en-US").replaceAll("-", "_") ?? ""
}
