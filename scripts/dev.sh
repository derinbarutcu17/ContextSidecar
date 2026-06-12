#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "ContextSidecar development entrypoints"
echo ""
echo "Start the MCP server in another terminal:"
echo "  ./pnpm dev:mcp"
echo ""
echo "Start the API in a second terminal if you need HTTP:"
echo "  ./pnpm dev:api"
echo ""
echo "Useful smoke checks:"
echo "  ./pnpm doctor"
echo "  ./pnpm demo"
