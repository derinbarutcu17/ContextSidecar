import { describe, expect, it } from "vitest";
import {
  resolveContextSidecarRootPath,
  resolveContextSidecarRootPathFromProcessEnv,
  resolveServerListenOptions,
  resolveServerListenOptionsFromProcessEnv
} from "../src/index.js";

describe("shared runtime helpers", () => {
  it("resolves the default sidecar root from cwd", () => {
    expect(resolveContextSidecarRootPath({ cwd: "/repo" })).toBe("/repo/.context-sidecar");
  });

  it("resolves the sidecar root from env keys", () => {
    expect(
      resolveContextSidecarRootPathFromProcessEnv({
        env: { CONTEXT_SIDECAR_HOME: "/custom/home" } as NodeJS.ProcessEnv
      })
    ).toBe("/custom/home");
    expect(
      resolveContextSidecarRootPathFromProcessEnv({
        env: { CONTEXT_SIDECAR_DEMO_HOME: "/custom/demo" } as NodeJS.ProcessEnv,
        envKey: "CONTEXT_SIDECAR_DEMO_HOME"
      })
    ).toBe("/custom/demo");
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

  it("resolves server listen options from process env", () => {
    expect(
      resolveServerListenOptionsFromProcessEnv({
        env: { HOST: "127.0.0.1", PORT: "9001" } as NodeJS.ProcessEnv,
        defaultPort: 8788
      })
    ).toEqual({
      host: "127.0.0.1",
      port: 9001
    });
  });
});
