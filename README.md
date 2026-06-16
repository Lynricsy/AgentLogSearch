# AgentLogSearch

AgentLogSearch is a local-first semantic search workspace for Agent CLI conversation history.
The first implementation target is a localhost development system that scans local history files,
normalizes sessions and messages, builds searchable chunks, and shows copy-only resume commands.

## Status

This repository is in the T1 workspace initialization stage. The current code only establishes the
pnpm monorepo, shared TypeScript settings, placeholder workspace scripts, Docker Compose database
service, and documentation boundaries. Application features are implemented in later tasks.

## Workspace

- `apps/web`: Next.js web application placeholder for the search UI.
- `apps/api`: NestJS API placeholder for backend services.
- `packages/shared`: shared contracts and source preset types.

## Local Privacy Boundary

AgentLogSearch is designed to run on localhost by default. Local Agent CLI history stays on the
developer machine during the first implementation wave. Resume commands are displayed and copied
only; the application must never execute `codex resume`, `claude --resume`, `pi --session`, or
`opencode --session` on behalf of the user.

The repository intentionally ignores local evidence and private working logs by default:

- `AgentLogs/` is for local agent work logs and is not committed by default.
- `.omo/evidence/` is for local verification artifacts and is not committed by default.
- `.env` and `.env.*` are ignored; use `.env.example` as the committed template.

Do not commit real personal Agent CLI history, API tokens, environment dumps, cookies, or raw private
logs.

## First-Class Sources Planned

- Codex CLI: `~/.codex/sessions/**/*.jsonl`
- Claude Code: `~/.claude/projects/**/*.jsonl`
- Pi Agent: `~/.pi/agent/sessions/**/*.jsonl`
- OpenCode: `~/.local/share/opencode/opencode.db`
- Generic JSONL, JSON, and Markdown imports

## Development

Install dependencies:

```bash
pnpm install
```

Run the T1 gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Start the local PostgreSQL service when later database tasks require it:

```bash
docker compose up -d postgres
```
