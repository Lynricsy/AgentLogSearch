import "@testing-library/jest-dom/vitest"
import {
  type AgentSource,
  type ScanRunResponse,
  SOURCE_PRESET_METADATA,
  type SourcePresetMetadata,
  type UpdateSourceRequest,
} from "@agent-log-search/shared"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { type ApiClient, ApiClientError } from "../lib/api"
import { SourceWorkspace } from "./source-workspace"

const timestamp = "2026-06-16T09:00:00.000Z"

function createClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "http://api.test/api",
    createSource: async () => createSource(),
    deleteSource: async () => undefined,
    getSession: () => Promise.reject(new Error("not used")),
    listScanJobs: async () => ({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 }),
    listSourcePresets: async () => SOURCE_PRESET_METADATA,
    listSources: async () => [],
    runSourceScan: async () => ({ records: [] }),
    searchSemantic: async () => ({ records: [] }),
    updateSource: () => Promise.reject(new Error("not used")),
    ...overrides,
  }
}

describe("SourceWorkspace", () => {
  afterEach(() => {
    cleanup()
  })

  it.each([
    ["Codex CLI", "codex"],
    ["Claude Code", "claude-code"],
    ["Pi Agent", "pi-agent"],
    ["OpenCode", "opencode"],
    ["Generic JSONL", "generic-jsonl"],
    ["Generic JSON", "generic-json"],
    ["Generic Markdown", "generic-markdown"],
  ] satisfies readonly [string, SourcePresetMetadata["id"]][])(
    "autofills source fields for the %s preset",
    async (_label, presetId) => {
      const preset = findPreset(presetId)
      render(<SourceWorkspace client={createClient()} />)

      await screen.findByText("尚未配置数据源")
      expect(screen.queryByText(/\/sources/i)).not.toBeInTheDocument()
      openCreateDialog()
      fireEvent.change(firstLabeled("预设"), { target: { value: preset.id } })

      expect(firstLabeled("预设")).toHaveValue(preset.id)
      expect(firstLabeled("根路径")).toHaveValue(preset.rootPath)
      expect(firstLabeled("文件匹配规则")).toHaveValue(preset.fileGlob)
      expect(firstLabeled("解析器类型")).toHaveValue(preset.parserType)
      expect(firstLabeled("读取器类型")).toHaveValue(preset.readerType)
      expect(firstLabeled("恢复命令模板")).toHaveValue(preset.resumeTemplate)
    },
  )

  it("shows validation and API errors when creation fails", async () => {
    const client = createClient({
      createSource: async () => {
        throw new ApiClientError({
          code: "invalid_source_path",
          message: "Source root path does not exist.",
          status: 400,
        })
      },
    })
    render(<SourceWorkspace client={client} />)

    await screen.findByText("尚未配置数据源")
    openCreateDialog()
    fireEvent.change(firstLabeled("根路径"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "创建数据源" }))

    expect(
      await screen.findByText("根路径必须是绝对路径或以 ~ 开头的主目录路径。"),
    ).toBeInTheDocument()

    fireEvent.change(firstLabeled("数据源名称"), {
      target: { value: "Broken source" },
    })
    fireEvent.change(firstLabeled("根路径"), {
      target: { value: "/missing/path" },
    })
    fireEvent.click(screen.getByRole("button", { name: "创建数据源" }))

    await waitFor(() => {
      expect(screen.getByText("Source root path does not exist.")).toBeVisible()
    })
  })

  it("inserts the created source row after successful creation", async () => {
    const createdSource = createSource({ id: "created", name: "Created source" })
    const client = createClient({
      createSource: async () => createdSource,
    })
    render(<SourceWorkspace client={client} />)

    await screen.findByText("尚未配置数据源")
    openCreateDialog()
    fireEvent.change(firstLabeled("数据源名称"), {
      target: { value: "Created source" },
    })
    fireEvent.click(screen.getByRole("button", { name: "创建数据源" }))

    expect(await screen.findByText("Created source")).toBeVisible()
    expect(screen.getByText("/tmp/demo-agent")).toBeVisible()
  })

  it("opens creation fields in a dialog", async () => {
    render(<SourceWorkspace client={createClient()} />)

    await screen.findByText("尚未配置数据源")
    openCreateDialog()

    const dialog = await screen.findByRole("dialog", { name: /创建数据源/ })
    expect(within(dialog).getByLabelText("数据源名称")).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeInTheDocument()
  })

  it("preserves non-default scan interval when saving edits", async () => {
    const existingSource = createSource({ id: "editable", scanIntervalSeconds: 600 })
    let capturedPayload: UpdateSourceRequest | null = null
    const client = createClient({
      listSources: async () => [existingSource],
      updateSource: async (_id, payload) => {
        capturedPayload = payload
        return applySourceUpdate(existingSource, payload)
      },
    })
    render(<SourceWorkspace client={client} />)

    await screen.findByText("Demo source")
    fireEvent.click(screen.getByRole("button", { name: "编辑 Demo source" }))
    fireEvent.change(firstLabeled("数据源名称"), {
      target: { value: "Renamed source" },
    })
    fireEvent.click(screen.getByRole("button", { name: "保存数据源" }))

    expect(await screen.findByText("Renamed source")).toBeVisible()
    expect(capturedPayload).toEqual(expect.objectContaining({ scanIntervalSeconds: 600 }))
  })

  it("removes the deleted source row", async () => {
    const existingSource = createSource({ id: "delete-me" })
    const client = createClient({
      listSources: async () => [existingSource],
    })
    render(<SourceWorkspace client={client} />)

    await screen.findByText("Demo source")
    fireEvent.click(screen.getByRole("button", { name: "删除 Demo source" }))

    await waitFor(() => {
      expect(screen.queryByText("Demo source")).not.toBeInTheDocument()
    })
    expect(screen.getByText("尚未配置数据源")).toBeVisible()
  })

  it("updates the enabled checkbox after toggling a source", async () => {
    const existingSource = createSource({ enabled: true, id: "toggle-me" })
    let capturedPayload: UpdateSourceRequest | null = null
    const client = createClient({
      listSources: async () => [existingSource],
      updateSource: async (_id, payload) => {
        capturedPayload = payload
        return applySourceUpdate(existingSource, payload)
      },
    })
    render(<SourceWorkspace client={client} />)

    await screen.findByText("Demo source")
    fireEvent.click(screen.getByRole("switch", { name: "切换 Demo source" }))

    await waitFor(() => {
      expect(capturedPayload).toEqual({ enabled: false })
    })
    expect(screen.getByRole("switch", { name: "切换 Demo source" })).not.toBeChecked()
  })

  it("cleans internal source names in rows, controls, and edit forms", async () => {
    const rawName = "Live Claude History tool_result filtered 1782035200000"
    const existingSource = createSource({ id: "clean-name", name: rawName })
    const client = createClient({
      listSources: async () => [existingSource],
    })
    render(<SourceWorkspace client={client} />)

    expect(await screen.findByText("Claude")).toBeVisible()
    expect(screen.queryByText(rawName)).not.toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "切换 Claude" })).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "编辑 Claude" }))

    expect(firstLabeled("数据源名称")).toHaveValue("Claude")
  })

  it("cleans demo fixture names in source rows", async () => {
    const rawName = "F3 demo-agent 2026-06-18T05:38:30.129Z"
    const existingSource = createSource({ id: "demo-name", name: rawName })
    const client = createClient({
      listSources: async () => [existingSource],
    })
    render(<SourceWorkspace client={client} />)

    expect(await screen.findByText("F3")).toBeVisible()
    expect(screen.queryByText(rawName)).not.toBeInTheDocument()
  })

  it("shows manual scan success and refreshes the source row", async () => {
    const refreshedAt = "2026-06-16T09:15:00.000Z"
    const existingSource = createSource({ id: "scan-me", lastScanAt: null })
    const refreshedSource = createSource({ id: "scan-me", lastScanAt: refreshedAt })
    let didRunScan = false
    let resolveRun: (response: ScanRunResponse) => void = () => {
      throw new Error("runSourceScan was not started.")
    }
    const runPromise = new Promise<ScanRunResponse>((resolve) => {
      resolveRun = resolve
    })
    const client = createClient({
      listSources: async () => (didRunScan ? [refreshedSource] : [existingSource]),
      runSourceScan: async () => {
        didRunScan = true
        return await runPromise
      },
    })
    render(<SourceWorkspace client={client} />)

    await screen.findByText("Demo source")
    expect(screen.getByText("从未扫描")).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "扫描 Demo source" }))

    expect(await screen.findByText("扫描中")).toBeVisible()
    await act(async () => {
      resolveRun(createScanRunResponse("scan-me"))
    })

    expect(await screen.findByText("扫描已完成")).toBeVisible()
    expect(await screen.findByText(formatLastScan(refreshedAt))).toBeVisible()
  })
})

function createSource(overrides: Partial<AgentSource> = {}): AgentSource {
  return {
    createdAt: timestamp,
    enabled: true,
    fileGlob: "**/*.jsonl",
    id: "12",
    lastScanAt: null,
    name: "Demo source",
    parserType: "generic-jsonl",
    readerType: "file-glob",
    resumeTemplate: "cd {quoted cwd}",
    rootPath: "/tmp/demo-agent",
    scanIntervalSeconds: 300,
    sourcePreset: "generic",
    updatedAt: timestamp,
    ...overrides,
  }
}

function createScanRunResponse(sourceId: string): ScanRunResponse {
  return {
    records: [
      {
        chunksCreated: 1,
        errorMessage: null,
        filesDiscovered: 1,
        filesFailed: 0,
        filesParsed: 1,
        finishedAt: "2026-06-16T09:15:00.000Z",
        id: "scan-1",
        messagesImported: 2,
        sessionsImported: 1,
        sourceId,
        startedAt: timestamp,
        status: "completed",
      },
    ],
  }
}

function applySourceUpdate(source: AgentSource, payload: UpdateSourceRequest): AgentSource {
  return {
    ...source,
    enabled: payload.enabled ?? source.enabled,
    fileGlob: payload.fileGlob ?? source.fileGlob,
    name: payload.name ?? source.name,
    parserType: payload.parserType ?? source.parserType,
    readerType: payload.readerType ?? source.readerType,
    resumeTemplate: payload.resumeTemplate ?? source.resumeTemplate,
    rootPath: payload.rootPath ?? source.rootPath,
    sourcePreset: payload.sourcePreset ?? source.sourcePreset,
    updatedAt: timestamp,
  }
}

function formatLastScan(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function findPreset(presetId: SourcePresetMetadata["id"]): SourcePresetMetadata {
  const preset = SOURCE_PRESET_METADATA.find((item) => item.id === presetId)
  if (preset === undefined) {
    throw new Error(`Missing preset fixture: ${presetId}`)
  }
  return preset
}

function firstLabeled(name: string): HTMLElement {
  const element = screen.getAllByLabelText(name)[0]
  if (element === undefined) {
    throw new Error(`Missing field: ${name}`)
  }
  return element
}

function openCreateDialog() {
  fireEvent.click(screen.getByRole("button", { name: "打开创建数据源对话框" }))
}
