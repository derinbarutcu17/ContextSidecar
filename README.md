# Context-Sidecar

![CI](https://github.com/derinbarutcu17/ContextSidecar/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.1.0-blue)

Context-Sidecar v1 is an agent-first local context sidecar. It stores small structured context items and returns a compact context pack that agents can consume through MCP first, with CLI and HTTP as supporting surfaces.

It exists to reduce repetition. Instead of re-explaining stable preferences, pinned instructions, project facts, workflow notes, and current task notes every session, you can save them once and ask Context-Sidecar for the best context pack for a namespace and task.

If you are wiring the repo into an AI agent, start with [`docs/ai-agents.md`](./docs/ai-agents.md) and the root [`SKILL.md`](./SKILL.md).

## Quick Start

See the flow in under a minute:

```bash
./pnpm setup
./pnpm doctor
./pnpm demo
```

## Local Development

```bash
./pnpm dev
./pnpm dev:api
./pnpm dev:mcp
```

## What it does

ContextSidecar stores compact, structured context for:

- pinned instructions
- preferences
- project facts
- task notes
- workflow notes

It serves that context through the same storage-backed core across:

- CLI
- local HTTP API
- MCP

## How to use it

| Surface | Best for | Start here |
| --- | --- | --- |
| CLI | Day-to-day local context work | [`./pnpm exec context-sidecar context ...`](./docs/ai-agents.md) |
| HTTP API | Scripts and local integrations | [`./pnpm dev:api`](./examples/http/README.md) |
| MCP | Hermes, Claude Code, OpenClaw, and similar agents | [`./pnpm dev:mcp`](./docs/hermes-integration.md) |
| TypeScript SDK | TS apps and toolchains | [`packages/sdk-ts/src/index.ts`](./packages/sdk-ts/src/index.ts) |
| Python SDK | Python scripts and notebooks | [`packages/sdk-py/README.md`](./packages/sdk-py/README.md) |

## Multi-language quickstarts

### TypeScript

```ts
import { SynthKitApiClient } from "@context-sidecar/sdk-ts";

const client = new SynthKitApiClient({ baseUrl: "http://127.0.0.1:8787" });
const project = await client.createProject({ name: "ContextSidecar demo" });
const bundle = await client.synthesize(project.id, { mode: "brief", title: "Demo synthesis" });
console.log(bundle);
```

### Python

```python
from synthkit_sdk import SynthKitClient

client = SynthKitClient("http://127.0.0.1:8787")
project = client.create_project("ContextSidecar demo")
bundle = client.synthesize(project["id"], "brief", "Demo synthesis")
print(bundle["draft"]["id"])
```

### Shell

```bash
./pnpm exec context-sidecar context add \
  --namespace project:demo \
  --item-type pinned_instruction \
  --content "Keep scope tight and inspectable." \
  --source-type manual_entry \
  --status pinned \
  --json
```

## Agent integrations

Use the built-in helper to generate ready-to-paste config snippets for Hermes, Claude Code, and OpenClaw-like MCP setups:

```bash
./pnpm exec context-sidecar context agent config --target hermes
./pnpm exec context-sidecar context agent config --target claude-code
./pnpm exec context-sidecar context agent config --target openclaw
```

For deeper agent setup guidance, read [`docs/ai-agents.md`](./docs/ai-agents.md).

## Docs

- [`docs/ai-agents.md`](./docs/ai-agents.md)
- [`docs/hermes-integration.md`](./docs/hermes-integration.md)
- [`docs/protocols.md`](./docs/protocols.md)
- [`docs/schema-contracts.md`](./docs/schema-contracts.md)
- [`docs/test-matrix.md`](./docs/test-matrix.md)
- [`docs/release-checklist.md`](./docs/release-checklist.md)

## Validation

```bash
./pnpm install
./pnpm typecheck
./pnpm test
./pnpm build
./pnpm doctor
./pnpm demo
```

## Troubleshooting

- Run `./pnpm doctor` first if setup fails.
- Use `./pnpm dev:api` and `./pnpm dev:mcp` when you want live local services.
- If a context pack looks off, check the namespace and whether archived or expired items are being filtered.
