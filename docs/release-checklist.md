# Release Checklist

- README matches actual behavior
- `./pnpm setup`, `./pnpm doctor`, `./pnpm demo`, and `./pnpm dev` are the obvious root commands
- CLI, HTTP, and MCP all call the same core service
- archived and expired handling is consistent
- ranking rules are documented and tested
- typecheck passes
- tests pass
- eval fixtures pass
