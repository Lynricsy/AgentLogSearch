import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SearchWorkspace } from "./search-workspace"

describe("SearchWorkspace", () => {
  it("shows validation feedback when the query is blank", async () => {
    render(<SearchWorkspace />)

    screen.getByRole("button", { name: "Validate query" }).click()

    expect(await screen.findByText("Semantic query不能为空")).toBeVisible()
  })
})
