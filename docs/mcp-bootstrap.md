# MCP Bootstrap Contract

ContextSidecar's plug-and-play MCP path has two separate checks:

1. Seed the workspace with `./pnpm exec context-sidecar context bootstrap repo`.
2. Open a fresh MCP client session and verify readiness before doing any work.

## Bootstrap contract

- `context bootstrap repo` seeds repo docs into the namespace passed with `--namespace`.
- The default namespace is `project:context-sidecar`.
- The repo docs import should cover `README.md`, `ROADMAP.md`, and `docs/` as `project_fact` items.
- The agent contract import should cover `AGENTS.md` as a pinned instruction.
- Bootstrap is idempotent. A rerun may return `created: 0` for some imports and still be a success if `ok: true`.

## Readiness contract

After bootstrap, a new MCP client should be able to:

- call `health_check`
- list tools and prompts
- list resources
- read the seeded namespace through `context_list` or `context_pack`

Before any synthesis run, `listResources` should expose the static resources only:

- `manifest://capabilities`
- `examples://catalog`

## Fresh run visibility

Once a client runs `synthesis_run`, the new synthesis should immediately show up in `listResources` as:

- `synthesis://<request.id>/draft`
- `synthesis://<request.id>/citations`
- `synthesis://<request.id>/contradictions`

That visibility should work in a fresh client session without additional restarts.

## run_results linkage

The `synthesis_run` response is anchored by `request.id`.

Use that id for:

- `synthesis_get_draft`
- `synthesis_get_citations`
- `synthesis_get_contradictions`
- `readResource({ uri: "synthesis://<request.id>/draft" })`

The draft resource should round-trip the same synthesis id in its payload.

## Smoke-test sequence

Use this sequence for ChatGPT, Claude, OpenCode, or any other MCP client:

1. Run `./pnpm exec context-sidecar context bootstrap repo`.
2. Start the MCP server in a fresh session.
3. Call `health_check`.
4. Call `listTools`, `listPrompts`, and `listResources`.
5. Verify the seeded namespace is visible with `context_list` or `context_pack`.
6. Create a project, ingest a source, and call `synthesis_run`.
7. Verify `listResources` now includes the draft, citations, and contradictions resources for the new synthesis id.
8. Read the draft resource and confirm it matches the `request.id` from `synthesis_run`.

## Client notes

### ChatGPT

- Prefer a fresh MCP connection for the smoke test.
- Treat `health_check` as the first pass/fail signal.

### Claude Code

- Use the repo's `./pnpm dev:mcp` launcher or the generated MCP config snippet.
- Run the same smoke sequence after the client connects.

### OpenCode

- Point the client at the same `./pnpm dev:mcp` or packaged launcher entrypoint.
- Confirm the synthesis id visible in `listResources` matches the `synthesis_run` result.
