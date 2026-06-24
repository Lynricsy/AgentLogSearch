import "@testing-library/jest-dom/vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MarkdownContent } from "./markdown-content"

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg role="img" aria-label="mock mermaid"><text>Mermaid OK</text></svg>',
    })),
  },
}))

describe("MarkdownContent", () => {
  it("renders markdown, latex, and mermaid code fences", async () => {
    render(
      <MarkdownContent
        text={[
          "**加粗用户消息**",
          "",
          "行内公式 $a^2 + b^2 = c^2$。",
          "",
          "```mermaid",
          "flowchart TD",
          "  A-->B",
          "```",
        ].join("\n")}
      />,
    )

    expect(screen.getByText("加粗用户消息").tagName).toBe("STRONG")
    expect(document.querySelector(".katex")).not.toBeNull()

    await waitFor(() => {
      expect(screen.getByLabelText("Mermaid 图表")).toBeVisible()
    })
    expect(screen.getByText("Mermaid OK")).toBeVisible()
  })
})
