# AI Agents Guide

ContextSidecar is built to be easy for local agents to adopt without hidden setup steps.

## Who this is for

- Coding agents that need repeatable repo context
- Hermes-style agents that can consume MCP tools
- CLI-first workflows that want a compact, deterministic memory layer
- Developers who want a local sidecar instead of a web app or cloud sync service

## The one-command setup

```bash
./pnpm setup
```

This prepares the repo, initializes local state, and runs the safest useful validation.

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

## How agents should think about the repo

- The context store is protocol-agnostic.
- The CLI, API, and MCP surfaces are thin clients over the same core service.
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

## Claude Code

Use the example config in [`examples/claude-code/mcp-config.json`](../examples/claude-code/mcp-config.json).

## Validation

```bash
./pnpm install
./pnpm doctor
./pnpm test
./pnpm build
./pnpm demo
```

## Troubleshooting

- If `./pnpm setup` fails, re-run `./pnpm doctor` and read the first error.
- If `./pnpm dev:api` or `./pnpm dev:mcp` exits immediately, check the repo root and installed dependencies.
- If a pack looks wrong, verify the namespace and whether archived or expired items are being filtered.

## Reference docs

- [`README.md`](../README.md)
- [`docs/protocols.md`](./protocols.md)
- [`docs/schema-contracts.md`](./schema-contracts.md)
- [`docs/test-matrix.md`](./test-matrix.md)
- [`docs/release-checklist.md`](./release-checklist.md)
