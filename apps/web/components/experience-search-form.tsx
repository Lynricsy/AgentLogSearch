"use client"

import type { ExperienceSearchRequest } from "@agent-log-search/shared"
import { Accordion, AccordionItem, Button, Input, Textarea } from "@heroui/react"
import { ChevronDown, FolderGit2, Search } from "lucide-react"

import type {
  ExperienceSearchFormErrors,
  ExperienceSearchFormState,
} from "./experience-search-types"

type ExperienceSearchFormProps = {
  readonly errors: ExperienceSearchFormErrors
  readonly isSearching: boolean
  readonly onChange: (state: ExperienceSearchFormState) => void
  readonly onSubmit: () => void
  readonly state: ExperienceSearchFormState
}

const modeOptions = [
  { key: "all", label: "全部结果" },
  { key: "successful", label: "经过验证" },
  { key: "failed", label: "历史失败尝试" },
  { key: "partial", label: "部分验证" },
  { key: "unverified", label: "证据不足" },
] as const satisfies readonly {
  readonly key: ExperienceSearchRequest["mode"]
  readonly label: string
}[]

export function ExperienceSearchForm({
  errors,
  isSearching,
  onChange,
  onSubmit,
  state,
}: ExperienceSearchFormProps) {
  function update<K extends keyof ExperienceSearchFormState>(
    key: K,
    value: ExperienceSearchFormState[K],
  ) {
    onChange({ ...state, [key]: value })
  }
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_7rem]">
        <Input
          isClearable
          errorMessage={errors.query}
          isInvalid={Boolean(errors.query)}
          label="查询文本"
          labelPlacement="outside"
          onValueChange={(query) => update("query", query)}
          placeholder="TS2339 scanner importer 测试失败"
          radius="lg"
          size="md"
          startContent={<Search aria-hidden="true" className="size-4" />}
          validationBehavior="aria"
          value={state.query}
          variant="bordered"
        />
        <label className="grid gap-1">
          <span className="text-sm font-medium text-[var(--app-ink)]">结果模式</span>
          <span className="relative">
            <select
              className="h-10 w-full appearance-none rounded-lg border-2 border-[var(--app-border)] bg-[var(--app-panel)] px-3 pr-9 text-sm font-medium text-[var(--app-ink)] shadow-sm outline-none transition-colors hover:border-[var(--app-accent)] focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent)]/20"
              onChange={(event) =>
                update("mode", event.target.value as ExperienceSearchRequest["mode"])
              }
              value={state.mode}
            >
              {modeOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--app-muted)]"
            />
          </span>
        </label>
        <Input
          errorMessage={errors.topK}
          isInvalid={Boolean(errors.topK)}
          label="返回数量"
          labelPlacement="outside"
          max={50}
          min={1}
          onValueChange={(topK) => update("topK", topK)}
          radius="lg"
          size="md"
          type="number"
          validationBehavior="aria"
          value={state.topK}
          variant="bordered"
        />
      </div>

      <div className="mt-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)]/40 px-3 py-1">
        <Accordion className="px-0" defaultSelectedKeys={[]} selectionMode="single">
          <AccordionItem key="advanced" aria-label="高级证据信号" title="高级证据信号">
            <div className="grid gap-3 pb-3 lg:grid-cols-2">
              <Textarea
                errorMessage={errors.errorText}
                isInvalid={Boolean(errors.errorText)}
                label="错误文本"
                labelPlacement="outside"
                minRows={3}
                onValueChange={(errorText) => update("errorText", errorText)}
                placeholder="粘贴 TypeScript、测试或构建错误摘要"
                radius="lg"
                validationBehavior="aria"
                value={state.errorText}
                variant="bordered"
              />
              <div className="grid gap-3">
                <Input
                  errorMessage={errors.repositoryPath}
                  isInvalid={Boolean(errors.repositoryPath)}
                  label="仓库路径"
                  labelPlacement="outside"
                  onValueChange={(repositoryPath) => update("repositoryPath", repositoryPath)}
                  placeholder="/root/Projects/Cources/ComprehensiveProject/CliSearch"
                  radius="lg"
                  size="md"
                  startContent={<FolderGit2 aria-hidden="true" className="size-4" />}
                  validationBehavior="aria"
                  value={state.repositoryPath}
                  variant="bordered"
                />
                <Textarea
                  errorMessage={errors.files}
                  isInvalid={Boolean(errors.files)}
                  label="文件路径"
                  labelPlacement="outside"
                  minRows={2}
                  onValueChange={(files) => update("files", files)}
                  placeholder={"apps/api/src/foo.ts\npackages/shared/src/foo.ts"}
                  radius="lg"
                  validationBehavior="aria"
                  value={state.files}
                  variant="bordered"
                />
                <Textarea
                  errorMessage={errors.symbols}
                  isInvalid={Boolean(errors.symbols)}
                  label="代码符号"
                  labelPlacement="outside"
                  minRows={2}
                  onValueChange={(symbols) => update("symbols", symbols)}
                  placeholder={"ScannerImporter\nExperienceSearchService"}
                  radius="lg"
                  validationBehavior="aria"
                  value={state.symbols}
                  variant="bordered"
                />
              </div>
            </div>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          color="primary"
          isLoading={isSearching}
          onPress={onSubmit}
          radius="sm"
          startContent={isSearching ? null : <Search aria-hidden="true" className="size-4" />}
        >
          搜索经验
        </Button>
      </div>
    </div>
  )
}
