import { describe, expect, it } from "vitest";
import { startMcpHttpServer } from "../src/server.js";

describe("MCP HTTP transport", () => {
  it("creates a streamable HTTP transport server", async () => {
    const state = await startMcpHttpServer({
      rootPath: "./.tmp-mcp-http-test",
      provider: { kind: "mock", seed: "http" },
      port: 0
    });

    expect(state.path).toBe("/mcp");
    expect(state.httpServer).toBeDefined();
    state.httpServer.close();
  });
});
