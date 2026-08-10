#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

WS="$(mktemp -d /tmp/ctx-adopt.XXXXXX)"
trap 'rm -rf "$WS"' EXIT

step() { echo "== $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

step "1/6 init workspace"
"$REPO_ROOT/pnpm" exec context-sidecar init --root "$WS" >/dev/null || fail "init failed"

step "2/6 bootstrap repo docs"
"$REPO_ROOT/pnpm" exec context-sidecar context bootstrap repo --root "$WS" --namespace project:adoption >/dev/null || fail "bootstrap repo failed"

step "3/6 add pinned instruction"
"$REPO_ROOT/pnpm" exec context-sidecar context add --root "$WS" --namespace project:adoption --source-type manual_entry --item-type pinned_instruction --content "Adoption check item." --status pinned --json >/dev/null || fail "context add failed"

step "4/6 build context pack"
"$REPO_ROOT/pnpm" exec context-sidecar context pack --root "$WS" --namespace project:adoption --task-query "adoption check" --json | grep -q '"items"' || fail "pack returned no items"

step "5/6 doctor diagnostics"
DOCTOR="$("$REPO_ROOT/pnpm" exec context-sidecar doctor --root "$WS" --json 2>/dev/null)" || fail "doctor failed"
echo "$DOCTOR" | grep -q '"ok": true' || fail "doctor ok=false"
echo "$DOCTOR" | grep -q '"native":' || fail "doctor native check missing"
echo "$DOCTOR" | grep -q '"status": "ok"' || fail "native binding not ok"

step "6/6 MCP session (connect + health_check)"
(cd apps/mcp && node -e '
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("node:path");
const root = process.argv[1];
const cliPath = path.join(__dirname, "..", "..", "apps", "cli", "src", "index.ts");
const transport = new StdioClientTransport({ command: process.execPath, args: ["--conditions=source", "--import", "tsx", cliPath, "serve", "mcp", "--root", root], cwd: process.cwd() });
const client = new Client({ name: "adoption-check", version: "1" });
(async () => {
  const timer = setTimeout(() => { console.error("MCP connect timeout"); process.exit(1); }, 30000);
  try {
    await client.connect(transport);
    clearTimeout(timer);
    const health = await client.callTool({ name: "health_check", arguments: {} });
    const payload = JSON.parse(health.content[0].text);
    if (payload.status !== "ok") throw new Error("health_check not ok: " + JSON.stringify(payload));
    console.log("MCP OK:", JSON.stringify(payload));
    await client.close();
  } catch (err) {
    clearTimeout(timer);
    console.error("MCP FAILED:", err.message);
    process.exit(1);
  }
})();
' "$WS") || fail "MCP smoke failed"

echo
echo "ADOPTION PATH OK — clean workspace to usable MCP session verified."
