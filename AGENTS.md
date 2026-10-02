# ContextSidecar Workspace Notes

- Keep the context store protocol-agnostic (CLI, HTTP, MCP).
- Clients must remain thin.
- Schemas are the contract. When changing pack output, update the zod schemas in
  `packages/domain` (e.g. `ContextPackContradictionV1Schema`) and keep `docs/test-matrix.md` in sync.
- Prefer deterministic ranking over magic.
- Do not let the web UI become the architecture.
- Keep `pnpm eval` pointed at `packages/evals` and `pnpm demo` as a throwaway smoke test.
- Keep `pnpm bootstrap` mapped to `scripts/bootstrap.sh`.
- `context import markdown` is the supported batch import path for repo notes, docs, and memory logs.
- `context bootstrap repo` is the preferred way to seed repo docs into a namespace.
- `context summary` should stay lightweight and reflect the real storage state.
- Hermes integration should use `scripts/serve-hermes.sh`; keep `docs/hermes-integration.md` in sync with CLI changes.
- Node 22 is the development baseline (`.nvmrc`, `engines.node >=22`, CI). Switching
  Node majors breaks the `better-sqlite3` native binding — repair with
  `pnpm rebuild better-sqlite3`.
- Secrets must never persist: all content enters the store through
  `redactSecrets` (`packages/shared/src/redact.ts`), applied in `context add`/`update`
  and ingest `normalize`. New content chokepoints must redact too.
- Packs truncate long items at 600 chars with a `context get <id>` pointer; full
  content stays retrievable. Contradiction flags live in the `contradictions` field.
- Backup/restore: `context export` (JSON lines) ↔ `context import jsonl`;
  `context reset --yes` wipes the local database and requires explicit confirmation.
- `context agent config --target codex --format json|toml` covers Codex; keep the
  format options per-target and tested in `apps/cli/test`.
- `pnpm adopt` (`scripts/adoption-check.sh`) verifies the full adoption path from a
  clean workspace to a usable MCP session — run it before claiming integration works.
- Doctor (`pnpm doctor`) checks engines + native binding and exits 1 on
  native/integrity errors — keep those semantics when extending diagnostics.
- All 9 checks must stay green before commit: typecheck, lint, test, eval, demo,
  doctor, test:mcp, test:e2e, adopt.
