import fs from "node:fs";
import path from "node:path";
import { createContextSidecarService } from "@synthkit/core";

const rootPath = path.join(process.cwd(), ".synthkit-evals");

const fixtureItems = [
  { namespace: "project:job-sniper", item_type: "pinned_instruction", content: "Keep scope tight and prefer inspectable local behavior.", source_type: "manual_entry", status: "pinned", priority: 100 },
  { namespace: "project:job-sniper", item_type: "preference", content: "Prefer terse updates and practical implementation details.", source_type: "user_message", priority: 70 },
  { namespace: "project:job-sniper", item_type: "project_fact", content: "The sidecar must expose the same capability through CLI, HTTP, and MCP.", source_type: "system_note", priority: 80 },
  { namespace: "project:job-sniper", item_type: "task_note", content: "Current task is to finish deterministic context pack ranking and output.", source_type: "manual_entry", priority: 60 },
  { namespace: "project:job-sniper", item_type: "task_note", content: "Old brainstorm note that should stay archived.", source_type: "manual_entry", status: "archived", priority: 90 },
  { namespace: "project:job-sniper", item_type: "task_note", content: "Temporary note that is already expired.", source_type: "manual_entry", expires_at: "2026-04-20T09:00:00.000Z", priority: 95 },
  { namespace: "project:job-sniper", item_type: "workflow_note", content: "Run typecheck and interface tests before claiming v1 is complete.", source_type: "system_note", priority: 50 }
] as const;

const main = async () => {
  fs.rmSync(rootPath, { recursive: true, force: true });
  fs.mkdirSync(rootPath, { recursive: true });
  const service = createContextSidecarService(rootPath);
  for (const item of fixtureItems) service.addItem(item);
  const pack = service.buildContextPack({ namespace: "project:job-sniper", task_query: "deterministic context pack CLI HTTP MCP", max_items: 6, include_types: null, exclude_archived: true, now: "2026-04-21T12:00:00.000Z" });
  const results = {
    includedPinnedFirst: pack.items[0]?.item_type === "pinned_instruction",
    excludedArchived: !pack.items.some((item) => item.content.includes("archived")),
    excludedExpired: !pack.items.some((item) => item.content.includes("expired")),
    deterministicOrdering: JSON.stringify(pack.items.map((item) => item.id)) === JSON.stringify(service.buildContextPack({ namespace: "project:job-sniper", task_query: "deterministic context pack CLI HTTP MCP", max_items: 6, include_types: null, exclude_archived: true, now: "2026-04-21T12:00:00.000Z" }).items.map((item) => item.id)),
    renderedTextStructure: pack.rendered_text.includes("[Context Pack]") && pack.rendered_text.includes("[Pinned Instructions]") && pack.rendered_text.includes("[Preferences]") && pack.rendered_text.includes("[Project Facts]") && pack.rendered_text.includes("[Current Task Notes]") && pack.rendered_text.includes("[Workflow Notes]")
  };
  service.storage.close();
  console.log(JSON.stringify({ ok: Object.values(results).every(Boolean), results, pack }, null, 2));
};

main().catch((error) => { console.error(error); process.exit(1); });
