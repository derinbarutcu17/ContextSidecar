# Test Matrix

- Domain: schema validation (incl. pack contradictions schema)
- Storage: create, update, get, list, search, archive, pin, expired handling
- Core: deterministic ranking (golden order + bit-identical repeats), rendered pack
  output, contradiction detection, secret redaction on add/update, pack performance at
  1000 items
- MCP: tool listing, bootstrap/readiness smoke tests, fresh-run resource visibility,
  run-result linkage, server lifecycle (consecutive sessions, kill + recovery,
  persistence across restarts)
- CLI: JSON-mode context flow, doctor (fresh/healthy/expired/native-binding/engines/
  ANSI), demo, setup, dev, agent config entrypoints (hermes, claude-code, openclaw,
  codex TOML + JSON), export/import jsonl round-trip, reset guard, database recovery
  (corrupted DB → failing doctor + exit 1, missing DB → init recovery)
- HTTP: create, get, list, search, pack, archive, pin; bearer-token auth gate and
  non-loopback bind guard
- Ingest: local/private URL blocking, workspace-root path sandbox, secret redaction in
  ingested text, malformed PDF handling
- Eval: realistic inclusion, exclusion, ordering, and rendered text checks

## Adoption verification

`pnpm adopt` (`scripts/adoption-check.sh`) verifies the full path in one command:
clean workspace → init → repo bootstrap → add → pack → doctor → real MCP `health_check`.
