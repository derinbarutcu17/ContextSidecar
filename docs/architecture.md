# Architecture

The repo is organized around one shared context sidecar service.

- `packages/domain` defines strict v1 schemas for context items and context packs
- `packages/storage` owns local SQLite persistence
- `packages/core` owns ranking and rendering
- `apps/mcp` is the primary agent-facing interface, and `apps/cli` and `apps/api` are thin supporting layers
- `packages/evals` holds realistic fixture-based checks
