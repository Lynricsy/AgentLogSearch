import { readFileSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { extname, relative, resolve, sep } from "node:path"
import { DatabaseSync } from "node:sqlite"

type JsonRecord = Readonly<Record<string, unknown>>

type InventoryAccumulator = {
  readonly callIdFields: Set<string>
  readonly contentBlockTypeCounts: Map<string, number>
  readonly files: Set<string>
  readonly opencodeTables: Map<string, readonly string[]>
  readonly opencodePartTypeCounts: Map<string, number>
  readonly parserType: string
  readonly patchFields: Set<string>
  readonly payloadTypeCounts: Map<string, number>
  readonly possibleExitCodeFields: Set<string>
  readonly recordTypeCounts: Map<string, number>
  readonly resultIdFields: Set<string>
  readonly shellCommandFields: Set<string>
  readonly topLevelKeys: Set<string>
  readonly toolCallTypes: Set<string>
  readonly toolResultTypes: Set<string>
}

export type FixtureShapeInventoryEntry = {
  readonly parserType: string
  readonly files: readonly string[]
  readonly recordTypeCounts: Readonly<Record<string, number>>
  readonly topLevelKeys: readonly string[]
  readonly payloadTypeCounts: Readonly<Record<string, number>>
  readonly contentBlockTypeCounts: Readonly<Record<string, number>>
  readonly callIdFields: readonly string[]
  readonly resultIdFields: readonly string[]
  readonly possibleExitCodeFields: readonly string[]
  readonly shellCommandFields: readonly string[]
  readonly patchFields: readonly string[]
  readonly toolCallTypes: readonly string[]
  readonly toolResultTypes: readonly string[]
  readonly opencodeTables?: Readonly<Record<string, readonly string[]>>
  readonly opencodePartTypeCounts?: Readonly<Record<string, number>>
}

export type FixtureShapeInventory = {
  readonly sampleRoot: string
  readonly fixtures: readonly FixtureShapeInventoryEntry[]
  readonly observations: {
    readonly codexToolCallTypes: readonly string[]
    readonly codexToolResultTypes: readonly string[]
    readonly claudeContentBlockTypes: readonly string[]
    readonly stableCallIdFields: readonly string[]
    readonly resultIdFields: readonly string[]
    readonly shellCommandFields: readonly string[]
    readonly possibleExitCodeFields: readonly string[]
    readonly patchFields: readonly string[]
    readonly opencodeTableNames: readonly string[]
    readonly opencodePartTypes: readonly string[]
  }
}

export async function inspectAgentFixtures(sampleRoot: string): Promise<FixtureShapeInventory> {
  const rootPath = resolve(sampleRoot)
  const files = await listFiles(rootPath)
  const accumulators = new Map<string, InventoryAccumulator>()

  for (const filePath of files) {
    const relativePath = normalizePath(relative(rootPath, filePath))
    const parserType = parserTypeForFixture(relativePath)
    if (parserType === null) {
      continue
    }
    const accumulator = getAccumulator(accumulators, parserType)
    accumulator.files.add(relativePath)
    if (parserType === "opencode-sqlite") {
      inspectOpenCodeSqlite(filePath, accumulator)
      continue
    }
    if (filePath.endsWith(".jsonl")) {
      inspectJsonlFixture(filePath, accumulator)
      continue
    }
    if (filePath.endsWith(".json")) {
      inspectJsonFixture(filePath, accumulator)
    }
  }

  const fixtures = Array.from(accumulators.values())
    .sort((left, right) => left.parserType.localeCompare(right.parserType))
    .map(toInventoryEntry)

  return {
    sampleRoot: normalizePath(relative(process.cwd(), rootPath) || "."),
    fixtures,
    observations: buildObservations(fixtures),
  }
}

async function listFiles(rootPath: string): Promise<readonly string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(rootPath, entry.name)
      if (entry.isDirectory()) {
        return listFiles(path)
      }
      return [path]
    }),
  )
  return nested.flat().sort((left, right) => left.localeCompare(right))
}

function parserTypeForFixture(relativePath: string): string | null {
  const extension = extname(relativePath)
  if (relativePath.startsWith("codex/") && extension === ".jsonl") {
    return "codex-jsonl"
  }
  if (relativePath.startsWith("claude/") && extension === ".jsonl") {
    return "claude-jsonl"
  }
  if (relativePath.startsWith("pi-agent/") && extension === ".jsonl") {
    return "pi-jsonl"
  }
  if (relativePath.startsWith("opencode/") && extension === ".db") {
    return "opencode-sqlite"
  }
  if (relativePath.startsWith("generic/") && extension === ".jsonl") {
    return "generic-jsonl"
  }
  if (relativePath.startsWith("generic/") && extension === ".json") {
    return "generic-json"
  }
  if (relativePath.startsWith("generic/") && extension === ".md") {
    return "generic-markdown"
  }
  if (relativePath.startsWith("demo-agent/") && extension === ".jsonl") {
    return "generic-jsonl"
  }
  return null
}

function inspectJsonlFixture(filePath: string, accumulator: InventoryAccumulator): void {
  const content = readTextFixture(filePath)
  for (const line of content.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue
    }
    inspectRecord(parseJsonRecord(line, filePath), accumulator)
  }
}

function inspectJsonFixture(filePath: string, accumulator: InventoryAccumulator): void {
  inspectRecord(parseJsonRecord(readTextFixture(filePath), filePath), accumulator)
}

function inspectRecord(record: JsonRecord, accumulator: InventoryAccumulator): void {
  for (const key of Object.keys(record)) {
    accumulator.topLevelKeys.add(key)
  }

  const recordType = readString(record, "type") ?? readString(record, "event")
  if (recordType !== null) {
    increment(accumulator.recordTypeCounts, recordType)
  }

  const payload = readRecord(record, "payload")
  const payloadType = payload === null ? null : readString(payload, "type")
  if (payloadType !== null) {
    increment(accumulator.payloadTypeCounts, payloadType)
  }

  inspectValue(record, "", accumulator)
}

function inspectValue(value: unknown, path: string, accumulator: InventoryAccumulator): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      inspectValue(entry, `${path}[]`, accumulator)
    }
    return
  }
  if (!isRecord(value)) {
    return
  }

  inspectTypedRecord(value, path, accumulator)
  for (const [key, child] of Object.entries(value)) {
    const childPath = appendPath(path, key)
    inspectFieldPath(key, childPath, value, path, accumulator)
    inspectValue(child, childPath, accumulator)
  }
}

function inspectTypedRecord(
  record: JsonRecord,
  path: string,
  accumulator: InventoryAccumulator,
): void {
  const type = readString(record, "type") ?? readString(record, "kind")
  if (type === null) {
    return
  }
  if (isContentBlockPath(path)) {
    increment(accumulator.contentBlockTypeCounts, type)
  }
  if (isToolCallType(type)) {
    accumulator.toolCallTypes.add(type)
  }
  if (isToolResultType(type)) {
    accumulator.toolResultTypes.add(type)
  }
}

function inspectFieldPath(
  key: string,
  path: string,
  parent: JsonRecord,
  parentPath: string,
  accumulator: InventoryAccumulator,
): void {
  const parentType = readString(parent, "type") ?? readString(parent, "kind")
  if (isToolCallType(parentType) && isCallIdKey(key)) {
    accumulator.callIdFields.add(path)
  }
  if (isToolResultType(parentType) && isResultIdKey(key)) {
    accumulator.resultIdFields.add(path)
  }
  if (isPossibleExitCodeKey(key)) {
    accumulator.possibleExitCodeFields.add(path)
  }
  if (isShellCommandKey(key) && isToolInputPath(parentPath)) {
    accumulator.shellCommandFields.add(path)
  }
  if (isPatchKey(key)) {
    accumulator.patchFields.add(path)
  }
}

function inspectOpenCodeSqlite(filePath: string, accumulator: InventoryAccumulator): void {
  const database = new DatabaseSync(filePath, { readOnly: true })
  try {
    for (const tableName of readSqliteTableNames(database)) {
      accumulator.opencodeTables.set(tableName, readSqliteColumnNames(database, tableName))
    }
    if (accumulator.opencodeTables.has("part")) {
      for (const row of database.prepare("SELECT data FROM part").all()) {
        const record = asRecord(row)
        const raw = record === null ? null : readString(record, "data")
        if (raw === null) {
          continue
        }
        const part = parseJsonRecord(raw, filePath)
        const partType = readString(part, "type")
        if (partType !== null) {
          increment(accumulator.opencodePartTypeCounts, partType)
        }
      }
    }
  } finally {
    database.close()
  }
}

function readSqliteTableNames(database: DatabaseSync): readonly string[] {
  return database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => {
      const record = asRecord(row)
      return readRecordName(record)
    })
    .filter(isString)
}

function readSqliteColumnNames(database: DatabaseSync, tableName: string): readonly string[] {
  return database
    .prepare(`PRAGMA table_info(${quoteSqliteIdentifier(tableName)})`)
    .all()
    .map((row) => {
      const record = asRecord(row)
      return readRecordName(record)
    })
    .filter(isString)
    .sort((left, right) => left.localeCompare(right))
}

function toInventoryEntry(accumulator: InventoryAccumulator): FixtureShapeInventoryEntry {
  const entry = {
    parserType: accumulator.parserType,
    files: sortedStrings(accumulator.files),
    recordTypeCounts: sortedRecord(accumulator.recordTypeCounts),
    topLevelKeys: sortedStrings(accumulator.topLevelKeys),
    payloadTypeCounts: sortedRecord(accumulator.payloadTypeCounts),
    contentBlockTypeCounts: sortedRecord(accumulator.contentBlockTypeCounts),
    callIdFields: sortedStrings(accumulator.callIdFields),
    resultIdFields: sortedStrings(accumulator.resultIdFields),
    possibleExitCodeFields: sortedStrings(accumulator.possibleExitCodeFields),
    shellCommandFields: sortedStrings(accumulator.shellCommandFields),
    patchFields: sortedStrings(accumulator.patchFields),
    toolCallTypes: sortedStrings(accumulator.toolCallTypes),
    toolResultTypes: sortedStrings(accumulator.toolResultTypes),
  }
  if (accumulator.opencodeTables.size === 0) {
    return entry
  }
  return {
    ...entry,
    opencodeTables: sortedTableRecord(accumulator.opencodeTables),
    opencodePartTypeCounts: sortedRecord(accumulator.opencodePartTypeCounts),
  }
}

function buildObservations(
  fixtures: readonly FixtureShapeInventoryEntry[],
): FixtureShapeInventory["observations"] {
  const codex = fixtures.find((entry) => entry.parserType === "codex-jsonl")
  const claude = fixtures.find((entry) => entry.parserType === "claude-jsonl")
  const opencode = fixtures.find((entry) => entry.parserType === "opencode-sqlite")

  return {
    codexToolCallTypes: codex?.toolCallTypes ?? [],
    codexToolResultTypes: codex?.toolResultTypes ?? [],
    claudeContentBlockTypes: Object.keys(claude?.contentBlockTypeCounts ?? {}).sort(),
    stableCallIdFields: uniqueSorted(fixtures.flatMap((entry) => entry.callIdFields)),
    resultIdFields: uniqueSorted(fixtures.flatMap((entry) => entry.resultIdFields)),
    shellCommandFields: uniqueSorted(fixtures.flatMap((entry) => entry.shellCommandFields)),
    possibleExitCodeFields: uniqueSorted(fixtures.flatMap((entry) => entry.possibleExitCodeFields)),
    patchFields: uniqueSorted(fixtures.flatMap((entry) => entry.patchFields)),
    opencodeTableNames: Object.keys(opencode?.opencodeTables ?? {}).sort(),
    opencodePartTypes: Object.keys(opencode?.opencodePartTypeCounts ?? {}).sort(),
  }
}

function getAccumulator(
  accumulators: Map<string, InventoryAccumulator>,
  parserType: string,
): InventoryAccumulator {
  const existing = accumulators.get(parserType)
  if (existing !== undefined) {
    return existing
  }
  const created: InventoryAccumulator = {
    callIdFields: new Set(),
    contentBlockTypeCounts: new Map(),
    files: new Set(),
    opencodeTables: new Map(),
    opencodePartTypeCounts: new Map(),
    parserType,
    patchFields: new Set(),
    payloadTypeCounts: new Map(),
    possibleExitCodeFields: new Set(),
    recordTypeCounts: new Map(),
    resultIdFields: new Set(),
    shellCommandFields: new Set(),
    topLevelKeys: new Set(),
    toolCallTypes: new Set(),
    toolResultTypes: new Set(),
  }
  accumulators.set(parserType, created)
  return created
}

function parseJsonRecord(raw: string, filePath: string): JsonRecord {
  const parsed: unknown = JSON.parse(raw)
  if (isRecord(parsed)) {
    return parsed
  }
  throw new Error(`Fixture JSON record is not an object: ${filePath}`)
}

function readTextFixture(filePath: string): string {
  return readFileSync(filePath, "utf8")
}

function readRecord(record: JsonRecord, field: string): JsonRecord | null {
  const value = record[field]
  return isRecord(value) ? value : null
}

function readString(record: JsonRecord, field: string): string | null {
  const value = record[field]
  return typeof value === "string" && value.length > 0 ? value : null
}

function readRecordName(record: JsonRecord): string | null {
  return readString(record, "name")
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {}
}

function isString(value: string | null): value is string {
  return value !== null
}

function appendPath(parent: string, key: string): string {
  return parent.length === 0 ? key : `${parent}.${key}`
}

function isContentBlockPath(path: string): boolean {
  return (
    path.endsWith("content[]") ||
    path.includes(".content[]") ||
    path.endsWith("parts[]") ||
    path.includes(".parts[]")
  )
}

function isToolInputPath(path: string): boolean {
  return (
    path.endsWith("arguments") ||
    path.includes(".arguments") ||
    path.endsWith("input") ||
    path.includes(".input")
  )
}

function isToolCallType(type: string | null): boolean {
  if (type === null) {
    return false
  }
  return type.includes("tool_call") || type === "tool_use" || type.endsWith("function_call")
}

function isToolResultType(type: string | null): boolean {
  if (type === null) {
    return false
  }
  return (
    type.includes("tool_result") ||
    type.endsWith("function_call_output") ||
    type.endsWith("tool_call_output")
  )
}

function isCallIdKey(key: string): boolean {
  return key === "id" || key === "call_id" || key === "callId" || key === "callID"
}

function isResultIdKey(key: string): boolean {
  return isCallIdKey(key) || key === "tool_use_id"
}

function isPossibleExitCodeKey(key: string): boolean {
  return key === "exitCode" || key === "exit_code" || key === "exit_code_raw"
}

function isShellCommandKey(key: string): boolean {
  return key === "cmd" || key === "command"
}

function isPatchKey(key: string): boolean {
  const normalized = key.toLocaleLowerCase("en-US")
  return normalized.includes("patch") || normalized.includes("diff")
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function sortedRecord(map: Map<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function sortedTableRecord(
  map: Map<string, readonly string[]>,
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function sortedStrings(values: ReadonlySet<string>): readonly string[] {
  return Array.from(values).sort((left, right) => left.localeCompare(right))
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

function normalizePath(path: string): string {
  return path.split(sep).join("/")
}

function quoteSqliteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}
