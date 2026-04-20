import path from "node:path";
import { defineConfig } from "vitest/config";

type AliasMap = Record<string, string>;

const packageAliasEntries: Array<[string, string]> = [
  ["@synthkit/api", "apps/api/src/index.ts"],
  ["@synthkit/cli", "apps/cli/src/index.ts"],
  ["@synthkit/core", "packages/core/src/index.ts"],
  ["@synthkit/domain", "packages/domain/src/index.ts"],
  ["@synthkit/evals", "packages/evals/src/index.ts"],
  ["@synthkit/ingest", "packages/ingest/src/index.ts"],
  ["@synthkit/mcp", "apps/mcp/src/index.ts"],
  ["@synthkit/providers", "packages/providers/src/index.ts"],
  ["@synthkit/sdk-ts", "packages/sdk-ts/src/index.ts"],
  ["@synthkit/shared", "packages/shared/src/index.ts"],
  ["@synthkit/storage", "packages/storage/src/index.ts"]
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
