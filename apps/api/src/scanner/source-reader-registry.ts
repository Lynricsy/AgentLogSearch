import type { SourceReaderType } from "@agent-log-search/shared"
import type { ParserSource, SourceReader, SourceReaderRequest } from "../parsers/index.js"
import { FileGlobSourceReader, SqliteSourceReader } from "../parsers/index.js"

export class SourceReaderRegistry {
  private readonly readers: ReadonlyMap<SourceReaderType, SourceReader>

  public constructor(readers: ReadonlyMap<SourceReaderType, SourceReader>) {
    this.readers = readers
  }

  public static createDefault(): SourceReaderRegistry {
    return new SourceReaderRegistry(
      new Map<SourceReaderType, SourceReader>([
        ["file-glob", new FileGlobSourceReader()],
        ["sqlite", new SqliteSourceReader()],
      ]),
    )
  }

  public async read(
    readerType: SourceReaderType,
    request: SourceReaderRequest,
  ): Promise<readonly ParserSource[]> {
    const reader = this.readers.get(readerType)
    if (reader === undefined) {
      throw new UnsupportedSourceReaderError(readerType)
    }
    return reader.read(request)
  }
}

export class UnsupportedSourceReaderError extends Error {
  public readonly name = "UnsupportedSourceReaderError"

  public constructor(public readonly readerType: SourceReaderType) {
    super(`Unsupported source reader type: ${readerType}`)
  }
}
