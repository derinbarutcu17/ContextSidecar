import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const cliPath = path.join(process.cwd(), "src/index.ts");
const runCli = (args: string[], root: string) =>
  execFileSync("node", ["--conditions=source", "--import", "tsx", cliPath, ...args, "--root", root], { cwd: process.cwd(), encoding: "utf8" });

const runCliStatus = (args: string[], root: string) =>
  spawnSync("node", ["--conditions=source", "--import", "tsx", cliPath, ...args, "--root", root], { cwd: process.cwd(), encoding: "utf8" });

const cleanupRoots: string[] = [];
const freshRoot = () => {
  const root = path.join(process.cwd(), ".tmp-recovery", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(root, { recursive: true });
  cleanupRoots.push(root);
  return root;
};

afterEach(() => { for (const root of cleanupRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("database recovery", () => {
  it("flags a corrupted database with a failing doctor and non-zero exit", () => {
    const root = freshRoot();
    fs.writeFileSync(path.join(root, "context-sidecar.sqlite"), Buffer.from("this is not a sqlite database"));
    const result = runCliStatus(["doctor", "--json"], root);
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      storage: { exists: boolean; integrityStatus: string };
    };
    expect(parsed.storage.exists).toBe(true);
    expect(parsed.storage.integrityStatus).toBe("error");
    expect(parsed.ok).toBe(false);
    expect(result.status).toBe(1);
  });

  it("recovers from a missing database via init and add", () => {
    const root = freshRoot();
    const doctor = JSON.parse(runCli(["doctor", "--json"], root)) as { storage: { exists: boolean } };
    expect(doctor.storage.exists).toBe(false);
    runCli(["init"], root);
    const added = JSON.parse(runCli(["context", "add", "--namespace", "project:recovery", "--item-type", "task_note", "--content", "Back after wipe.", "--source-type", "manual_entry", "--json"], root)) as { id: string };
    expect(added.id).toMatch(/^ctx_/);
    const afterDoctor = JSON.parse(runCli(["doctor", "--json"], root)) as { ok: boolean; storage: { exists: boolean; integrityStatus: string } };
    expect(afterDoctor.storage.exists).toBe(true);
    expect(afterDoctor.storage.integrityStatus).toBe("ok");
    expect(afterDoctor.ok).toBe(true);
  });

  it("reports clear guidance when the database is missing", () => {
    const root = freshRoot();
    const parsed = JSON.parse(runCli(["doctor", "--json"], root)) as { recommendations: string[] };
    expect(parsed.recommendations.some((rec) => rec.includes("context-sidecar init"))).toBe(true);
  });

  it("round-trips items through export, reset, and jsonl import", () => {
    const root = freshRoot();
    runCli(["context", "add", "--namespace", "project:rt", "--item-type", "pinned_instruction", "--content", "Round trip pin.", "--source-type", "manual_entry", "--status", "pinned"], root);
    runCli(["context", "add", "--namespace", "project:rt", "--item-type", "project_fact", "--content", "Round trip fact.", "--source-type", "manual_entry"], root);
    const dumpFile = path.join(process.cwd(), `.tmp-recovery-${Date.now()}.jsonl`);
    runCli(["context", "export", "--namespace", "project:rt", "--output", dumpFile], root);
    expect(fs.readFileSync(dumpFile, "utf8").trim().split("\n")).toHaveLength(2);

    runCli(["context", "reset", "--yes"], root);
    const afterReset = JSON.parse(runCli(["doctor", "--json"], root)) as { storage: { exists: boolean } };
    expect(afterReset.storage.exists).toBe(false);

    const imported = JSON.parse(runCli(["context", "import", "jsonl", "--namespace", "project:rt", "--file", dumpFile, "--json"], root)) as { created: number };
    expect(imported.created).toBe(2);
    const items = JSON.parse(runCli(["context", "list", "--namespace", "project:rt", "--json"], root)) as Array<{ item_type: string; content: string }>;
    expect(items.map((item) => `${item.item_type}:${item.content}`)).toEqual(["pinned_instruction:Round trip pin.", "project_fact:Round trip fact."]);
    fs.rmSync(dumpFile, { force: true });
  });

  it("refuses reset without confirmation", () => {
    const root = freshRoot();
    runCli(["context", "add", "--namespace", "project:rt2", "--item-type", "task_note", "--content", "Keep me.", "--source-type", "manual_entry"], root);
    const result = runCliStatus(["context", "reset"], root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--yes");
    const after = JSON.parse(runCli(["doctor", "--json"], root)) as { storage: { exists: boolean } };
    expect(after.storage.exists).toBe(true);
  });
});
