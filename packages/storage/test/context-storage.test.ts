import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStorage } from "../src/index.js";

const tmpRoots: string[] = [];
const createTempStorage = () => {
  const rootPath = path.join(process.cwd(), ".tmp-storage-test", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(rootPath, { recursive: true });
  tmpRoots.push(rootPath);
  return createStorage(rootPath);
};

afterEach(() => {
  for (const root of tmpRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("context storage", () => {
  it("creates, gets, updates, archives, and pins items", () => {
    const storage = createTempStorage();
    const created = storage.createContextItem({
      id: "ctx_1", namespace: "project:repo-a", item_type: "preference", content: "Prefer terse updates.",
      source_type: "user_message", source_reference: null, priority: 5, status: "active",
      created_at: "2026-04-21T08:00:00.000Z", updated_at: "2026-04-21T08:00:00.000Z", expires_at: null, tags: ["style"], metadata: {}
    });
    expect(storage.getContextItem(created.id)?.content).toBe("Prefer terse updates.");
    const updated = storage.updateContextItem(created.id, { content: "Prefer compact updates.", priority: 8, updated_at: "2026-04-21T09:00:00.000Z" });
    expect(updated?.created_at).toBe("2026-04-21T08:00:00.000Z");
    expect(storage.pinContextItem(created.id, "2026-04-21T09:30:00.000Z")?.status).toBe("pinned");
    expect(storage.archiveContextItem(created.id, "2026-04-21T10:00:00.000Z")?.status).toBe("archived");
    storage.close();
  });

  it("lists by namespace and filters by type, status, and tag", () => {
    const storage = createTempStorage();
    storage.createContextItem({ id: "ctx_1", namespace: "project:repo-a", item_type: "preference", content: "Pref", source_type: "manual_entry", source_reference: null, priority: 1, status: "active", created_at: "2026-04-21T08:00:00.000Z", updated_at: "2026-04-21T08:00:00.000Z", expires_at: null, tags: ["style"], metadata: {} });
    storage.createContextItem({ id: "ctx_2", namespace: "project:repo-a", item_type: "workflow_note", content: "Workflow", source_type: "manual_entry", source_reference: null, priority: 2, status: "pinned", created_at: "2026-04-21T09:00:00.000Z", updated_at: "2026-04-21T09:00:00.000Z", expires_at: null, tags: ["process"], metadata: {} });
    storage.createContextItem({ id: "ctx_3", namespace: "project:repo-b", item_type: "workflow_note", content: "Other", source_type: "manual_entry", source_reference: null, priority: 2, status: "active", created_at: "2026-04-21T10:00:00.000Z", updated_at: "2026-04-21T10:00:00.000Z", expires_at: null, tags: ["process"], metadata: {} });
    expect(storage.listContextItems({ namespace: "project:repo-a" }).map((item) => item.id)).toEqual(["ctx_2", "ctx_1"]);
    expect(storage.listContextItems({ namespace: "project:repo-a", item_type: "preference" }).map((item) => item.id)).toEqual(["ctx_1"]);
    expect(storage.listContextItems({ namespace: "project:repo-a", status: "pinned" }).map((item) => item.id)).toEqual(["ctx_2"]);
    expect(storage.listContextItems({ namespace: "project:repo-a", tag: "style" }).map((item) => item.id)).toEqual(["ctx_1"]);
    storage.close();
  });

  it("searches ranked matches and excludes expired items by default", () => {
    const storage = createTempStorage();
    storage.createContextItem({ id: "ctx_1", namespace: "project:repo-a", item_type: "project_fact", content: "The context pack must stay compact and deterministic.", source_type: "system_note", source_reference: null, priority: 4, status: "active", created_at: "2026-04-21T08:00:00.000Z", updated_at: "2026-04-21T08:00:00.000Z", expires_at: null, tags: ["pack"], metadata: {} });
    storage.createContextItem({ id: "ctx_2", namespace: "project:repo-a", item_type: "task_note", content: "Old note about something else.", source_type: "manual_entry", source_reference: null, priority: 10, status: "active", created_at: "2026-04-20T08:00:00.000Z", updated_at: "2026-04-20T08:00:00.000Z", expires_at: "2026-04-20T09:00:00.000Z", tags: ["old"], metadata: {} });
    expect(storage.searchContextItems({ namespace: "project:repo-a", query: "compact deterministic context pack", now: "2026-04-21T09:00:00.000Z" }).map((item) => item.id)).toEqual(["ctx_1"]);
    expect(storage.listContextItems({ namespace: "project:repo-a", now: "2026-04-21T09:00:00.000Z" }).map((item) => item.id)).toEqual(["ctx_1"]);
    expect(storage.listContextItems({ namespace: "project:repo-a", status: "expired", now: "2026-04-21T09:00:00.000Z" }).map((item) => item.id)).toEqual(["ctx_2"]);
    storage.close();
  });

  it("summarizes namespaces with counts and recency", () => {
    const storage = createTempStorage();
    storage.createContextItem({ id: "ctx_1", namespace: "project:repo-a", item_type: "preference", content: "Pref", source_type: "manual_entry", source_reference: null, priority: 1, status: "active", created_at: "2026-04-21T08:00:00.000Z", updated_at: "2026-04-21T08:00:00.000Z", expires_at: null, tags: ["style"], metadata: {} });
    storage.createContextItem({ id: "ctx_2", namespace: "project:repo-a", item_type: "workflow_note", content: "Pinned", source_type: "manual_entry", source_reference: null, priority: 2, status: "pinned", created_at: "2026-04-21T09:00:00.000Z", updated_at: "2026-04-21T09:00:00.000Z", expires_at: null, tags: ["process"], metadata: {} });
    storage.createContextItem({ id: "ctx_3", namespace: "project:repo-a", item_type: "task_note", content: "Expired", source_type: "manual_entry", source_reference: null, priority: 0, status: "active", created_at: "2026-04-20T08:00:00.000Z", updated_at: "2026-04-20T08:00:00.000Z", expires_at: "2026-04-20T09:00:00.000Z", tags: [], metadata: {} });
    storage.createContextItem({ id: "ctx_4", namespace: "project:repo-b", item_type: "workflow_note", content: "Other", source_type: "manual_entry", source_reference: null, priority: 2, status: "archived", created_at: "2026-04-21T10:00:00.000Z", updated_at: "2026-04-21T10:00:00.000Z", expires_at: null, tags: ["process"], metadata: {} });

    expect(storage.listContextNamespaces("2026-04-21T11:00:00.000Z")).toEqual([
      {
        namespace: "project:repo-b",
        item_count: 1,
        active_count: 0,
        pinned_count: 0,
        archived_count: 1,
        expired_count: 0,
        latest_updated_at: "2026-04-21T10:00:00.000Z"
      },
      {
        namespace: "project:repo-a",
        item_count: 3,
        active_count: 1,
        pinned_count: 1,
        archived_count: 0,
        expired_count: 1,
        latest_updated_at: "2026-04-21T09:00:00.000Z"
      }
    ]);
    storage.close();
  });
});
