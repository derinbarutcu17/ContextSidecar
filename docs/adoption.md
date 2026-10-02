# ContextSidecar Adoption Plan — Execution Record

Status: **in progress** · Started: 2026-08-10 · Owner: Derin

Goal: verify ContextSidecar is trustworthy enough to become a daily default layer for
coding sessions, and fix what stands in the way.

## 1. Baseline (recorded 2026-08-10)

| Check | Result |
|---|---|
| `pnpm build` | ✅ 11/11 packages (tsc; does NOT exercise native bindings) |
| `pnpm doctor` | ✅ exit 0, health 65/100, no DB seeded |
| `pnpm test` | ❌ blocked — better-sqlite3 ABI mismatch (26 failures + evals crash) |
| `pnpm eval` / `demo` / `test:mcp` / `test:e2e` | ❌ same root cause |
| Node | v22.23.1 (ABI 127) via `~/.hermes/node` — no `engines`, no `.nvmrc` |
| Installed binary | `better-sqlite3@11.10.0` compiled for ABI 137 (Node 24) |

Root cause: the CI workflow pinned Node **24** (`ci.yml`) while local ran Node 22, so the
prebuilt native binary matched Node 24. Every runtime DB open crashed with
`ERR_DLOPEN_FAILED` (`packages/storage/src/index.ts:316`). Builds can't catch this —
only runtime paths (tests, CLI, API, MCP, evals) do.

## 2. Environment repair (done 2026-08-10)

- `pnpm rebuild better-sqlite3` under Node 22 (ABI 127) — all 7 checks green.
- Root `package.json`: `engines.node >=22.0.0`; added `.nvmrc` (`22`).
- `ci.yml`: Node `24` → `22` (removes the recurrence vector).
- `pnpm doctor` / `test` / `build` / `eval` / `demo` / `test:mcp` / `test:e2e`: **all pass**.

Prevention: the mismatch cannot recur as long as CI and local run the same major Node.
`pnpm rebuild better-sqlite3` is the documented repair command.

## 3. Usability scenarios (measured 2026-08-10)

Scratch workspace `/tmp/ctx-phase3/ws`; commands run via `context-sidecar` CLI.

| # | Scenario | Verdict | Metrics / notes |
|---|---|---|---|
| 1 | First-time setup + repo bootstrap | ✅ | init 633–671ms; bootstrap 532–670ms; 20 items seeded; idempotent rerun OK |
| 2 | Pinned instructions + project facts | ✅ | add ≈630–790ms each; `--source-type` is required (friction: not shown in `add --help` defaults) |
| 3 | Temporary task notes | ✅ | add 589ms; `--expires-at` supported; expired items excluded from list/pack |
| 4 | MCP session | ✅ | connect 304ms; `tools/list` 1ms; 22 tools; `health_check` OK (SDK client). NOTE: raw printf-to-stdio tests are unreliable; use the SDK client |
| 5 | Context pack for a real task | ⚠️→✅ | 604–656ms; correct but **verbose** — bootstrap'd repo docs were embedded in full (12.6k chars). Fixed in §5 (73% smaller packs) |
| 6 | Stale/expired/contradictory | ⚠️ | expired correctly filtered; **no contradiction detection** — two conflicting facts served side by side, no flag |
| 7 | Missing DB / failed MCP | ⚠️ | doctor exit 0 + score 65 with clear "No database found" line but no explicit repair command (fixed in §5) |
| 8 | Reset / export / delete | ⚠️ | only `archive` (soft delete); no export/reset commands (export added in §5) |

## 4. Controlled pilot (1 week, low-risk repo)

**Pilot repo: ContextSidecar itself** (dogfooding; not Job Sniper or any sensitive repo).
Opt-in: repo-scoped `.mcp.json` + `pnpm dev:mcp`. Bootstrap already seeded (`repo_docs: 19`, `agent_contract: 1`) plus a pinned Node-22 baseline instruction.

Track one row per session (target 5–10 sessions over one week):

| Date | Repo | Context retrieved? | Useful? | Repeated explanation avoided? | Wrong/irrelevant? | MCP startup failure? | Est. time saved | Lighter or more complicated? |
|---|---|---|---|---|---|---|---|---|
| 2026-08-10 | ContextSidecar (dogfood) | yes (CLI pack) | yes — correct ranking (workspace pins first) | yes — Node-22 baseline pin recalled | no | n/a (CLI path) | n/a | pack was 12.6k chars → now truncated; usable |
| 2026-08-10 | ContextSidecar (dogfood) | yes (CLI pack) | yes — pins first, Node-22 fact included | yes | no | n/a (CLI path) | n/a | 2.1k chars, 4 items; contradiction section working (0 flags on this query) |

Session 1 evidence: retrieval correctness good (pinned instructions ranked first, Node-22
fact included), compactness FAILED pre-fix (12,575 chars — full docs embedded) — fixed
in §5 (3,371 chars, ~73% reduction). Contradiction + secret handling still unverified.
Session 2 evidence: compact packs (2.1k chars), contradiction flags present in output,
correct ranking — no wrong context observed.

Gate for §8: if MCP failures are frequent, retrieval is wrong, or the workflow feels
heavier, stop and treat ContextSidecar as a selective tool until fixed.

## 5. Improvements (implemented / queued)

Implemented (2026-08-10):

- **doctor diagnostics + repair guidance** — new `native` check loads `better-sqlite3`
  and detects ABI mismatches (`ERR_DLOPEN_FAILED`) with the exact repair command; exit
  code 1 on native/integrity errors; missing-DB recommendation now names `init` first.
- **`context export`** — JSON-lines export of all items (incl. archived) to stdout or
  `--output <file>` (backup/portability).
- **`agent config --target codex`** — emits `~/.codex/config.toml` block (TOML); added
  `--format json` for repo-scoped `.mcp.json` (JSON). No more TOML-in-JSON mixups.
- **`pnpm adopt`** — one command verifying the full adoption path (see §6).
- **Compact context packs** — item content in packs is truncated at 600 chars with a
  `context get <id>` pointer (full content still retrievable); session-1 pack went from
  12,575 → 3,371 chars. `PACK_CONTENT_CHAR_LIMIT` in `packages/core`.
- **`CONTEXT_SIDECAR_HOME` env bug** — the CLI never passed `process.env` to the root
  resolver, so the env var (used by generated MCP configs) was a no-op. Fixed at all
  call sites in `apps/cli/src/index.ts`.
- **Portable `.mcp.json`** — relative `./pnpm` + `.context-sidecar` paths so any clone
  works, not just this machine.
- **Test no longer deletes the default workspace** — the "repo-root binary path" doctor
  test now uses a temp root via `CONTEXT_SIDECAR_HOME` instead of wiping `.context-sidecar`.

Deferred with evidence (priority order per plan):

- ~~**Contradiction handling**~~ **DONE (2026-08-11)** — packs now flag near-duplicate,
  non-identical items under `[Contradictions]` (token-Jaccard ≥ 0.6, same type,
  non-expired; id-deterministic). Schema `ContextPackContradictionV1`, live-verified
  against the §3 S6 scenario. Tests in `packages/core`.
- ~~**Secret filtering / prompt-injection safeguards**~~ **DONE (2026-08-11)** —
  `redactSecrets` in `packages/shared/src/redact.ts` (OpenAI/Anthropic/AWS/GitHub/
  Slack/Stripe/Google keys, JWTs, private-key blocks, generic key=value secrets),
  applied at `context add`/`update` and every ingest path. The security report's three
  findings (SSRF, arbitrary file read, missing auth) were already resolved — status
  header added to the report.
- **Backup/reset commands** — **DONE (2026-08-11)**: `context export` (JSON lines),
  `context import jsonl` (restore, round-trip tested), `context reset --yes` (guarded
  destructive wipe). `context reset` still requires explicit confirmation; `serve api`
  stays loopback-only.
- **MCP lifecycle** — **DONE (2026-08-11)**: reconnect/kill-recovery/persistence tests
  (`apps/mcp/test/lifecycle.test.ts`).

Canonical rules stay in `AGENTS.md`; ContextSidecar supplies dynamic context + notes.

## 6. Regression & safety coverage

Coverage now (suite green, 2026-08-11 — 61 tests):

- Doctor: native-binding status, exit-code semantics, fresh-workspace score, Node
  `engines` compliance check.
- Export/import/reset: JSON-lines round-trip, reset confirmation guard, DB recovery
  (corrupted DB → failing doctor + exit 1; missing DB → init recovery).
- Contradiction detection + secret redaction (core + ingest).
- MCP lifecycle: consecutive sessions, kill + recovery, persistence across restarts.
- Deterministic ranking: golden ordering + bit-identical repeats; 1000-item latency.
- Cross-agent config: hermes, claude-code, openclaw, codex (TOML + JSON).
- `pnpm adopt` (`scripts/adoption-check.sh`): clean workspace → init → bootstrap →
  add → pack → doctor → real MCP `health_check` — all in one command.

Still missing (next pass):

- Secret redaction round-trip via MCP/HTTP surfaces (covered at service + ingest level).
- Pack latency at larger scale (10k items) and concurrency tests.

## 7. Integration (opt-in, staged)

- ✅ Default workspace seeded and daily integration **activated**: DB exists,
  `pnpm doctor` = 100/100, 21 items (repo docs + Node-22 pinned baseline).
- ✅ Repo-scoped `.mcp.json` (portable relative paths) for Codex/Claude Code — pilot repo only.
- ✅ `agent config --target codex|hermes|claude-code|openclaw` generators; `--format json`
  for codex produces `.mcp.json`-compatible output.
- ⏳ Wire Hermes/Claude Code only after Codex pilot is stable (§4).
- Workflow must remain fully functional if ContextSidecar is unavailable (it is a
  layer, not a dependency).

## 8. Two-week review (2026-08-24)

Adopt as daily default ONLY if all of:

- [ ] Setup under 5 minutes on a fresh repo
- [ ] Context retrieval consistently correct and compact
- [ ] Meaningful repetition removed
- [ ] MCP failures rare and understandable
- [ ] No critical stale/misleading context seen
- [ ] Workflow faster than manual prompt maintenance

Otherwise: keep it selective per-project, keep improving weak areas (§5 queue).
