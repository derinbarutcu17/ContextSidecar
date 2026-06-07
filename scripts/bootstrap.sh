#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "==> ContextSidecar Bootstrap"
echo ""

# 1. Check prerequisites
echo "=> Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "FATAL: Node.js is required (install via nvm, fnm, or brew)"; exit 1; }
echo "   Node: $(node --version)"

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "FATAL: Node.js 20+ required (found v$NODE_MAJOR)"
  exit 1
fi

# pnpm is vendored in the repo as ./pnpm
PNPM="./pnpm"
if [ ! -f "$PNPM" ]; then
  echo "FATAL: Vendored pnpm not found at $PNPM — is this the repo root?"
  exit 1
fi

# 2. Install dependencies
echo ""
echo "=> Installing dependencies..."
$PNPM install

# 3. Build all packages
echo ""
echo "=> Building all packages..."
$PNPM build

# 4. Run tests
echo ""
echo "=> Running tests..."
$PNPM test

# 5. Initialize workspace
echo ""
echo "=> Initializing workspace..."
$PNPM exec context-sidecar init --json

# 6. Doctor check
echo ""
echo "=> Running health check..."
$PNPM exec context-sidecar doctor --json

echo ""
echo "==> Bootstrap complete!"
echo ""
echo "Quick commands:"
echo "  pnpm exec context-sidecar context add ...   # Add context items"
echo "  pnpm exec context-sidecar context pack ...   # Build a context pack"
echo "  pnpm serve:mcp                               # Start MCP server"
echo "  pnpm serve:api                               # Start HTTP API"
echo "  pnpm demo                                    # Run demo synthesis"
echo ""
echo "See docs/hermes-integration.md for Hermes Agent setup."
