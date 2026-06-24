import "@testing-library/jest-dom/vitest"
import {
  type AgentSource,
  SOURCE_PRESET_METADATA,
  type UpdateSourceRequest,
} from "@agent-log-search/shared"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { ApiClient } from "../lib/api"
import { SourceTable } from "./source-table"
import { SourceWorkspace } from "./source-workspace"

const timestamp = "2026-06-16T09:00:00.000Z"
const scanIntervalError = "扫描间隔必须是 60 到 86400 秒之间的整数。"
const invalidCreateScanIntervalInputs = [
  "",
  "59",
  "86401",
  "60.5",
  "-60",
  "1e2",
  "999999999999999999999999",
] as const
const invalidEditScanIntervalInputs = ["60.5", "86401", "-60", "1e2"] as const

describe("source scan interval UI", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows non-default scan intervals in the source table", () => {
    render(
      <SourceTable
        deletingId={null}
        onDelete={() => undefined}
        onEdit={() => undefined}
        onScan={() => undefined}
        onToggle={() => undefined}
        scanStates={{}}
        scanningId={null}
        sources={[createSource({ scanIntervalSeconds: 900 })]}
        togglingId={null}
      />,
    )

    expect(screen.getByText("15 分钟")).toBeVisible()
  })

  it("keeps an existing non-default scan interval when saving edits", async () => {
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
    expect(firstLabeled("扫描间隔秒数")).toHaveValue(600)
    fireEvent.click(screen.getByRole("button", { name: "保存数据源" }))

    await waitFor(() => {
      expect(capturedPayload).toEqual(expect.objectContaining({ scanIntervalSeconds: 600 }))
    })
  })

  it.each(invalidCreateScanIntervalInputs)(
    "blocks source creation when scan interval input is %s",
    async (scanIntervalSeconds) => {
      let createCalls = 0
      const client = createClient({
        createSource: async () => {
          createCalls += 1
          return createSource()
        },
      })
      render(<SourceWorkspace client={client} />)

      await screen.findByText("尚未配置数据源")
      openCreateDialog()
      fireEvent.change(firstLabeled("数据源名称"), {
        target: { value: "Invalid interval source" },
      })
      fireEvent.change(firstLabeled("扫描间隔秒数"), {
        target: { value: scanIntervalSeconds },
      })
      fireEvent.click(screen.getByRole("button", { name: "创建数据源" }))

      expect(await screen.findByText(scanIntervalError)).toBeInTheDocument()
      expect(createCalls).toBe(0)
    },
  )

  it.each(invalidEditScanIntervalInputs)(
    "blocks source updates when scan interval input is %s",
    async (scanIntervalSeconds) => {
      const existingSource = createSource({ id: "editable", scanIntervalSeconds: 600 })
      let updateCalls = 0
      const client = createClient({
        listSources: async () => [existingSource],
        updateSource: async (_id, payload) => {
          updateCalls += 1
          return applySourceUpdate(existingSource, payload)
        },
      })
      render(<SourceWorkspace client={client} />)

      await screen.findByText("Demo source")
      fireEvent.click(screen.getByRole("button", { name: "编辑 Demo source" }))
      fireEvent.change(firstLabeled("扫描间隔秒数"), {
        target: { value: scanIntervalSeconds },
      })
      fireEvent.click(screen.getByRole("button", { name: "保存数据源" }))

      expect(await screen.findByText(scanIntervalError)).toBeVisible()
      expect(updateCalls).toBe(0)
    },
  )
})

function createClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "http://api.test/api",
    createSource: async () => createSource(),
    deleteSource: async () => undefined,
    getSession: async () => {
      throw new Error("not used")
    },
    getExperience: async () => {
      throw new Error("not used")
    },
    searchExperiences: async () => ({
      failedAttempts: [],
      partial: [],
      successful: [],
      unverified: [],
    }),
    rebuildExperiences: async () => ({ affectedSessions: 0 }),
    checkFailedAttempt: async () => ({ matches: [], message: null, risk: "none" }),
    listScanJobs: async () => ({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 }),
    listSourcePresets: async () => SOURCE_PRESET_METADATA,
    listSources: async () => [],
    runSourceScan: async () => ({ records: [] }),
    searchSemantic: async () => ({ records: [] }),
    updateSource: async () => {
      throw new Error("not used")
    },
    ...overrides,
  }
}

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
    scanIntervalSeconds: payload.scanIntervalSeconds ?? source.scanIntervalSeconds,
    sourcePreset: payload.sourcePreset ?? source.sourcePreset,
    updatedAt: timestamp,
  }
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
