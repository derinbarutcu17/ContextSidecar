import {
  ContextItemV1Schema,
  ContextPackRequestV1Schema,
  ContextPackV1Schema,
  type ContextItemType,
  type ContextItemV1,
  type ContextPackEntryV1,
  type ContextPackRequestV1,
  nowIso
} from "@context-sidecar/domain";
import { createStorage, type ContextNamespaceSummaryV1, type CreateContextItemInput, type SearchContextItemsFilters, type SynthKitStorage, type UpdateContextItemInput } from "@context-sidecar/storage";
import { sha256 } from "@context-sidecar/shared";

const DEFAULT_MAX_ITEMS = 8;
const SECTION_TITLES: Record<ContextItemType, string> = {
  pinned_instruction: "Pinned Instructions",
  preference: "Preferences",
  profile_fact: "Profile Facts",
  project_fact: "Project Facts",
  task_note: "Current Task Notes",
  workflow_note: "Workflow Notes"
};
const TYPE_ORDER: ContextItemType[] = ["pinned_instruction", "preference", "profile_fact", "project_fact", "task_note", "workflow_note"];

const statusWeight = (status: ContextItemV1["status"]) => status === "pinned" ? 3 : status === "active" ? 2 : status === "archived" ? 1 : 0;
const simpleRelevance = (item: ContextItemV1, query: string | null) => !query ? 0 : query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean).reduce((score, term) => ([item.content, item.tags.join(" "), JSON.stringify(item.metadata)].join(" ").toLowerCase().includes(term) ? score + 1 : score), 0);
const effectiveStatus = (item: ContextItemV1, now: string) => item.expires_at && item.expires_at <= now ? "expired" : item.status;
const compareRank = (left: ContextItemV1, right: ContextItemV1, taskQuery: string | null, now: string) => statusWeight(effectiveStatus(right, now)) - statusWeight(effectiveStatus(left, now)) || right.priority - left.priority || simpleRelevance(right, taskQuery) - simpleRelevance(left, taskQuery) || right.updated_at.localeCompare(left.updated_at) || left.id.localeCompare(right.id);
const reasonIncluded = (item: ContextItemV1, taskQuery: string | null, now: string) => effectiveStatus(item, now) === "pinned" ? "Pinned items always win and are included first." : taskQuery && simpleRelevance(item, taskQuery) > 0 ? `Matches task query: ${taskQuery}` : item.priority > 0 ? `Included for priority ${item.priority}.` : "Included as recent active context.";

const renderContextPack = (pack: { namespace: string; generated_at: string; task_query: string | null; items: ContextPackEntryV1[] }) => {
  const grouped = new Map<string, ContextPackEntryV1[]>();
  for (const item of pack.items) grouped.set(SECTION_TITLES[item.item_type], [...(grouped.get(SECTION_TITLES[item.item_type]) ?? []), item]);
  const lines = ["[Context Pack]", `Namespace: ${pack.namespace}`, `Generated At: ${pack.generated_at}`];
  if (pack.task_query) lines.push(`Task Query: ${pack.task_query}`);
  for (const type of TYPE_ORDER) {
    const title = SECTION_TITLES[type];
    const items = grouped.get(title);
    if (!items?.length) continue;
    lines.push("", `[${title}]`);
    for (const item of items) lines.push(`- ${item.content}`);
  }
  return lines.join("\n");
};

export interface AddContextItemInput {
  namespace: string;
  item_type: ContextItemType;
  content: string;
  source_type: ContextItemV1["source_type"];
  source_reference?: string | null;
  priority?: number;
  status?: ContextItemV1["status"];
  expires_at?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
export interface ListItemsInput { namespace: string; item_type?: ContextItemType; status?: ContextItemV1["status"]; tag?: string; include_archived?: boolean; now?: string | null; }
export interface SearchItemsInput { namespace: string; query: string; item_type?: ContextItemType; status?: ContextItemV1["status"]; include_archived?: boolean; now?: string | null; }
export interface UpdateItemInput { content?: string; priority?: number; status?: ContextItemV1["status"]; expires_at?: string | null; tags?: string[]; metadata?: Record<string, unknown>; }
export interface ListNamespacesInput { now?: string | null; }

export class ContextSidecarService {
  constructor(readonly storage: SynthKitStorage) {}
  addItem(input: AddContextItemInput) {
    const timestamp = nowIso();
    return this.storage.createContextItem(ContextItemV1Schema.parse({
      id: `ctx_${sha256(`${input.namespace}:${input.item_type}:${input.content}:${timestamp}`).slice(0, 16)}`,
      namespace: input.namespace, item_type: input.item_type, content: input.content, source_type: input.source_type,
      source_reference: input.source_reference ?? null, priority: input.priority ?? 0, status: input.status ?? "active",
      created_at: timestamp, updated_at: timestamp, expires_at: input.expires_at ?? null, tags: input.tags ?? [], metadata: input.metadata ?? {}
    }) as CreateContextItemInput);
  }
  updateItem(id: string, input: UpdateItemInput) {
    const updated = this.storage.updateContextItem(id, { ...input, updated_at: nowIso() } satisfies UpdateContextItemInput);
    if (!updated) throw new Error(`Context item not found: ${id}`);
    return updated;
  }
  getItem(id: string) { const item = this.storage.getContextItem(id); if (!item) throw new Error(`Context item not found: ${id}`); return item; }
  listNamespaces(input: ListNamespacesInput = {}): ContextNamespaceSummaryV1[] {
    return this.storage.listContextNamespaces(input.now ?? nowIso());
  }
  listItems(input: ListItemsInput) {
    return this.storage.listContextItems({ namespace: input.namespace, ...(input.item_type ? { item_type: input.item_type } : {}), ...(input.status ? { status: input.status } : {}), ...(input.tag ? { tag: input.tag } : {}), includeArchived: input.include_archived ?? false, ...(input.now ? { now: input.now } : {}) });
  }
  searchItems(input: SearchItemsInput) {
    const now = input.now ?? nowIso();
    return this.storage.searchContextItems({ namespace: input.namespace, query: input.query, ...(input.item_type ? { item_type: input.item_type } : {}), ...(input.status ? { status: input.status } : {}), includeArchived: input.include_archived ?? false, now } satisfies SearchContextItemsFilters).sort((left, right) => compareRank(left, right, input.query, now));
  }
  archiveItem(id: string) { const updated = this.storage.archiveContextItem(id, nowIso()); if (!updated) throw new Error(`Context item not found: ${id}`); return updated; }
  pinItem(id: string) { const updated = this.storage.pinContextItem(id, nowIso()); if (!updated) throw new Error(`Context item not found: ${id}`); return updated; }
  buildContextPack(input: ContextPackRequestV1) {
    const request = ContextPackRequestV1Schema.parse({ namespace: input.namespace, task_query: input.task_query ?? null, max_items: input.max_items ?? null, include_types: input.include_types ?? null, exclude_archived: input.exclude_archived, now: input.now ?? null });
    const now = request.now ?? nowIso();
    const ranked = this.storage.listContextItems({ namespace: request.namespace, includeArchived: !request.exclude_archived, now })
      .filter((item) => !request.include_types || request.include_types.includes(item.item_type))
      .filter((item) => effectiveStatus(item, now) !== "expired")
      .sort((left, right) => compareRank(left, right, request.task_query, now))
      .slice(0, request.max_items ?? DEFAULT_MAX_ITEMS);
    const items: ContextPackEntryV1[] = ranked.map((item) => ({ id: item.id, item_type: item.item_type, content: item.content, priority: item.priority, status: effectiveStatus(item, now), source_type: item.source_type, source_reference: item.source_reference, reason_included: reasonIncluded(item, request.task_query, now) }));
    const pack = { namespace: request.namespace, generated_at: now, task_query: request.task_query, items, rendered_text: "" };
    return ContextPackV1Schema.parse({ ...pack, rendered_text: renderContextPack(pack) });
  }
}

export const createContextSidecarService = (rootPath: string) => new ContextSidecarService(createStorage(rootPath));
