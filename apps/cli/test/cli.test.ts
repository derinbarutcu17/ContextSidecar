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
    fs.rmSync(path.join(repoRoot, ".context-sidecar"), { recursive: true, force: true });
    const output = execFileSync("pnpm", ["exec", "context-sidecar", "doctor", "--json"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.rootPath).toBe(path.join(repoRoot, ".context-sidecar"));
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

  it("allows updating priority to zero", () => {
    const root = ".tmp-cli-update-zero";
    const addOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "add", "--namespace", "project:repo-a", "--item-type", "task_note", "--content", "Lower priority item.", "--source-type", "manual_entry", "--priority", "5", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const added = JSON.parse(addOutput) as { id: string; priority: number };
    expect(added.priority).toBe(5);
    const updateOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "update", "--id", added.id, "--priority", "0", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const updated = JSON.parse(updateOutput) as { priority: number };
    expect(updated.priority).toBe(0);
  });

  it("can include archived items in packs", () => {
    const root = ".tmp-cli-archived-pack";
    const addOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "add", "--namespace", "project:repo-a", "--item-type", "workflow_note", "--content", "Archived note.", "--source-type", "manual_entry", "--status", "active", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const added = JSON.parse(addOutput) as { id: string };
    execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "archive", "--id", added.id, "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const defaultPackOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "pack", "--namespace", "project:repo-a", "--task-query", "archived", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const defaultPack = JSON.parse(defaultPackOutput) as { rendered_text: string };
    expect(defaultPack.rendered_text).not.toContain("Archived note.");
    const archivedPackOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "pack", "--namespace", "project:repo-a", "--task-query", "archived", "--include-archived", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const archivedPack = JSON.parse(archivedPackOutput) as { rendered_text: string };
    expect(archivedPack.rendered_text).toContain("Archived note.");
  });
});
