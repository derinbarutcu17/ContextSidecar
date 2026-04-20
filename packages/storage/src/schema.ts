import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projectsTable = sqliteTable("projects", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const sourcesTable = sqliteTable("sources", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  checksum: text("checksum").notNull(),
  extractionQuality: text("extraction_quality").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const sourceAssetsTable = sqliteTable("source_assets", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  kind: text("kind").notNull(),
  checksum: text("checksum").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull()
});

export const chunksTable = sqliteTable("chunks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  sourceId: text("source_id").notNull(),
  assetId: text("asset_id"),
  chunkIndex: integer("chunk_index").notNull(),
  checksum: text("checksum").notNull(),
  content: text("content").notNull(),
  tokenEstimate: integer("token_estimate").notNull(),
  quality: text("quality").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull()
});

export const synthesesTable = sqliteTable("syntheses", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  requestId: text("request_id").notNull(),
  mode: text("mode").notNull(),
  title: text("title").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const draftSectionsTable = sqliteTable("draft_sections", {
  id: text("id").primaryKey(),
  synthesisId: text("synthesis_id").notNull(),
  sectionKey: text("section_key").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const citationsTable = sqliteTable("citations", {
  id: text("id").primaryKey(),
  synthesisId: text("synthesis_id").notNull(),
  sectionId: text("section_id").notNull(),
  chunkId: text("chunk_id").notNull(),
  sourceId: text("source_id").notNull(),
  supportType: text("support_type").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull()
});

export const contradictionsTable = sqliteTable("contradictions", {
  id: text("id").primaryKey(),
  synthesisId: text("synthesis_id").notNull(),
  severity: text("severity").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull()
});

export const themeClustersTable = sqliteTable("theme_clusters", {
  id: text("id").primaryKey(),
  synthesisId: text("synthesis_id").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull()
});

export const revisionsTable = sqliteTable("revisions", {
  id: text("id").primaryKey(),
  synthesisId: text("synthesis_id").notNull(),
  sectionId: text("section_id").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull()
});

export const exportArtifactsTable = sqliteTable("export_artifacts", {
  id: text("id").primaryKey(),
  synthesisId: text("synthesis_id").notNull(),
  format: text("format").notNull(),
  path: text("path").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull()
});

export const contextItemsTable = sqliteTable("context_items", {
  id: text("id").primaryKey(),
  namespace: text("namespace").notNull(),
  itemType: text("item_type").notNull(),
  status: text("status").notNull(),
  priority: integer("priority").notNull(),
  content: text("content").notNull(),
  expiresAt: text("expires_at"),
  tagsJson: text("tags_json").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});
