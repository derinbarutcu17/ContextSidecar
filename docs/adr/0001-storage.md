# ADR 0001: Local SQLite storage

## Decision

Use SQLite as the default backing store.

## Rationale

- local-first installs work without infrastructure
- inspectability matters more than cleverness
- a single file is easier to ship, debug, and back up

## Consequences

- scaling is not the goal for v1
- migrations must stay simple

