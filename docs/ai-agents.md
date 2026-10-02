# AI Agents Guide

ContextSidecar is built to be easy for local agents to adopt without hidden setup steps.

## Who this is for

- Coding agents that need repeatable repo context
- Hermes-style agents that can consume MCP tools
- MCP-first workflows that want a compact, deterministic memory layer
- Developers who want a local sidecar instead of a web app or cloud sync service

## The one-command setup

```bash
./pnpm setup
```

This prepares the repo, initializes local state, and runs the safest useful validation.

For MCP plug-and-play use, follow the bootstrap contract in [`docs/mcp-bootstrap.md`](./mcp-bootstrap.md). The short version is:

1. Seed the repo with `./pnpm exec context-sidecar context bootstrap repo`.
2. Start a fresh MCP session.
3. Call `health_check`.
4. Confirm fresh-run resources with `listResources`.
5. Run a synthesis and verify the new `request.id` shows up in the resource URIs.

## The core commands

```bash
./pnpm doctor
./pnpm demo
./pnpm dev
./pnpm dev:api
./pnpm dev:mcp
```

## Recommended agent loop

1. Check the environment with `./pnpm doctor`
2. Seed the repository with `./pnpm exec context-sidecar context bootstrap repo`
3. Add task notes or pinned instructions with `./pnpm exec context-sidecar context add`
4. Build a compact context pack with `./pnpm exec context-sidecar context pack`
5. Use `./pnpm demo` to confirm the workflow is working

If `context bootstrap repo` reports `ok: true` but an import shows `created: 0` on a rerun, that is still a success. Treat the returned `ok` flag and the updated namespace state as the contract, not the raw create count.

## How agents should think about the repo

- The context store is protocol-agnostic.
- MCP is the primary agent-facing surface, with CLI and API as thin supporting clients over the same core service.
- Schemas are the contract.
- Context packs should be deterministic and easy to inspect.
- The repo should stay local-first and transparent.

## What to store

Use these item types for stable context:

- `pinned_instruction` for always-on constraints
- `preference` for user style and defaults
- `project_fact` for stable repo facts
- `task_note` for short-lived work notes
- `workflow_note` for reusable process reminders

## Typical commands

```bash
# Seed repo docs
./pnpm exec context-sidecar context bootstrap repo --json

# Add a pinned instruction
./pnpm exec context-sidecar context add \
  --namespace project:context-sidecar \
  --item-type pinned_instruction \
  --content "Keep scope tight and prefer inspectable local behavior." \
  --source-type manual_entry \
  --status pinned \
  --json

# Build the context pack
./pnpm exec context-sidecar context pack \
  --namespace project:context-sidecar \
  --task-query "what should I know before working here?" \
  --json
```

## Hermes

Use `./pnpm dev:mcp` together with [`docs/hermes-integration.md`](./hermes-integration.md) for Hermes Agent.

## MCP smoke test

The expected client smoke sequence is documented in [`docs/mcp-bootstrap.md`](./mcp-bootstrap.md). Use it for ChatGPT, Claude Code, OpenCode, or any other MCP client that should work on a fresh repo without manual cleanup.

## Agent setup helper

Generate ready-to-paste snippets for common agent runtimes:

```bash
./pnpm exec context-sidecar context agent config --target hermes
./pnpm exec context-sidecar context agent config --target claude-code
./pnpm exec context-sidecar context agent config --target openclaw
./pnpm exec context-sidecar context agent config --target codex            # ~/.codex/config.toml (TOML)
./pnpm exec context-sidecar context agent config --target codex --format json  # repo-scoped .mcp.json (JSON)
```

## Backup and restore

```bash
# Full backup of a namespace as JSON lines (includes archived items)
./pnpm exec context-sidecar context export --namespace project:context-sidecar --output context-backup.jsonl

# Restore from a backup
./pnpm exec context-sidecar context import jsonl --namespace project:context-sidecar --file context-backup.jsonl

# Wipe the local database (destructive — requires --yes)
./pnpm exec context-sidecar context reset --yes
```

## Claude Code

Use the example config in [`examples/claude-code/mcp-config.json`](../examples/claude-code/mcp-config.json).

## Validation

```bash
./pnpm install
./pnpm doctor
./pnpm test
./pnpm build
./pnpm demo
./pnpm adopt   # full adoption path: clean workspace -> usable MCP session
```

## Troubleshooting

- If `./pnpm setup` fails, re-run `./pnpm doctor` and read the first error. Doctor now
  checks the Node version against `engines` and the `better-sqlite3` native binding,
  and prints the exact repair command (`pnpm rebuild better-sqlite3`) on a mismatch.
- If `./pnpm dev:api` or `./pnpm dev:mcp` exits immediately, check the repo root and installed dependencies.
- If a pack looks wrong, verify the namespace and whether archived or expired items are being filtered.
- Context packs truncate long items (600 chars) with a `context get <id>` pointer; fetch
  full content with `context get` when needed.
- Packs flag near-duplicate, potentially conflicting items under `[Contradictions]` —
  verify which item is current before relying on either.
- Secrets (API keys, tokens, private keys) are redacted automatically when items are
  added or content is ingested; they never persist in the workspace database.

## Reference docs

- [`README.md`](../README.md)
- [`docs/protocols.md`](./protocols.md)
- [`docs/schema-contracts.md`](./schema-contracts.md)
- [`docs/test-matrix.md`](./test-matrix.md)
- [`docs/release-checklist.md`](./release-checklist.md)
