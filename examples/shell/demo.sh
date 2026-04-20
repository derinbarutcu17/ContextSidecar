#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"$ROOT/pnpm" exec synthkit init --json
SYNTHESIS_ID=$("$ROOT/pnpm" exec synthkit demo --json | node -e 'const fs=require("node:fs"); const data=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(data.synthesisId)')
"$ROOT/pnpm" exec synthkit inspect citations --synthesis "$SYNTHESIS_ID" --json
