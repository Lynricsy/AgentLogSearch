import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { Injectable } from "@nestjs/common"
import Parser from "tree-sitter"
import TypeScript from "tree-sitter-typescript"
import type { RepositorySymbolKind, RepositorySymbolSnapshot } from "./repository.types.js"

type GrammarKind = "typescript" | "tsx"
type TreeSitterLanguage = Parameters<Parser["setLanguage"]>[0]
type SymbolCaptureName =
  | "class"
  | "enum"
  | "function"
  | "interface"
  | "method"
  | "property"
  | "type"
  | "variable"

const MAX_INDEXED_FILES = 50
const MAX_FILE_BYTES = 512 * 1024
const MAX_SYMBOLS = 1000
const PARSE_TIMEOUT_MICROS = 50_000
const SUPPORTED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"])
const TOP_LEVEL_WRAPPERS = new Set(["ambient_declaration", "decorator", "export_statement"])
const SYMBOL_QUERY = `
(function_declaration name: (identifier) @name) @function
(generator_function_declaration name: (identifier) @name) @function
(class_declaration name: (type_identifier) @name) @class
(abstract_class_declaration name: (type_identifier) @name) @class
(method_definition name: (property_identifier) @name) @method
(method_signature name: (property_identifier) @name) @method
(public_field_definition name: [(property_identifier) (private_property_identifier)] @name) @property
(abstract_method_signature name: (property_identifier) @name) @property
(property_signature name: (property_identifier) @name) @property
(interface_declaration name: (type_identifier) @name) @interface
(type_alias_declaration name: (type_identifier) @name) @type
(enum_declaration name: (identifier) @name) @enum
(lexical_declaration
  (variable_declarator
    name: (identifier) @name)) @variable
(variable_declaration
  (variable_declarator
    name: (identifier) @name)) @variable
`

@Injectable()
export class SymbolIndexService {
  private readonly parsers = new Map<GrammarKind, Parser>()
  private readonly queries = new Map<GrammarKind, Parser.Query>()

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
    for (const match of this.queryFor(grammarKind).matches(tree.rootNode)) {
      const symbol = symbolFromMatch(match)
      if (symbol === null || !shouldIndex(symbol.node)) {
        continue
      }
      symbols.push({
        column: symbol.node.startPosition.column + 1,
        container: containerName(symbol.node),
        kind: symbol.kind,
        line: symbol.node.startPosition.row + 1,
        name: symbol.name,
        path: relativePath,
      })
    }
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

  private queryFor(kind: GrammarKind): Parser.Query {
    const cached = this.queries.get(kind)
    if (cached !== undefined) {
      return cached
    }
    const query = new Parser.Query(languageFor(kind), SYMBOL_QUERY)
    this.queries.set(kind, query)
    return query
  }
}

function languageFor(kind: GrammarKind): TreeSitterLanguage {
  return (kind === "tsx" ? TypeScript.tsx : TypeScript.typescript) as unknown as TreeSitterLanguage
}

function symbolFromMatch(match: Parser.QueryMatch): {
  readonly kind: RepositorySymbolKind
  readonly name: string
  readonly node: Parser.SyntaxNode
} | null {
  const name = match.captures.find((capture) => capture.name === "name")?.node.text
  if (name === undefined) {
    return null
  }
  const declaration = match.captures.find((capture) => isSymbolCaptureName(capture.name))
  if (declaration === undefined) {
    return null
  }
  return {
    kind: declaration.name as RepositorySymbolKind,
    name,
    node: declaration.node,
  }
}

function isSymbolCaptureName(value: string): value is SymbolCaptureName {
  return [
    "class",
    "enum",
    "function",
    "interface",
    "method",
    "property",
    "type",
    "variable",
  ].includes(value)
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
