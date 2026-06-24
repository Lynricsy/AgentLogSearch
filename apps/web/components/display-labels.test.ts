import { describe, expect, it } from "vitest"

import { formatDisplayName } from "./display-labels"

describe("formatDisplayName", () => {
  it("removes demo labels and generated timestamps from product-facing names", () => {
    expect(formatDisplayName("F3 demo-agent 2026-06-18T05:38:30.129Z", "未命名")).toBe("F3")
    expect(formatDisplayName("README smoke demo-agent", "未命名")).toBe("未命名")
  })
})
