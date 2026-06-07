# ContextSidecar Workspace Notes

- Keep the context store protocol-agnostic (CLI, HTTP, MCP).
- Clients must remain thin.
- Schemas are the contract.
- Prefer deterministic ranking over magic.
- Do not let the web UI become the architecture.
- Keep `pnpm eval` pointed at `packages/evals` and `pnpm demo` as a throwaway smoke test.
- Keep `pnpm bootstrap` mapped to `scripts/bootstrap.sh`.
- `context import markdown` is the supported batch import path for repo notes, docs, and memory logs.
- `context bootstrap repo` is the preferred way to seed repo docs into a namespace.
- `context summary` should stay lightweight and reflect the real storage state.
- Hermes integration should use `scripts/serve-hermes.sh`; keep `docs/hermes-integration.md` in sync with CLI changes.
