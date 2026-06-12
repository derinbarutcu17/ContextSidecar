import { describe, expect, it } from "vitest";
import { resolveProviderConfigFromProcessEnv } from "../src/index.js";

describe("provider env resolution", () => {
  it("defaults to the mock provider", () => {
    const config = resolveProviderConfigFromProcessEnv({ env: {} as NodeJS.ProcessEnv });
    expect(config).toEqual({ kind: "mock", seed: "mock" });
  });

  it("reads the configured provider kind from a custom prefix", () => {
    const config = resolveProviderConfigFromProcessEnv({
      env: {
        CONTEXT_SIDECAR_PROVIDER_KIND: "openai",
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "gpt-4.1-mini"
      } as NodeJS.ProcessEnv,
      prefix: "CONTEXT_SIDECAR"
    });

    expect(config).toEqual({
      kind: "openai",
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      embeddingModel: "text-embedding-3-small"
    });
  });
});
