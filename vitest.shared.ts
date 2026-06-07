import path from "node:path";
import { defineConfig } from "vitest/config";

type AliasMap = Record<string, string>;

const packageAliasEntries: Array<[string, string]> = [
  ["@context-sidecar/api", "apps/api/src/index.ts"],
  ["@context-sidecar/cli", "apps/cli/src/index.ts"],
  ["@context-sidecar/core", "packages/core/src/index.ts"],
  ["@context-sidecar/domain", "packages/domain/src/index.ts"],
  ["@context-sidecar/evals", "packages/evals/src/index.ts"],
  ["@context-sidecar/ingest", "packages/ingest/src/index.ts"],
  ["@context-sidecar/mcp", "apps/mcp/src/index.ts"],
  ["@context-sidecar/providers", "packages/providers/src/index.ts"],
  ["@context-sidecar/sdk-ts", "packages/sdk-ts/src/index.ts"],
  ["@context-sidecar/shared", "packages/shared/src/index.ts"],
  ["@context-sidecar/storage", "packages/storage/src/index.ts"]
];

export const createSynthKitAliases = (workspaceRoot: string): AliasMap =>
  Object.fromEntries(packageAliasEntries.map(([name, relPath]) => [name, path.join(workspaceRoot, relPath)]));

export const createSynthKitVitestConfig = (workspaceRoot: string) =>
  defineConfig({
    resolve: {
      alias: createSynthKitAliases(workspaceRoot),
      conditions: ["source"]
    },
    server: {
      deps: {
        inline: [/^@synthkit\//]
      }
    },
    test: {
      environment: "node"
    }
  });
