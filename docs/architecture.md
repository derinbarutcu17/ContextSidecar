# Architecture

The repo is organized around one shared context sidecar service.

- `packages/domain` defines strict v1 schemas for context items and context packs
- `packages/storage` owns local SQLite persistence
- `packages/core` owns ranking and rendering
- `apps/cli`, `apps/api`, and `apps/mcp` are thin interface layers
- `packages/evals` holds realistic fixture-based checks
