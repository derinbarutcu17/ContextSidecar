import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cliPath = path.join(process.cwd(), "src/index.ts");

describe("CLI", () => {
  it("runs doctor in JSON mode", () => {
    const output = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "doctor", "--json", "--root", ".tmp-cli-test"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.rootPath).toContain(".tmp-cli-test");
  });

  it("runs through the repo-root binary path", () => {
    const repoRoot = path.resolve(process.cwd(), "../..");
    fs.rmSync(path.join(repoRoot, ".synthkit"), { recursive: true, force: true });
    const output = execFileSync("pnpm", ["exec", "context-sidecar", "doctor", "--json"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.rootPath).toBe(path.join(repoRoot, ".synthkit"));
  });

  it("exposes a usable demo synthesis id", () => {
    const repoRoot = path.resolve(process.cwd(), "../..");
    const demoOutput = execFileSync("pnpm", ["exec", "context-sidecar", "demo", "--json"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const demo = JSON.parse(demoOutput) as { synthesisId: string };
    expect(demo.synthesisId).toMatch(/^synth_/);
    const citationsOutput = execFileSync(
      "pnpm",
      ["exec", "context-sidecar", "inspect", "citations", "--synthesis", demo.synthesisId, "--json"],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );
    const citations = JSON.parse(citationsOutput) as Array<{ id: string }>;
    expect(citations.length).toBeGreaterThan(0);
  });

  it("supports context commands in json mode", () => {
    const root = ".tmp-cli-context";
    const addOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "add", "--namespace", "project:repo-a", "--item-type", "pinned_instruction", "--content", "Never widen scope.", "--source-type", "manual_entry", "--status", "pinned", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const added = JSON.parse(addOutput) as { id: string };
    expect(added.id).toMatch(/^ctx_/);
    const packOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "pack", "--namespace", "project:repo-a", "--task-query", "scope", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const pack = JSON.parse(packOutput) as { items: Array<{ id: string }>; rendered_text: string };
    expect(pack.items[0]?.id).toBe(added.id);
    expect(pack.rendered_text).toContain("[Pinned Instructions]");
  });
});
