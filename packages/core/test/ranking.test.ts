import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContextSidecarService } from "../src/context-service.js";

const NOW = "2026-04-21T12:00:00.000Z";
const tmpRoots: string[] = [];
const createService = () => {
  const rootPath = path.join(process.cwd(), ".tmp-ranking", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(rootPath, { recursive: true });
  tmpRoots.push(rootPath);
  return createContextSidecarService(rootPath);
};

afterEach(() => { for (const root of tmpRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const build = (service: ReturnType<typeof createContextSidecarService>, query: string | null, maxItems: number | null = null) =>
  service.buildContextPack({ namespace: "project:golden", task_query: query, max_items: maxItems, include_types: null, exclude_archived: true, now: NOW });

describe("deterministic ranking", () => {
  it("matches the golden ordering for a fixed dataset", () => {
    const service = createService();
    const pinned = service.addItem({ namespace: "project:golden", item_type: "pinned_instruction", content: "Always run doctor before reporting health.", source_type: "manual_entry", priority: 10, status: "pinned" });
    const highPrio = service.addItem({ namespace: "project:golden", item_type: "project_fact", content: "API binds loopback only.", source_type: "manual_entry", priority: 8 });
    const relevant = service.addItem({ namespace: "project:golden", item_type: "project_fact", content: "MCP is the primary agent surface for health checks.", source_type: "manual_entry", priority: 2 });
    const lowPrio = service.addItem({ namespace: "project:golden", item_type: "task_note", content: "Routine note.", source_type: "manual_entry", priority: 0 });

    const pack = build(service, "health doctor mcp", null);
    const ids = pack.items.map((item) => item.id);
    expect(ids[0]).toBe(pinned.id);
    expect(ids[1]).toBe(highPrio.id);
    expect(ids[2]).toBe(relevant.id);
    expect(ids[3]).toBe(lowPrio.id);
    expect(ids).toEqual([pinned.id, highPrio.id, relevant.id, lowPrio.id]);
  });

  it("is bit-identical across repeated calls", () => {
    const service = createService();
    for (let i = 0; i < 25; i += 1) {
      service.addItem({ namespace: "project:golden", item_type: "project_fact", content: `Fact number ${i} about the sidecar store.`, source_type: "manual_entry", priority: i % 5 });
    }
    const first = build(service, "sidecar store", null);
    const second = build(service, "sidecar store", null);
    const third = build(service, "sidecar store", null);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });
});

describe("pack performance", () => {
  it("builds packs from 1000 items well under a second", () => {
    const service = createService();
    for (let i = 0; i < 1000; i += 1) {
      service.addItem({ namespace: "project:golden", item_type: i % 4 === 0 ? "task_note" : "project_fact", content: `Item ${i}: relevant keyword batch ${i % 17} for ranking latency checks.`, source_type: "manual_entry", priority: i % 10 });
    }
    const start = performance.now();
    const pack = build(service, "keyword latency checks", 20);
    const elapsed = performance.now() - start;
    expect(pack.items.length).toBeLessThanOrEqual(20);
    expect(elapsed).toBeLessThan(1000);
  });
});
