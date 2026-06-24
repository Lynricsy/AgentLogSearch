import { createHash } from "node:crypto"
import type { EvidenceQuality } from "@agent-log-search/shared"
import { Injectable } from "@nestjs/common"
import type {
  ParsedAssistantMessageEvent,
  ParsedSession,
  ParsedSystemEvent,
  ParsedToolResultEvent,
  ParsedTraceEvent,
  ParsedUserMessageEvent,
} from "../parsers/index.js"
import type { ToolExchange } from "../traces/tool-exchange.types.js"
import { assembleToolExchanges } from "../traces/tool-exchange-assembler.js"
import { classifyCanonicalTool } from "./canonical-tool-classifier.js"
import { dominantOperationKind, extractCommands } from "./command/command-extractor.js"
import { extractErrors } from "./errors/error-extractor.js"
import type { EvidencePipelineContext, NormalizedTraceEventDraft } from "./evidence-types.js"
import { buildEvidenceExcerpt } from "./excerpt/evidence-excerpt-builder.js"
import { parsePatch } from "./patches/patch-parser.js"
import { extractPaths } from "./paths/path-extractor.js"
import { pathToken } from "./paths/path-normalizer.js"
import { SecretRedactor } from "./redaction/secret-redactor.js"
import {
  extractProcessResult,
  reconcileProcessAndSummary,
} from "./validation/generic-process-parser.js"
import { parseValidationOutput } from "./validation/validation-output-parser.js"

@Injectable()
export class EvidencePipelineService {
  private readonly redactor = new SecretRedactor()

  public processSession(
    session: ParsedSession,
    context: EvidencePipelineContext,
  ): readonly NormalizedTraceEventDraft[] {
    const messageEvents = session.traceEvents
      .filter(isMessageEvent)
      .map((event) => normalizeMessageEvent(event))
    const exchanges = assembleToolExchanges(session.traceEvents)
    const toolEvents = exchanges.map((exchange) => this.processExchange(exchange, context))
    return [...messageEvents, ...toolEvents].sort(
      (a, b) => a.seqNo - b.seqNo || a.subSeqNo - b.subSeqNo,
    )
  }

  private processExchange(
    exchange: ToolExchange,
    context: EvidencePipelineContext,
  ): NormalizedTraceEventDraft {
    const output = boundedOutput(exchange.result, context.maxToolOutputChars)
    const rawContentSha256 = output.raw.length > 0 ? sha256(output.raw) : undefined
    const redactedOutput = this.redactor.redact(stripAnsi(output.raw)).text
    const canonicalToolKind = classifyCanonicalTool(exchange.call.toolName)
    const commands = extractCommands({ call: exchange.call, canonicalToolKind })
    const processResult = extractProcessResult(
      compactOptional({
        output: redactedOutput,
        structuredExitCode: exchange.result?.result.exitCode,
        explicitStatus: exchange.result?.result.status,
      }),
    )
    const primaryCommand = commands[commands.length - 1]
    const testSummary = parseValidationOutput(
      compactOptional({
        commandFamily: primaryCommand?.family,
        normalizedCommand: primaryCommand?.normalizedCommand,
        output: redactedOutput,
        exitCode: processResult.exitCode,
      }),
    )
    const reconciledProcessResult =
      testSummary === null
        ? processResult
        : reconcileProcessAndSummary(
            compactOptional({
              process: processResult,
              summaryFailed: testSummary.failed,
              summaryPassed: testSummary.passed,
            }),
          )
    const extractedErrors = extractErrors(
      compactOptional({
        output: redactedOutput,
        maxErrors: context.maxErrorsPerEvent,
        repositoryRoot: context.repositoryRoot,
      }),
    )
    const paths = extractPaths(
      compactOptional({
        call: exchange.call,
        output: redactedOutput,
        canonicalToolKind,
        cwd: context.cwd,
        repositoryRoot: context.repositoryRoot,
        maxPaths: context.maxPathsPerEvent,
      }),
    )
    const patch = parsePatch(patchTextCandidate(exchange.call.arguments, redactedOutput) ?? "")
    const excerpt = buildEvidenceExcerpt({
      output: redactedOutput,
      maxChars: context.maxExcerptChars,
    })
    const warnings = [
      ...exchange.warnings,
      ...commands.flatMap((command) => command.warnings),
      ...excerpt.warnings,
      ...(output.truncated ? ["TOOL_OUTPUT_TRUNCATED"] : []),
    ]
    const facts = {
      canonicalToolKind,
      commands,
      processResult: reconciledProcessResult,
      ...(testSummary === null ? {} : { testSummary }),
      errors: extractedErrors.errors,
      omittedErrorCount: extractedErrors.omittedErrorCount,
      paths,
      ...(patch === null ? {} : { patch }),
      warnings,
      kind: "tool_exchange",
    }
    const rawPointer = exchange.result?.rawPointer ?? exchange.call.rawPointer
    return withOptionalFields(
      {
        sourceEventKey: exchange.call.sourceEventKey,
        seqNo: exchange.call.sequence,
        subSeqNo: exchange.call.subSequence,
        eventKind: "TOOL_EXECUTION",
        operationKind: dominantOperationKind(commands),
        pairingQuality: pairingQuality(exchange.pairingQuality),
        facts,
        pathTokens: unique(paths.map(pathToken).filter((value): value is string => value !== null)),
        errorSignatures: extractedErrors.errors.map((error) => error.strictFingerprint),
        errorCodes: unique(extractedErrors.errors.map((error) => error.code).filter(isString)),
        commandFamilies: unique(commands.map((command) => command.family)),
        rawPointer,
        contentHash: sha256(
          JSON.stringify({
            sourceEventKey: exchange.call.sourceEventKey,
            facts,
            excerpt: excerpt.excerpt,
          }),
        ),
      },
      compactOptional({
        callId: exchange.call.callId,
        toolName: exchange.call.toolName,
        occurredAt: exchange.call.occurredAt,
        rawContentSha256,
        redactedExcerpt: excerpt.excerpt ?? undefined,
      }),
    )
  }
}

function normalizeMessageEvent(
  event: ParsedUserMessageEvent | ParsedAssistantMessageEvent | ParsedSystemEvent,
): NormalizedTraceEventDraft {
  const redactedText = new SecretRedactor().redact(event.text).text
  const excerpt = redactedText.length > 2_000 ? redactedText.slice(0, 2_000) : redactedText
  return withOptionalFields(
    {
      sourceEventKey: event.sourceEventKey,
      seqNo: event.sequence,
      subSeqNo: event.subSequence,
      eventKind: messageEventKind(event),
      operationKind: "NONE",
      pairingQuality: "UNKNOWN",
      facts: { kind: event.kind, messageSeqNo: event.sequence },
      pathTokens: [],
      errorSignatures: [],
      errorCodes: [],
      commandFamilies: [],
      rawPointer: event.rawPointer,
      contentHash: sha256(`${event.sourceEventKey}:${redactedText}`),
    },
    compactOptional({
      occurredAt: event.occurredAt,
      redactedExcerpt: excerpt,
    }),
  )
}

function isMessageEvent(
  event: ParsedTraceEvent,
): event is ParsedUserMessageEvent | ParsedAssistantMessageEvent | ParsedSystemEvent {
  return (
    event.kind === "user_message" || event.kind === "assistant_message" || event.kind === "system"
  )
}

function messageEventKind(
  event: ParsedUserMessageEvent | ParsedAssistantMessageEvent | ParsedSystemEvent,
): "USER_MESSAGE" | "ASSISTANT_MESSAGE" | "SYSTEM" {
  switch (event.kind) {
    case "user_message":
      return "USER_MESSAGE"
    case "assistant_message":
      return "ASSISTANT_MESSAGE"
    case "system":
      return "SYSTEM"
  }
}

function boundedOutput(
  result: ParsedToolResultEvent | undefined,
  maxChars: number,
): { readonly raw: string; readonly truncated: boolean } {
  const text = result?.result.text ?? ""
  if (text.length <= maxChars) {
    return { raw: text, truncated: false }
  }
  return { raw: text.slice(0, maxChars), truncated: true }
}

function patchTextCandidate(args: unknown, output: string): string | null {
  if (typeof args === "string" && args.includes("*** Begin Patch")) return args
  if (typeof args === "object" && args !== null && "patch" in args) {
    const patch = (args as { readonly patch?: unknown }).patch
    if (typeof patch === "string") return patch
  }
  if (output.includes("diff --git ")) return output
  return null
}

function pairingQuality(value: ToolExchange["pairingQuality"]): EvidenceQuality {
  switch (value) {
    case "exact":
      return "EXACT"
    case "inferred":
      return "INFERRED"
    case "missing":
      return "UNKNOWN"
  }
}

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)]
}

function isString(value: string | undefined): value is string {
  return value !== undefined
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function withOptionalFields(
  base: Omit<
    NormalizedTraceEventDraft,
    "callId" | "toolName" | "occurredAt" | "rawContentSha256" | "redactedExcerpt"
  >,
  optional: {
    readonly callId?: string | undefined
    readonly toolName?: string | undefined
    readonly occurredAt?: Date | undefined
    readonly rawContentSha256?: string | undefined
    readonly redactedExcerpt?: string | undefined
  },
): NormalizedTraceEventDraft {
  return {
    ...base,
    ...(optional.callId === undefined ? {} : { callId: optional.callId }),
    ...(optional.toolName === undefined ? {} : { toolName: optional.toolName }),
    ...(optional.occurredAt === undefined ? {} : { occurredAt: optional.occurredAt }),
    ...(optional.rawContentSha256 === undefined
      ? {}
      : { rawContentSha256: optional.rawContentSha256 }),
    ...(optional.redactedExcerpt === undefined
      ? {}
      : { redactedExcerpt: optional.redactedExcerpt }),
  }
}

function compactOptional<T extends Record<string, unknown>>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value
    }
  }
  return output as T
}
