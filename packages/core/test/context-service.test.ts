import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContextSidecarService } from "../src/context-service.js";

const tmpRoots: string[] = [];
const createService = () => {
  const rootPath = path.join(process.cwd(), ".tmp-context-service", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(rootPath, { recursive: true });
  tmpRoots.push(rootPath);
  return createContextSidecarService(rootPath);
};

afterEach(() => { for (const root of tmpRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("context sidecar service", () => {
  it("puts pinned items first and respects max_items", () => {
    const service = createService();
    const pinned = service.addItem({ namespace: "project:repo-a", item_type: "pinned_instruction", content: "Never widen scope.", source_type: "manual_entry", priority: 1, status: "pinned" });
    service.addItem({ namespace: "project:repo-a", item_type: "project_fact", content: "HTTP, CLI, and MCP all share one core service.", source_type: "manual_entry", priority: 8 });
    service.addItem({ namespace: "project:repo-a", item_type: "workflow_note", content: "Keep handlers thin.", source_type: "manual_entry", priority: 2 });
    const pack = service.buildContextPack({ namespace: "project:repo-a", task_query: null, max_items: 2, include_types: null, exclude_archived: true, now: "2026-04-21T12:00:00.000Z" });
    expect(pack.items).toHaveLength(2);
    expect(pack.items[0]?.id).toBe(pinned.id);
    expect(pack.rendered_text).toContain("[Pinned Instructions]");
  });
  it("excludes archived and expired items by default", () => {
    const service = createService();
    const archived = service.addItem({ namespace: "project:repo-a", item_type: "task_note", content: "Old note", source_type: "manual_entry" });
    service.archiveItem(archived.id);
    service.addItem({ namespace: "project:repo-a", item_type: "task_note", content: "Expired note", source_type: "manual_entry", expires_at: "2026-04-20T09:00:00.000Z" });
    service.addItem({ namespace: "project:repo-a", item_type: "task_note", content: "Current note", source_type: "manual_entry" });
    const pack = service.buildContextPack({ namespace: "project:repo-a", task_query: null, max_items: null, include_types: null, exclude_archived: true, now: "2026-04-21T12:00:00.000Z" });
    expect(pack.items.map((item) => item.content)).toEqual(["Current note"]);
  });
  it("uses task-query relevance and stays deterministic", () => {
    const service = createService();
    service.addItem({ namespace: "project:repo-a", item_type: "project_fact", content: "The context pack should be compact and deterministic.", source_type: "manual_entry", priority: 2 });
    service.addItem({ namespace: "project:repo-a", item_type: "workflow_note", content: "Use boring ranking, not semantic magic.", source_type: "manual_entry", priority: 2 });
    const first = service.buildContextPack({ namespace: "project:repo-a", task_query: "compact deterministic context pack", max_items: null, include_types: null, exclude_archived: true, now: "2026-04-21T12:00:00.000Z" });
    const second = service.buildContextPack({ namespace: "project:repo-a", task_query: "compact deterministic context pack", max_items: null, include_types: null, exclude_archived: true, now: "2026-04-21T12:00:00.000Z" });
    expect(first.items[0]?.content).toContain("compact and deterministic");
    expect(first).toEqual(second);
  });
});
