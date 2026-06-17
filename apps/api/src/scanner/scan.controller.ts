import { Bind, Controller, Param, Post } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ScannerService } from "./scanner.service.js"
import type { ScanRunRecord, ScanRunResponse } from "./scanner.types.js"

@Controller("scan")
export class ScanController {
  public constructor(private readonly scanner: ScannerService) {}

  @Post("run")
  public async runAll(): Promise<ScanRunResponse> {
    return this.scanner.runAllEnabled()
  }

  @Post("run/:sourceId")
  @Bind(Param("sourceId"))
  public async runOne(sourceId: string): Promise<ScanRunResponse> {
    const record: ScanRunRecord = await this.scanner.runSource(parseSourceId(sourceId))
    return { records: [record] }
  }
}

function parseSourceId(sourceId: string): bigint {
  if (!/^[1-9]\d*$/.test(sourceId)) {
    return 0n
  }
  return BigInt(sourceId)
}
