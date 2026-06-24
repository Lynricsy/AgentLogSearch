import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { Injectable } from "@nestjs/common"
import Parser from "tree-sitter"
import TypeScript from "tree-sitter-typescript"
import type { RepositorySymbolKind, RepositorySymbolSnapshot } from "./repository.types.js"

type GrammarKind = "typescript" | "tsx"
type TreeSitterLanguage = Parameters<Parser["setLanguage"]>[0]
type SymbolCandidate = {
  readonly kind: RepositorySymbolKind
  readonly node: Parser.SyntaxNode
}

const MAX_INDEXED_FILES = 50
const MAX_FILE_BYTES = 512 * 1024
const MAX_SYMBOLS = 1000
const PARSE_TIMEOUT_MICROS = 50_000
const SUPPORTED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"])
const TOP_LEVEL_WRAPPERS = new Set(["ambient_declaration", "decorator", "export_statement"])
const SIMPLE_NAME_TYPES = new Set([
  "identifier",
  "private_property_identifier",
  "property_identifier",
  "shorthand_property_identifier",
  "type_identifier",
])

@Injectable()
export class SymbolIndexService {
  private readonly parsers = new Map<GrammarKind, Parser>()

  public async index(
    rootPath: string,
    relativePaths: readonly string[],
  ): Promise<readonly RepositorySymbolSnapshot[]> {
    const normalizedRoot = path.resolve(rootPath)
    const paths = unique(relativePaths.map(normalizeRelativePath).filter(isPresent))
      .filter((relativePath) => grammarKindForPath(relativePath) !== null)
      .slice(0, MAX_INDEXED_FILES)
    const symbols: RepositorySymbolSnapshot[] = []

    for (const relativePath of paths) {
      const absolutePath = path.resolve(normalizedRoot, relativePath)
      if (!isInsideDirectory(normalizedRoot, absolutePath)) {
        continue
      }
      const source = await readSupportedSource(absolutePath)
      if (source === null) {
        continue
      }
      symbols.push(...this.indexSource(relativePath, source))
      if (symbols.length >= MAX_SYMBOLS) {
        break
      }
    }

    return [...uniqueSymbols(symbols)].sort(compareSymbols).slice(0, MAX_SYMBOLS)
  }

  private indexSource(relativePath: string, source: string): readonly RepositorySymbolSnapshot[] {
    const grammarKind = grammarKindForPath(relativePath)
    if (grammarKind === null) {
      return []
    }
    const tree = this.parserFor(grammarKind).parse(source)
    const symbols: RepositorySymbolSnapshot[] = []
    walk(tree.rootNode, (node) => {
      const candidate = symbolCandidate(node)
      if (candidate === null || !shouldIndex(node)) {
        return
      }
      const nameNode = candidate.node.childForFieldName("name")
      if (nameNode === null || !SIMPLE_NAME_TYPES.has(nameNode.type)) {
        return
      }
      symbols.push({
        column: candidate.node.startPosition.column + 1,
        container: containerName(candidate.node),
        kind: candidate.kind,
        line: candidate.node.startPosition.row + 1,
        name: nameNode.text,
        path: relativePath,
      })
    })
    return symbols
  }

  private parserFor(kind: GrammarKind): Parser {
    const cached = this.parsers.get(kind)
    if (cached !== undefined) {
      return cached
    }
    const parser = new Parser()
    parser.setLanguage(languageFor(kind))
    parser.setTimeoutMicros(PARSE_TIMEOUT_MICROS)
    this.parsers.set(kind, parser)
    return parser
  }
}

function languageFor(kind: GrammarKind): TreeSitterLanguage {
  return (kind === "tsx" ? TypeScript.tsx : TypeScript.typescript) as unknown as TreeSitterLanguage
}

function symbolCandidate(node: Parser.SyntaxNode): SymbolCandidate | null {
  switch (node.type) {
    case "abstract_class_declaration":
    case "class_declaration":
      return { kind: "class", node }
    case "enum_declaration":
      return { kind: "enum", node }
    case "function_declaration":
    case "generator_function_declaration":
      return { kind: "function", node }
    case "interface_declaration":
      return { kind: "interface", node }
    case "method_definition":
    case "method_signature":
      return { kind: "method", node }
    case "abstract_method_signature":
    case "public_field_definition":
    case "property_signature":
      return { kind: "property", node }
    case "type_alias_declaration":
      return { kind: "type", node }
    case "variable_declarator":
      return { kind: "variable", node }
    default:
      return null
  }
}

function shouldIndex(node: Parser.SyntaxNode): boolean {
  if (node.type === "variable_declarator") {
    const declaration = node.parent
    return (
      declaration !== null &&
      ["lexical_declaration", "variable_declaration"].includes(declaration.type) &&
      isModuleLevel(declaration)
    )
  }

  if (["method_definition", "method_signature", "public_field_definition"].includes(node.type)) {
    return classOrInterfaceContainer(node) !== null
  }

  if (["abstract_method_signature", "property_signature"].includes(node.type)) {
    return interfaceContainer(node) !== null
  }

  return isModuleLevel(node)
}

function isModuleLevel(node: Parser.SyntaxNode): boolean {
  let parent = node.parent
  while (parent !== null && TOP_LEVEL_WRAPPERS.has(parent.type)) {
    parent = parent.parent
  }
  return parent?.type === "program"
}

function containerName(node: Parser.SyntaxNode): string | null {
  return classOrInterfaceContainer(node) ?? interfaceContainer(node)
}

function classOrInterfaceContainer(node: Parser.SyntaxNode): string | null {
  const container = findAncestor(node, [
    "abstract_class_declaration",
    "class_declaration",
    "interface_declaration",
  ])
  return container?.childForFieldName("name")?.text ?? null
}

function interfaceContainer(node: Parser.SyntaxNode): string | null {
  const container = findAncestor(node, ["interface_declaration"])
  return container?.childForFieldName("name")?.text ?? null
}

function findAncestor(node: Parser.SyntaxNode, types: readonly string[]): Parser.SyntaxNode | null {
  let current = node.parent
  while (current !== null) {
    if (types.includes(current.type)) {
      return current
    }
    current = current.parent
  }
  return null
}

function walk(node: Parser.SyntaxNode, visit: (node: Parser.SyntaxNode) => void): void {
  visit(node)
  for (const child of node.namedChildren) {
    walk(child, visit)
  }
}

async function readSupportedSource(filePath: string): Promise<string | null> {
  try {
    const stats = await stat(filePath)
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) {
      return null
    }
    return await readFile(filePath, "utf8")
  } catch {
    return null
  }
}

function grammarKindForPath(relativePath: string): GrammarKind | null {
  const extension = path.extname(relativePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return null
  }
  return extension === ".jsx" || extension === ".tsx" ? "tsx" : "typescript"
}

function normalizeRelativePath(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/")
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.split("/").includes("..")
  ) {
    return null
  }
  return normalized
}

function isInsideDirectory(rootPath: string, filePath: string): boolean {
  const relativePath = path.relative(rootPath, filePath)
  return relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
}

function uniqueSymbols(
  symbols: readonly RepositorySymbolSnapshot[],
): readonly RepositorySymbolSnapshot[] {
  const seen = new Set<string>()
  const result: RepositorySymbolSnapshot[] = []
  for (const symbol of symbols) {
    const key = [
      symbol.path,
      symbol.kind,
      symbol.container ?? "",
      symbol.name,
      symbol.line,
      symbol.column,
    ].join("\0")
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(symbol)
  }
  return result
}

function compareSymbols(left: RepositorySymbolSnapshot, right: RepositorySymbolSnapshot): number {
  return (
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.column - right.column ||
    left.name.localeCompare(right.name)
  )
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}
