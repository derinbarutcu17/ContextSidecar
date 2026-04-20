# ADR 0003: Thin web UI is optional

## Decision

Do not make the web UI the center of the architecture.

## Rationale

- the product must be useful over MCP, CLI, HTTP, and SDK first
- UI-heavy projects tend to leak private contracts into view components

## Consequences

- web UI work can follow later without changing the engine

