import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

await prisma.agentSource.upsert({
  where: {
    id: 1n,
  },
  create: {
    id: 1n,
    name: "Demo Codex",
    sourcePreset: "codex",
    parserType: "codex_jsonl",
    readerType: "file_glob",
    rootPath: "~/.codex/sessions",
    fileGlob: "**/*.jsonl",
    resumeTemplate: "cd {quoted cwd} && codex resume {quoted threadId}",
    enabled: false,
    scanIntervalSeconds: 300,
  },
  update: {
    fileGlob: "**/*.jsonl",
    resumeTemplate: "cd {quoted cwd} && codex resume {quoted threadId}",
  },
})

await prisma.$disconnect()
