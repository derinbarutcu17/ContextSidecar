# Hermes Agent Integration

Wire ContextSidecar into [Hermes Agent](https://github.com/NousResearch/hermes-agent) as a native MCP tool. Once set up, your Hermes sessions automatically pull context from the sidecar — preferences, pinned instructions, project facts, and task notes.

## Setup

### 1. Start the MCP server

From the repo root:

```bash
./pnpm serve:mcp
```

Or via the Hermes launcher script:

```bash
./scripts/serve-hermes.sh
```

The MCP server listens on **stdio** for `native_mcp` subprocess mode, so no HTTP port is needed.

### 2. Add to Hermes config

Add this to `~/.hermes/config.yaml`:

```yaml
native_mcp:
  enabled: true
  servers:
    context-sidecar:
      command: /Users/derin/Desktop/CODING/Projects/ContextSidecar/scripts/serve-hermes.sh
      args: []
```

> **Note:** If you've built the package, you can also run the compiled binary directly:
> ```yaml
>       command: /Users/derin/Desktop/CODING/Projects/ContextSidecar/apps/mcp/bin/context-sidecar-mcp.js
>       args: []
> ```

### 3. Restart Hermes

The next Hermes session will auto-discover the `context-sidecar` MCP server and its tools.

## Available tools

Once wired, these MCP tools appear in Hermes:

| Tool | Description |
|------|-------------|
| `context_add` | Store a new context item (preference, pinned instruction, project fact, etc.) |
| `context_update` | Update an existing item's content, priority, or status |
| `context_get` | Retrieve a single item by ID |
| `context_list` | List all items in a namespace |
| `context_search` | Search items by keyword |
| `context_pack` | Build a ranked context pack filtered by task query |
| `context_archive` | Archive an item |
| `context_pin` | Pin an item (always included in packs) |
| `health_check` | Verify the server is responsive |

## Populating your context

Start by adding items you want every Hermes session to see:

```bash
# Pinned instructions (always included)
./pnpm exec context-sidecar context add \
  --namespace default \
  --item-type pinned_instruction \
  --content "Keep scope tight and prefer inspectable local behavior." \
  --source-type manual_entry \
  --status pinned

# Recurring preferences
./pnpm exec context-sidecar context add \
  --namespace default \
  --item-type preference \
  --content "Prefer terse updates and practical implementation details." \
  --source-type user_message

# Project contexts
./pnpm exec context-sidecar context add \
  --namespace project:context-sidecar \
  --item-type project_fact \
  --content "The sidecar must expose the same capability through CLI, HTTP, and MCP." \
  --source-type system_note
```

## Testing the integration

```bash
# In a Hermes session, ask the agent:
# "Pull context from my default namespace"
# Or use the context pack endpoint:
./pnpm exec context-sidecar context pack --namespace default --task-query "what am I working on"
```

## Auto-start (optional)

To have the MCP server start with your Hermes session, add a launch agent:

```bash
# ~/Library/LaunchAgents/com.context-sidecar.mcp.plist
# Or use the script in scripts/serve-hermes.sh
```
