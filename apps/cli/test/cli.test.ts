import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const cliPath = path.join(process.cwd(), "src/index.ts");
vi.setConfig({ testTimeout: 20000 });

describe("CLI", () => {
  it("runs doctor in JSON mode", () => {
    fs.rmSync(".tmp-cli-test", { recursive: true, force: true });
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
    fs.rmSync(root, { recursive: true, force: true });
    const addOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "add", "--namespace", "project:repo-a", "--item-type", "pinned_instruction", "--content", "Never widen scope.", "--source-type", "manual_entry", "--status", "pinned", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const added = JSON.parse(addOutput) as { id: string };
    expect(added.id).toMatch(/^ctx_/);
    const packOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "pack", "--namespace", "project:repo-a", "--task-query", "scope", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const pack = JSON.parse(packOutput) as { items: Array<{ id: string }>; rendered_text: string };
    expect(pack.items[0]?.id).toBe(added.id);
    expect(pack.rendered_text).toContain("[Pinned Instructions]");
  });

  it("lists namespaces in json mode", () => {
    const root = ".tmp-cli-namespaces";
    fs.rmSync(root, { recursive: true, force: true });
    execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "add", "--namespace", "project:repo-a", "--item-type", "pinned_instruction", "--content", "One.", "--source-type", "manual_entry", "--status", "pinned", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "add", "--namespace", "project:repo-b", "--item-type", "workflow_note", "--content", "Two.", "--source-type", "manual_entry", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const namespacesOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "namespaces", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const namespaces = JSON.parse(namespacesOutput) as Array<{ namespace: string; item_count: number }>;
    expect(namespaces.map((entry) => entry.namespace)).toEqual(["project:repo-b", "project:repo-a"]);
    expect(namespaces[0]?.item_count).toBeGreaterThan(0);
  });

  it("shows a summary of the workspace state", () => {
    const root = ".tmp-cli-summary";
    fs.rmSync(root, { recursive: true, force: true });
    execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "add", "--namespace", "project:repo-a", "--item-type", "pinned_instruction", "--content", "One.", "--source-type", "manual_entry", "--status", "pinned", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "add", "--namespace", "project:repo-b", "--item-type", "workflow_note", "--content", "Two.", "--source-type", "manual_entry", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const summaryOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "summary", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const summary = JSON.parse(summaryOutput) as {
      ok: boolean;
      totals: { namespaceCount: number; itemCount: number; pinnedCount: number };
      namespaces: Array<{ namespace: string }>;
      recommendedNextStep: string;
    };
    expect(summary.ok).toBe(true);
    expect(summary.totals.namespaceCount).toBe(2);
    expect(summary.totals.itemCount).toBe(2);
    expect(summary.totals.pinnedCount).toBe(1);
    expect(summary.namespaces.map((entry) => entry.namespace)).toEqual(["project:repo-b", "project:repo-a"]);
    expect(summary.recommendedNextStep).toContain("context pack --namespace <namespace>");
  });

  it("allows updating priority to zero", () => {
    const root = ".tmp-cli-update-zero";
    fs.rmSync(root, { recursive: true, force: true });
    const addOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "add", "--namespace", "project:repo-a", "--item-type", "task_note", "--content", "Lower priority item.", "--source-type", "manual_entry", "--priority", "5", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const added = JSON.parse(addOutput) as { id: string; priority: number };
    expect(added.priority).toBe(5);
    const updateOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "update", "--id", added.id, "--priority", "0", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const updated = JSON.parse(updateOutput) as { priority: number };
    expect(updated.priority).toBe(0);
  });

  it("can include archived items in packs", () => {
    const root = ".tmp-cli-archived-pack";
    fs.rmSync(root, { recursive: true, force: true });
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

  it("imports markdown files repeatably", () => {
    const root = ".tmp-cli-import-markdown";
    fs.rmSync(root, { recursive: true, force: true });
    const importRoot = path.join(process.cwd(), root, "notes");
    fs.mkdirSync(importRoot, { recursive: true });
    const markdownFile = path.join(importRoot, "playbook.md");
    fs.writeFileSync(markdownFile, "# Playbook\n\n- Keep scope tight.");

    const firstImportOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "import", "markdown", "--namespace", "project:repo-a", "--input", importRoot, "--item-type", "project_fact", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const firstImport = JSON.parse(firstImportOutput) as { import: { created: number; updated: number; skipped: number } };
    expect(firstImport.import.created).toBe(1);
    expect(firstImport.import.updated).toBe(0);
    expect(firstImport.import.skipped).toBe(0);

    fs.writeFileSync(markdownFile, "# Playbook\n\n- Keep scope tight.\n- Prefer local behavior.");
    const secondImportOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "import", "markdown", "--namespace", "project:repo-a", "--input", importRoot, "--item-type", "project_fact", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const secondImport = JSON.parse(secondImportOutput) as { import: { created: number; updated: number; skipped: number } };
    expect(secondImport.import.created).toBe(0);
    expect(secondImport.import.updated).toBe(1);

    const listOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "list", "--namespace", "project:repo-a", "--json", "--root", root], { cwd: process.cwd(), encoding: "utf8" });
    const items = JSON.parse(listOutput) as Array<{ source_reference: string | null; content: string }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.source_reference).toBe(path.resolve(markdownFile));
    expect(items[0]?.content).toContain("Prefer local behavior");
  });

  it("runs demo in an isolated workspace", () => {
    const output = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "demo", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    const parsed = JSON.parse(output) as { ok: boolean; workspace: string; pack: { rendered_text: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.workspace).toContain(".context-sidecar-demo");
    expect(parsed.pack.rendered_text).toContain("[Context Pack]");
  });

  it("bootstraps the repo docs into a namespace", () => {
    const repoRoot = path.resolve(process.cwd(), "../..");
    const root = path.join(repoRoot, ".tmp-cli-bootstrap");
    fs.rmSync(root, { recursive: true, force: true });
    const output = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "bootstrap", "repo", "--namespace", "project:context-sidecar", "--json", "--root", root], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const parsed = JSON.parse(output) as { ok: boolean; imports: Array<{ label: string; result: { created: number; updated: number } }> };
    expect(parsed.ok).toBe(true);
    expect(parsed.imports.map((entry) => entry.label)).toEqual(["repo_docs", "agent_contract"]);
    expect(parsed.imports[0]?.result.created).toBeGreaterThan(0);
    expect(parsed.imports[1]?.result.created).toBeGreaterThan(0);
    const listOutput = execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, "context", "list", "--namespace", "project:context-sidecar", "--json", "--root", root], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const items = JSON.parse(listOutput) as Array<{ item_type: string; source_reference: string | null }>;
    expect(items.some((item) => item.item_type === "pinned_instruction")).toBe(true);
    expect(items.some((item) => item.source_reference?.endsWith("README.md"))).toBe(true);
  });
});
