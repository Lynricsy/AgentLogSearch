type SourceRecord = Readonly<Record<string, unknown>>

export function readBigIntLike(record: SourceRecord, field: string): string {
  const value = record[field]
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value.toString()
  }
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  throw new InvalidRecordFieldError(field)
}

export function readNullableBigIntLike(record: SourceRecord, field: string): string | null {
  const value = record[field]
  if (value === null) {
    return null
  }
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value.toString()
  }
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  throw new InvalidRecordFieldError(field)
}

export function readString(record: SourceRecord, field: string): string {
  const value = record[field]
  if (typeof value === "string") {
    return value
  }
  throw new InvalidRecordFieldError(field)
}

export function readNullableString(record: SourceRecord, field: string): string | null {
  const value = record[field]
  if (value === null) {
    return null
  }
  if (typeof value === "string") {
    return value
  }
  throw new InvalidRecordFieldError(field)
}

export function readNumber(record: SourceRecord, field: string): number {
  const value = record[field]
  if (typeof value === "number") {
    return value
  }
  if (typeof value === "bigint" && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }
  throw new InvalidRecordFieldError(field)
}

export function readDate(record: SourceRecord, field: string): string {
  const value = record[field]
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === "string") {
    return value
  }
  throw new InvalidRecordFieldError(field)
}

export function readNullableDate(record: SourceRecord, field: string): string | null {
  const value = record[field]
  if (value === null) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === "string") {
    return value
  }
  throw new InvalidRecordFieldError(field)
}

export function mapRecordValue<T extends string>(
  mapping: Readonly<Record<string, T>>,
  value: string,
  field: string,
): T {
  const mapped = mapping[value]
  if (mapped === undefined) {
    throw new InvalidRecordFieldError(field)
  }
  return mapped
}

export class InvalidRecordFieldError extends Error {
  public readonly name = "InvalidRecordFieldError"

  public constructor(public readonly field: string) {
    super(`Invalid record field: ${field}`)
  }
}
