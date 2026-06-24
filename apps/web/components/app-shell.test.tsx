import "@testing-library/jest-dom/vitest"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/search" }))

import { AppShell } from "./app-shell"

describe("AppShell", () => {
  it("renders the search surface and expected navigation when the shell loads", () => {
    render(
      <AppShell>
        <h1>搜索 Agent 历史</h1>
      </AppShell>,
    )

    expect(screen.getByRole("heading", { name: "搜索 Agent 历史" })).toBeVisible()
    const navigation = screen.getByRole("navigation", { name: "主导航" })

    expect(navigation).toBeVisible()
    expect(
      within(navigation)
        .getAllByRole("button")
        .map((link) => link.textContent),
    ).toEqual(["搜索", "数据源", "扫描任务"])
  })
})
