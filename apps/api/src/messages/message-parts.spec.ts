import { splitAgentMessageParts } from "./message-parts.js"

describe("splitAgentMessageParts", () => {
  it("splits assistant thinking, response, tool calls, and metadata into stable parts", () => {
    const parts = splitAgentMessageParts({
      content: [
        "thinking=先理解用户需求",
        "",
        "继续分析上下文。",
        "thinkingSignature=reasoning_content",
        "text=我会先定位配置文件。",
        "command=rg mcp ~/.config",
        "status=queued",
      ].join("\n"),
      role: "assistant",
    })

    expect(parts).toEqual([
      { kind: "thinking", label: "思考", text: "先理解用户需求\n\n继续分析上下文。" },
      { kind: "metadata", label: "思考签名", text: "thinkingSignature=reasoning_content" },
      { kind: "assistant_response", label: "Agent 回复", text: "我会先定位配置文件。" },
      {
        kind: "tool_call",
        label: "工具调用",
        text: "command=rg mcp ~/.config\nstatus=queued",
      },
    ])
  })

  it("keeps plain user text as one readable text part", () => {
    const parts = splitAgentMessageParts({
      content: "请帮我优化搜索结果块。",
      role: "user",
    })

    expect(parts).toEqual([{ kind: "text", label: "用户", text: "请帮我优化搜索结果块。" }])
  })

  it("deduplicates assistant response echoed as a structured text field", () => {
    const parts = splitAgentMessageParts({
      content: [
        "thinking=先读取文档",
        "并确认配置格式。",
        "thinkingSignature=reasoning_content",
        "好的主人，我会先检查配置。",
        "text=好的主人，我会先检查配置。",
        "command=rg mcp ~/.config",
      ].join("\n"),
      role: "assistant",
    })

    expect(parts).toEqual([
      { kind: "thinking", label: "思考", text: "先读取文档\n并确认配置格式。" },
      { kind: "metadata", label: "思考签名", text: "thinkingSignature=reasoning_content" },
      { kind: "assistant_response", label: "Agent 回复", text: "好的主人，我会先检查配置。" },
      { kind: "tool_call", label: "工具调用", text: "command=rg mcp ~/.config" },
    ])
  })

  it("keeps unknown key-value lines inside assistant responses", () => {
    const parts = splitAgentMessageParts({
      content: [
        "然后规则顺序应该这样放，白名单必须在拦截前面：",
        "",
        "rules=",
        "- allow trusted domains",
        "- block everything else",
        "text=然后规则顺序应该这样放，白名单必须在拦截前面：",
      ].join("\n"),
      role: "assistant",
    })

    expect(parts).toEqual([
      {
        kind: "assistant_response",
        label: "Agent 回复",
        text: [
          "然后规则顺序应该这样放，白名单必须在拦截前面：",
          "",
          "rules=",
          "- allow trusted domains",
          "- block everything else",
        ].join("\n"),
      },
    ])
  })

  it("keeps text fields inside tool-call context instead of assistant responses", () => {
    const parts = splitAgentMessageParts({
      content: [
        "我会先读取配置。",
        "text=我会先读取配置。",
        "id=call_123",
        "name=bash",
        "arguments=",
        "text=cat config.json",
        "command=cat config.json",
      ].join("\n"),
      role: "assistant",
    })

    expect(parts).toEqual([
      { kind: "assistant_response", label: "Agent 回复", text: "我会先读取配置。" },
      {
        kind: "tool_call",
        label: "工具调用",
        text: [
          "id=call_123",
          "name=bash",
          "arguments=",
          "text=cat config.json",
          "command=cat config.json",
        ].join("\n"),
      },
    ])
  })

  it("moves tool argument prelude fields into the following tool-call part", () => {
    const parts = splitAgentMessageParts({
      content: [
        "query=dead-horse anti-ad whitelist",
        "project_path=/repo",
        "tool_call=fast_context_search",
        "call_id=call_123",
        "status=",
      ].join("\n"),
      role: "assistant",
    })

    expect(parts).toEqual([
      {
        kind: "tool_call",
        label: "工具调用",
        text: [
          "query=dead-horse anti-ad whitelist",
          "project_path=/repo",
          "tool_call=fast_context_search",
          "call_id=call_123",
          "status=",
        ].join("\n"),
      },
    ])
  })

  it("moves camelCase and numeric tool argument prelude fields into tool calls", () => {
    const parts = splitAgentMessageParts({
      content: [
        "projectPath=/repo",
        "query=search result card rendering",
        "maxFiles=12",
        "tool_call=codegraph_explore",
        "call_id=call_123",
      ].join("\n"),
      role: "assistant",
    })

    expect(parts).toEqual([
      {
        kind: "tool_call",
        label: "工具调用",
        text: [
          "projectPath=/repo",
          "query=search result card rendering",
          "maxFiles=12",
          "tool_call=codegraph_explore",
          "call_id=call_123",
        ].join("\n"),
      },
    ])
  })

  it("moves text tool arguments into the following tool-call without duplicating replies", () => {
    const parts = splitAgentMessageParts({
      content: [
        "Resume command",
        "text=Resume command",
        "time=10",
        "tool_call=browser_wait_for",
        "call_id=call_123",
      ].join("\n"),
      role: "assistant",
    })

    expect(parts).toEqual([
      {
        kind: "tool_call",
        label: "工具调用",
        text: [
          "text=Resume command",
          "time=10",
          "tool_call=browser_wait_for",
          "call_id=call_123",
        ].join("\n"),
      },
    ])
  })

  it("moves multiline content tool arguments into the following tool-call", () => {
    const parts = splitAgentMessageParts({
      content: [
        "## 节点",
        "记录任务过程。",
        "title=记录任务",
        "content=## 节点",
        "记录任务过程。",
        "",
        "## 为什么",
        "说明决策原因。",
        "tool_call=record_agent_log",
        "call_id=call_123",
      ].join("\n"),
      role: "assistant",
    })

    expect(parts).toEqual([
      {
        kind: "assistant_response",
        label: "Agent 回复",
        text: "## 节点\n记录任务过程。",
      },
      {
        kind: "tool_call",
        label: "工具调用",
        text: [
          "title=记录任务",
          "content=## 节点",
          "记录任务过程。",
          "",
          "## 为什么",
          "说明决策原因。",
          "tool_call=record_agent_log",
          "call_id=call_123",
        ].join("\n"),
      },
    ])
  })
})
