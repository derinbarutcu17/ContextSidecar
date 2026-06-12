import { describe, expect, it } from "vitest";
import { resolveContextSidecarRootPath, resolveServerListenOptions } from "../src/index.js";

describe("shared runtime helpers", () => {
  it("resolves the default sidecar root from cwd", () => {
    expect(resolveContextSidecarRootPath({ cwd: "/repo" })).toBe("/repo/.context-sidecar");
  });

  it("resolves server listen options from env and defaults", () => {
    expect(resolveServerListenOptions({ env: {}, defaultPort: 8788 })).toEqual({
      host: "127.0.0.1",
      port: 8788
    });
    expect(resolveServerListenOptions({ env: { HOST: "0.0.0.0", PORT: "9000" } as NodeJS.ProcessEnv, defaultPort: 8788 })).toEqual({
      host: "0.0.0.0",
      port: 9000
    });
  });
});
