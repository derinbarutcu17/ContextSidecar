# ContextSidecar Skill

Use this repo as a local-first context sidecar for coding agents.

## What it is

ContextSidecar stores small structured context items and returns a compact context pack through:

- CLI
- local HTTP API
- MCP

It is designed for deterministic, inspectable agent memory.

## Quick install

```bash
./pnpm setup
```

## Daily commands

```bash
./pnpm doctor
./pnpm demo
./pnpm dev
./pnpm dev:api
./pnpm dev:mcp
```

## Recommended flow for agents

1. Run `./pnpm setup`
2. Run `./pnpm doctor`
3. Seed repo docs with `./pnpm exec context-sidecar context bootstrap repo`
4. Add repo-specific notes with `./pnpm exec context-sidecar context add`
5. Build a pack with `./pnpm exec context-sidecar context pack`
6. Use `./pnpm dev:api` or `./pnpm dev:mcp` when a live service is needed

## Agent rules

- Keep the context store protocol-agnostic.
- Keep CLI, API, and MCP thin.
- Treat schemas as the contract.
- Prefer deterministic ranking over magic.
- Keep the experience local-first and easy to inspect.

## Best entrypoints

- Setup and health: `./pnpm setup`, `./pnpm doctor`
- Smoke test: `./pnpm demo`
- Local development: `./pnpm dev`
- HTTP API: `./pnpm dev:api`
- MCP server: `./pnpm dev:mcp`

## Docs

- `README.md`
- `docs/ai-agents.md`
- `docs/hermes-integration.md`
- `docs/protocols.md`
- `docs/schema-contracts.md`
