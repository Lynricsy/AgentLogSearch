import type {
  FakeChunk,
  FakeHistoryCreate,
  FakeHistoryFile,
  FakeMessage,
  FakeScanJob,
  FakeSession,
  FakeSessionCreate,
  FakeSnapshot,
  FakeSource,
  FakeTraceEvent,
  HistoryUniqueArgs,
  HistoryUpdateArgs,
  HistoryUpsertArgs,
  ScanJobUpdateArgs,
  SessionUpdateArgs,
  SessionUpsertArgs,
  SourceUpdateArgs,
} from "./scanner-test-types.js"

export class FakePrisma {
  public readonly agentSource = {
    findMany: async ({ where }: { readonly where?: Readonly<Record<string, unknown>> } = {}) =>
      this.findSources(where),
    findUnique: async ({ where }: { readonly where: { readonly id: bigint } }) =>
      this.sources.find((source) => source.id === where.id) ?? null,
    update: async ({ data, where }: SourceUpdateArgs) => {
      const previous = this.sources.find((source) => source.id === where.id)
      if (previous === undefined) {
        return null
      }
      const record = { ...previous, ...data }
      this.sources = this.sources.map((source) => (source.id === where.id ? record : source))
      return record
    },
  }

  public readonly historyFile = {
    findUnique: async ({ where }: HistoryUniqueArgs) =>
      this.histories.find(
        (file) =>
          file.sourceId === where.sourceId_filePath.sourceId &&
          file.filePath === where.sourceId_filePath.filePath,
      ) ?? null,
    upsert: async ({ create, update, where }: HistoryUpsertArgs) => {
      const existing = await this.historyFile.findUnique({ where })
      if (existing) {
        Object.assign(existing, update)
        return existing
      }
      return this.addHistoryFile(create)
    },
    update: async ({ data, where }: HistoryUpdateArgs) => {
      const existing = this.histories.find((file) => file.id === where.id)
      if (existing) Object.assign(existing, data)
      return existing ?? null
    },
  }

  public readonly scanJob = {
    create: async ({ data }: { readonly data: Record<string, unknown> }) => {
      const record: FakeScanJob = { ...data, id: this.nextId() }
      this.scanJobs = [...this.scanJobs, record]
      return record
    },
    update: async ({ data, where }: ScanJobUpdateArgs) => {
      const previous = this.scanJobs.find((job) => job.id === where.id) ?? { id: where.id }
      const record: FakeScanJob = { ...previous, ...data, id: where.id }
      this.scanJobs = this.scanJobs.map((job) => (job.id === where.id ? record : job))
      return record
    },
  }

  public readonly agentSession = {
    upsert: async ({ create, update, where }: SessionUpsertArgs) => {
      const existing = this.sessions.find(
        (session) =>
          session.sourceId === where.sourceId_externalThreadId.sourceId &&
          session.externalThreadId === where.sourceId_externalThreadId.externalThreadId,
      )
      if (existing) {
        Object.assign(existing, update)
        return existing
      }
      return this.addSession(create)
    },
    update: async ({ data, where }: SessionUpdateArgs) => {
      const existing = this.sessions.find((session) => session.id === where.id)
      if (existing === undefined) {
        return null
      }
      const traceRevision =
        typeof data.traceRevision === "object" && data.traceRevision !== null
          ? existing.traceRevision + data.traceRevision.increment
          : data.traceRevision
      Object.assign(existing, { ...data, traceRevision: traceRevision ?? existing.traceRevision })
      return existing
    },
  }

  public readonly agentMessage = {
    deleteMany: async ({ where }: { readonly where: { readonly sessionId: bigint } }) => {
      this.messages = this.messages.filter((message) => message.sessionId !== where.sessionId)
    },
    createMany: async ({ data }: { readonly data: readonly FakeMessage[] }) => {
      if (this.shouldFailMessageCreateMany) {
        this.shouldFailMessageCreateMany = false
        throw new Error("insert failed")
      }
      this.messages = [...this.messages, ...data]
      return { count: data.length }
    },
  }

  public readonly agentChunk = {
    deleteMany: async ({ where }: { readonly where: { readonly sessionId: bigint } }) => {
      this.chunks = this.chunks.filter((chunk) => chunk.sessionId !== where.sessionId)
    },
    create: async ({ data }: { readonly data: FakeChunk }) => {
      this.chunks = [...this.chunks, data]
      return data
    },
    createMany: async ({ data }: { readonly data: readonly FakeChunk[] }) => {
      this.chunks = [...this.chunks, ...data]
      return { count: data.length }
    },
  }

  public readonly agentTraceEvent = {
    deleteMany: async ({ where }: { readonly where: { readonly sessionId: bigint } }) => {
      this.traceEvents = this.traceEvents.filter((event) => event.sessionId !== where.sessionId)
    },
    createMany: async ({ data }: { readonly data: readonly FakeTraceEvent[] }) => {
      this.traceEvents = [...this.traceEvents, ...data]
      return { count: data.length }
    },
  }

  private chunks: FakeChunk[] = []
  private histories: FakeHistoryFile[] = []
  private id = 1n
  private messages: FakeMessage[] = []
  private scanJobs: ReadonlyArray<FakeScanJob> = []
  private sessions: FakeSession[] = []
  private shouldFailMessageCreateMany = false
  private sources: FakeSource[] = []
  private traceEvents: FakeTraceEvent[] = []
  private transactionOptions: ReadonlyArray<Record<string, unknown> | undefined> = []

  public async $transaction<T>(
    callback: (tx: FakePrisma) => Promise<T>,
    options?: Record<string, unknown>,
  ): Promise<T> {
    this.transactionOptions = [...this.transactionOptions, options]
    const snapshot = this.snapshot()
    try {
      return await callback(this)
    } catch (error) {
      this.restore(snapshot)
      throw error
    }
  }

  public addSource(input: Partial<FakeSource>): FakeSource {
    const source: FakeSource = {
      id: this.nextId(),
      name: "Test source",
      sourcePreset: "generic",
      parserType: "generic_jsonl",
      readerType: "file_glob",
      rootPath: input.rootPath ?? "",
      fileGlob: input.fileGlob ?? "*.jsonl",
      resumeTemplate: "cd {quoted cwd}",
      enabled: true,
      scanIntervalSeconds: 300,
      lastScanAt: null,
      ...input,
    }
    this.sources = [...this.sources, source]
    return source
  }

  public addHistoryFile(input: FakeHistoryCreate): FakeHistoryFile {
    const history: FakeHistoryFile = {
      id: this.nextId(),
      evidenceExtractorVersion: null,
      fileHash: null,
      parseStatus: "pending",
      errorMessage: null,
      traceParserVersion: null,
      ...input,
    }
    this.histories = [...this.histories, history]
    return history
  }

  public addSession(input: FakeSessionCreate): FakeSession {
    const session: FakeSession = {
      id: this.nextId(),
      experienceBuildError: null,
      experienceBuildStatus: "PENDING",
      experienceBuilderVersion: null,
      experienceProcessingAt: null,
      experienceReadyAt: null,
      experienceRequestedAt: null,
      traceRevision: 0,
      ...input,
    }
    this.sessions = [...this.sessions, session]
    return session
  }

  public addMessage(input: FakeMessage): void {
    this.messages = [...this.messages, input]
  }

  public addChunk(input: FakeChunk): void {
    this.chunks = [...this.chunks, input]
  }

  public failNextMessageCreateMany(): void {
    this.shouldFailMessageCreateMany = true
  }

  public messagesFor(sessionId: bigint): readonly FakeMessage[] {
    return this.messages.filter((message) => message.sessionId === sessionId)
  }

  public chunksFor(sessionId: bigint): readonly FakeChunk[] {
    return this.chunks.filter((chunk) => chunk.sessionId === sessionId)
  }

  public traceEventsFor(sessionId: bigint): readonly FakeTraceEvent[] {
    return this.traceEvents.filter((event) => event.sessionId === sessionId)
  }

  public onlyHistoryFile(): FakeHistoryFile {
    const value = this.histories[0]
    if (value === undefined) throw new Error("missing history")
    return value
  }

  public onlySession(): FakeSession {
    const value = this.sessions[0]
    if (value === undefined) throw new Error("missing session")
    return value
  }

  public scanJobsFor(sourceId: bigint): readonly FakeScanJob[] {
    return this.scanJobs.filter((job) => job.sourceId === sourceId)
  }

  public lastTransactionOptions(): Record<string, unknown> | undefined {
    return this.transactionOptions.at(-1)
  }

  private nextId(): bigint {
    const value = this.id
    this.id += 1n
    return value
  }

  private snapshot(): FakeSnapshot {
    return {
      chunks: this.chunks.map((value) => ({ ...value })),
      histories: this.histories.map((value) => ({ ...value })),
      messages: this.messages.map((value) => ({ ...value })),
      sessions: this.sessions.map((value) => ({ ...value })),
      traceEvents: this.traceEvents.map((value) => ({ ...value })),
    }
  }

  private restore(snapshot: FakeSnapshot): void {
    this.chunks = [...snapshot.chunks]
    this.histories = [...snapshot.histories]
    this.messages = [...snapshot.messages]
    this.sessions = [...snapshot.sessions]
    this.traceEvents = [...snapshot.traceEvents]
  }

  private findSources(where: Readonly<Record<string, unknown>> | undefined): readonly FakeSource[] {
    if (where === undefined) {
      return this.sources
    }
    return this.sources.filter((source) => {
      const { enabled, OR } = where
      if (enabled === true && !source.enabled) {
        return false
      }
      if (OR === undefined) {
        return true
      }
      return matchesDueWhere(source, OR)
    })
  }
}

function matchesDueWhere(source: FakeSource, value: unknown): boolean {
  if (!Array.isArray(value)) {
    return true
  }
  return value.some((condition) => matchesDueCondition(source, condition))
}

function matchesDueCondition(source: FakeSource, condition: unknown): boolean {
  if (!isRecord(condition)) {
    return false
  }
  const { lastScanAt } = condition
  if (lastScanAt === null) {
    return source.lastScanAt === null
  }
  if (!isRecord(lastScanAt)) {
    return false
  }
  const { lte } = lastScanAt
  return source.lastScanAt !== null && lte instanceof Date && source.lastScanAt <= lte
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
}
