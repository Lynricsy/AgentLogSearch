import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/search" }))

import { AppShell } from "./app-shell"

describe("AppShell", () => {
  it("renders the search surface and expected navigation when the shell loads", () => {
    render(
      <AppShell>
        <h1>Search agent history</h1>
      </AppShell>,
    )

    expect(screen.getByRole("heading", { name: "Search agent history" })).toBeVisible()
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeVisible()
    expect(screen.getByText("Search")).toBeVisible()
    expect(screen.getByText("Sources")).toBeVisible()
    expect(screen.getByText("Scan Jobs")).toBeVisible()
    expect(screen.getByText("Settings")).toBeVisible()
  })
})
