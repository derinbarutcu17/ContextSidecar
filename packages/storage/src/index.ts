import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  CapabilityManifestV1Schema,
  CitationV1Schema,
  ContextItemV1Schema,
  ContradictionV1Schema,
  DraftV1Schema,
  ExportArtifactV1Schema,
  type CapabilityManifestV1,
  type ChunkV1,
  type ConfidenceReportV1,
  type ContextItemType,
  type ContextItemV1,
  type ContextStatus,
  type ContradictionV1,
  type DraftSectionV1,
  type DraftV1,
  type ExportArtifactV1,
  type ProjectV1,
  type RevisionV1,
  type SourceAssetV1,
  type SourceV1,
  type SynthesisRequestV1,
  RevisionV1Schema,
  type ThemeClusterV1,
  nowIso
} from "@synthkit/domain";
import { sha256 } from "@synthkit/shared";

type SqliteDb = Database.Database;

export interface SynthKitPaths {
  rootPath: string;
  databasePath: string;
}

export interface StorageRecordSet {
  project?: ProjectV1;
  sources: SourceV1[];
  assets: SourceAssetV1[];
  chunks: ChunkV1[];
  synthesis?: {
    request: SynthesisRequestV1;
    draft?: DraftV1;
    confidenceReport?: ConfidenceReportV1;
    stageTrace?: Array<{
      stage: string;
      startedAt: string;
      finishedAt: string;
      inputSummary: string;
      outputSummary: string;
    }>;
  };
  sections: DraftSectionV1[];
  themeClusters: ThemeClusterV1[];
  contradictions: ContradictionV1[];
  revisions: RevisionV1[];
  exports: ExportArtifactV1[];
}

export interface SynthesisRecord {
  request: SynthesisRequestV1;
  draft?: DraftV1;
  confidenceReport?: ConfidenceReportV1;
  stageTrace?: Array<{
    stage: string;
    startedAt: string;
    finishedAt: string;
    inputSummary: string;
    outputSummary: string;
  }>;
}

export interface CreateContextItemInput {
  id: string;
  namespace: string;
  item_type: ContextItemType;
  content: string;
  source_type: ContextItemV1["source_type"];
  source_reference: string | null;
  priority: number;
  status: ContextStatus;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface UpdateContextItemInput {
  content?: string;
  priority?: number;
  status?: ContextStatus;
  expires_at?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  updated_at: string;
}

export interface ListContextItemsFilters {
  namespace: string;
  item_type?: ContextItemType;
  status?: ContextStatus;
  tag?: string;
  includeArchived?: boolean;
  now?: string;
}

export interface SearchContextItemsFilters {
  namespace: string;
  query: string;
  item_type?: ContextItemType;
  status?: ContextStatus;
  includeArchived?: boolean;
  now?: string;
}

const ensureDir = (dir: string) => fs.mkdirSync(dir, { recursive: true });

const initSqlite = (db: SqliteDb) => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      checksum TEXT NOT NULL,
      extraction_quality TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_assets (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      checksum TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      asset_id TEXT,
      chunk_index INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      content TEXT NOT NULL,
      token_estimate INTEGER NOT NULL,
      quality TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS syntheses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      title TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS draft_sections (
      id TEXT PRIMARY KEY,
      synthesis_id TEXT NOT NULL,
      section_key TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS citations (
      id TEXT PRIMARY KEY,
      synthesis_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      support_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contradictions (
      id TEXT PRIMARY KEY,
      synthesis_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS theme_clusters (
      id TEXT PRIMARY KEY,
      synthesis_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      synthesis_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS export_artifacts (
      id TEXT PRIMARY KEY,
      synthesis_id TEXT NOT NULL,
      format TEXT NOT NULL,
      path TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS context_items (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      item_type TEXT NOT NULL,
      status TEXT NOT NULL,
      priority REAL NOT NULL,
      content TEXT NOT NULL,
      expires_at TEXT,
      tags_json TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
};

const parseJson = <T>(input: string): T => JSON.parse(input) as T;

const stringifyJson = (input: unknown) => JSON.stringify(input);

const scoreTextMatch = (content: string, query: string) => {
  const terms = query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
  const haystack = content.toLowerCase();
  return terms.reduce((score, term) => (haystack.includes(term) ? score + 1 : score), 0);
};

const effectiveContextStatus = (item: ContextItemV1, now: string) => {
  if (item.expires_at && item.expires_at <= now) return "expired" as const;
  return item.status;
};

const shouldIncludeContextItem = (
  item: ContextItemV1,
  filters: Pick<ListContextItemsFilters, "status" | "includeArchived" | "now">
) => {
  const effectiveStatus = effectiveContextStatus(item, filters.now ?? nowIso());
  if (effectiveStatus === "expired") return filters.status === "expired";
  if (!filters.includeArchived && effectiveStatus === "archived") return false;
  if (filters.status) return effectiveStatus === filters.status;
  return true;
};

export class SynthKitStorage {
  readonly db: SqliteDb;
  readonly paths: SynthKitPaths;

  constructor(paths: SynthKitPaths) {
    this.paths = paths;
    ensureDir(path.dirname(paths.databasePath));
    ensureDir(paths.rootPath);
    this.db = new Database(paths.databasePath);
    initSqlite(this.db);
  }

  close() {
    this.db.close();
  }

  getManifest(): CapabilityManifestV1 {
    return CapabilityManifestV1Schema.parse({
      schemaVersion: 1,
      id: "capabilities",
      name: "synthkit",
      version: "0.1.0",
      transports: ["stdio", "http-json", "cli"],
      ingestKinds: ["text", "markdown", "pdf", "url", "transcript", "image"],
      synthesisModes: ["brief", "decision_memo", "deck_outline"],
      providerCapabilities: ["text-generation", "embeddings", "ocr", "transcription"],
      features: [
        "project-lifecycle",
        "citation-mapping",
        "contradiction-detection",
        "revision-history",
        "mock-provider"
      ],
      limits: {
        maxSourcesPerProject: 250,
        maxChunkChars: 1600,
        defaultChunkChars: 900
      },
      createdAt: nowIso(),
      metadata: { storage: "sqlite" }
    });
  }

  ensureProject(project: ProjectV1) {
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, data, created_at, updated_at)
      VALUES (@id, @data, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `);
    stmt.run({
      id: project.id,
      data: stringifyJson(project),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    });
    return project;
  }

  listProjects(): ProjectV1[] {
    const rows = this.db
      .prepare(`SELECT data FROM projects ORDER BY created_at DESC`)
      .all() as Array<{ data: string }>;
    return rows.map((row) => parseJson<ProjectV1>(row.data));
  }

  getProject(projectId: string): ProjectV1 | undefined {
    const row = this.db
      .prepare(`SELECT data FROM projects WHERE id = ?`)
      .get(projectId) as { data?: string } | undefined;
    return row?.data ? parseJson<ProjectV1>(row.data) : undefined;
  }

  upsertSource(source: SourceV1) {
    this.db.prepare(`
      INSERT INTO sources (id, project_id, kind, checksum, extraction_quality, data, created_at, updated_at)
      VALUES (@id, @projectId, @kind, @checksum, @extractionQuality, @data, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        checksum = excluded.checksum,
        extraction_quality = excluded.extraction_quality,
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run({
      id: source.id,
      projectId: source.projectId,
      kind: source.kind,
      checksum: source.checksum,
      extractionQuality: source.extractionQuality,
      data: stringifyJson(source),
      createdAt: source.createdAt,
      updatedAt: source.updatedAt
    });
    return source;
  }

  listSources(projectId: string): SourceV1[] {
    const rows = this.db
      .prepare(`SELECT data FROM sources WHERE project_id = ? ORDER BY created_at ASC`)
      .all(projectId) as Array<{ data: string }>;
    return rows.map((row) => parseJson<SourceV1>(row.data));
  }

  getSource(sourceId: string): SourceV1 | undefined {
    const row = this.db
      .prepare(`SELECT data FROM sources WHERE id = ?`)
      .get(sourceId) as { data?: string } | undefined;
    return row?.data ? parseJson<SourceV1>(row.data) : undefined;
  }

  upsertAsset(asset: SourceAssetV1) {
    this.db.prepare(`
      INSERT INTO source_assets (id, source_id, kind, checksum, data, created_at)
      VALUES (@id, @sourceId, @kind, @checksum, @data, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        checksum = excluded.checksum,
        data = excluded.data
    `).run({
      id: asset.id,
      sourceId: asset.sourceId,
      kind: asset.kind,
      checksum: asset.checksum,
      data: stringifyJson(asset),
      createdAt: asset.createdAt
    });
    return asset;
  }

  listAssets(sourceId: string): SourceAssetV1[] {
    const rows = this.db
      .prepare(`SELECT data FROM source_assets WHERE source_id = ? ORDER BY created_at ASC`)
      .all(sourceId) as Array<{ data: string }>;
    return rows.map((row) => parseJson<SourceAssetV1>(row.data));
  }

  insertChunk(chunk: ChunkV1) {
    this.db.prepare(`
      INSERT INTO chunks (id, project_id, source_id, asset_id, chunk_index, checksum, content, token_estimate, quality, data, created_at)
      VALUES (@id, @projectId, @sourceId, @assetId, @index, @checksum, @content, @tokenEstimate, @quality, @data, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        checksum = excluded.checksum,
        content = excluded.content,
        token_estimate = excluded.token_estimate,
        quality = excluded.quality,
        data = excluded.data
    `).run({
      id: chunk.id,
      projectId: chunk.projectId,
      sourceId: chunk.sourceId,
      assetId: chunk.assetId ?? null,
      index: chunk.index,
      checksum: sha256(chunk.content),
      content: chunk.content,
      tokenEstimate: chunk.tokenEstimate,
      quality: chunk.quality,
      data: stringifyJson(chunk),
      createdAt: chunk.createdAt
    });
    return chunk;
  }

  listChunks(projectId: string): ChunkV1[] {
    const rows = this.db
      .prepare(`SELECT data FROM chunks WHERE project_id = ? ORDER BY chunk_index ASC`)
      .all(projectId) as Array<{ data: string }>;
    return rows.map((row) => parseJson<ChunkV1>(row.data));
  }

  getChunksBySource(sourceId: string): ChunkV1[] {
    const rows = this.db
      .prepare(`SELECT data FROM chunks WHERE source_id = ? ORDER BY chunk_index ASC`)
      .all(sourceId) as Array<{ data: string }>;
    return rows.map((row) => parseJson<ChunkV1>(row.data));
  }

  saveSynthesis(row: { id: string; request: SynthesisRequestV1; draft: DraftV1; confidenceReport: ConfidenceReportV1; stageTrace?: SynthesisRecord["stageTrace"] }) {
    this.db.prepare(`
      INSERT INTO syntheses (id, project_id, request_id, mode, title, data, created_at, updated_at)
      VALUES (@id, @projectId, @requestId, @mode, @title, @data, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run({
      id: row.id,
      projectId: row.request.projectId,
      requestId: row.request.id,
      mode: row.request.mode,
      title: row.request.title,
      data: stringifyJson({
        request: row.request,
        draft: row.draft,
        confidenceReport: row.confidenceReport,
        stageTrace: row.stageTrace ?? []
      }),
      createdAt: row.draft.createdAt,
      updatedAt: row.draft.updatedAt
    });
    this.saveSections(row.draft.sections);
    return row.draft;
  }

  saveSections(sections: DraftSectionV1[]) {
    for (const section of sections) {
      this.db.prepare(`
        INSERT INTO draft_sections (id, synthesis_id, section_key, data, created_at, updated_at)
        VALUES (@id, @synthesisId, @sectionKey, @data, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          section_key = excluded.section_key,
          data = excluded.data,
          updated_at = excluded.updated_at
      `).run({
        id: section.id,
        synthesisId: section.synthesisId,
        sectionKey: section.key,
        data: stringifyJson(section),
        createdAt: section.createdAt,
        updatedAt: section.updatedAt
      });
    }
  }

  saveThemeClusters(themeClusterIds: string[], synthesisId: string) {
    for (const id of themeClusterIds) {
      this.db.prepare(`
        INSERT OR IGNORE INTO theme_clusters (id, synthesis_id, data, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, synthesisId, stringifyJson({ id, synthesisId }), nowIso());
    }
  }

  upsertThemeCluster(cluster: ThemeClusterV1) {
    this.db.prepare(`
      INSERT INTO theme_clusters (id, synthesis_id, data, created_at)
      VALUES (@id, @synthesisId, @data, @createdAt)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run({
      id: cluster.id,
      synthesisId: cluster.synthesisId,
      data: stringifyJson(cluster),
      createdAt: cluster.createdAt
    });
    return cluster;
  }

  upsertContradiction(item: ContradictionV1) {
    this.db.prepare(`
      INSERT INTO contradictions (id, synthesis_id, severity, data, created_at)
      VALUES (@id, @synthesisId, @severity, @data, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        severity = excluded.severity,
        data = excluded.data
    `).run({
      id: item.id,
      synthesisId: item.synthesisId,
      severity: item.severity,
      data: stringifyJson(item),
      createdAt: item.createdAt
    });
    return item;
  }

  upsertCitation(item: { id: string; synthesisId: string; sectionId: string; chunkId: string; sourceId: string; supportType: string; data: unknown; createdAt: string }) {
    this.db.prepare(`
      INSERT INTO citations (id, synthesis_id, section_id, chunk_id, source_id, support_type, data, created_at)
      VALUES (@id, @synthesisId, @sectionId, @chunkId, @sourceId, @supportType, @data, @createdAt)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run({
      ...item,
      data: stringifyJson(item.data)
    });
  }

  upsertRevision(revision: RevisionV1) {
    this.db.prepare(`
      INSERT INTO revisions (id, synthesis_id, section_id, data, created_at)
      VALUES (@id, @synthesisId, @sectionId, @data, @createdAt)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run({
      id: revision.id,
      synthesisId: revision.synthesisId,
      sectionId: revision.sectionId,
      data: stringifyJson(revision),
      createdAt: revision.createdAt
    });
    return revision;
  }

  upsertExportArtifact(artifact: ExportArtifactV1) {
    this.db.prepare(`
      INSERT INTO export_artifacts (id, synthesis_id, format, path, data, created_at)
      VALUES (@id, @synthesisId, @format, @path, @data, @createdAt)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run({
      id: artifact.id,
      synthesisId: artifact.synthesisId,
      format: artifact.format,
      path: artifact.path,
      data: stringifyJson(artifact),
      createdAt: artifact.createdAt
    });
    return artifact;
  }

  getSynthesisRecord(synthesisId: string): SynthesisRecord | undefined {
    const row = this.db
      .prepare(`SELECT data FROM syntheses WHERE id = ?`)
      .get(synthesisId) as { data?: string } | undefined;
    return row?.data ? parseJson<SynthesisRecord>(row.data) : undefined;
  }

  getDraft(synthesisId: string): DraftV1 | undefined {
    const record = this.getSynthesisRecord(synthesisId);
    return record?.draft ? DraftV1Schema.parse(record.draft) : undefined;
  }

  listCitations(synthesisId: string) {
    const rows = this.db
      .prepare(`SELECT data FROM citations WHERE synthesis_id = ? ORDER BY created_at ASC`)
      .all(synthesisId) as Array<{ data: string }>;
    return rows.map((row) => CitationV1Schema.parse(parseJson(row.data)));
  }

  listContradictions(synthesisId: string) {
    const rows = this.db
      .prepare(`SELECT data FROM contradictions WHERE synthesis_id = ? ORDER BY created_at ASC`)
      .all(synthesisId) as Array<{ data: string }>;
    return rows.map((row) => ContradictionV1Schema.parse(parseJson(row.data)));
  }

  listRevisions(synthesisId: string) {
    const rows = this.db
      .prepare(`SELECT data FROM revisions WHERE synthesis_id = ? ORDER BY created_at ASC`)
      .all(synthesisId) as Array<{ data: string }>;
    return rows.map((row) => RevisionV1Schema.parse(parseJson(row.data)));
  }

  listExports(synthesisId: string) {
    const rows = this.db
      .prepare(`SELECT data FROM export_artifacts WHERE synthesis_id = ? ORDER BY created_at ASC`)
      .all(synthesisId) as Array<{ data: string }>;
    return rows.map((row) => ExportArtifactV1Schema.parse(parseJson(row.data)));
  }

  createContextItem(input: CreateContextItemInput) {
    const item = ContextItemV1Schema.parse(input);
    this.db.prepare(`
      INSERT INTO context_items (
        id, namespace, item_type, status, priority, content, expires_at, tags_json, data, created_at, updated_at
      ) VALUES (
        @id, @namespace, @item_type, @status, @priority, @content, @expires_at, @tags_json, @data, @created_at, @updated_at
      )
    `).run({ ...item, tags_json: stringifyJson(item.tags), data: stringifyJson(item) });
    return item;
  }

  updateContextItem(id: string, input: UpdateContextItemInput) {
    const existing = this.getContextItem(id);
    if (!existing) return undefined;
    const item = ContextItemV1Schema.parse({ ...existing, ...input, created_at: existing.created_at, updated_at: input.updated_at });
    this.db.prepare(`
      UPDATE context_items
      SET status=@status, priority=@priority, content=@content, expires_at=@expires_at, tags_json=@tags_json, data=@data, updated_at=@updated_at
      WHERE id=@id
    `).run({ ...item, tags_json: stringifyJson(item.tags), data: stringifyJson(item) });
    return item;
  }

  getContextItem(id: string) {
    const row = this.db.prepare(`SELECT data FROM context_items WHERE id = ?`).get(id) as { data?: string } | undefined;
    return row?.data ? ContextItemV1Schema.parse(parseJson(row.data)) : undefined;
  }

  listContextItems(filters: ListContextItemsFilters) {
    const rows = this.db.prepare(`SELECT data FROM context_items WHERE namespace = ? ORDER BY created_at DESC, id ASC`).all(filters.namespace) as Array<{ data: string }>;
    return rows
      .map((row) => ContextItemV1Schema.parse(parseJson(row.data)))
      .filter((item) => !filters.item_type || item.item_type === filters.item_type)
      .filter((item) => !filters.tag || item.tags.includes(filters.tag))
      .filter((item) => shouldIncludeContextItem(item, filters))
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.updated_at.localeCompare(left.updated_at) || left.id.localeCompare(right.id));
  }

  searchContextItems(filters: SearchContextItemsFilters) {
    return this.listContextItems(filters)
      .filter((item) => scoreTextMatch([item.content, item.tags.join(" "), JSON.stringify(item.metadata)].join(" "), filters.query) > 0)
      .sort((left, right) => {
        const matchDelta =
          scoreTextMatch([right.content, right.tags.join(" "), JSON.stringify(right.metadata)].join(" "), filters.query) -
          scoreTextMatch([left.content, left.tags.join(" "), JSON.stringify(left.metadata)].join(" "), filters.query);
        if (matchDelta !== 0) return matchDelta;
        if (right.priority !== left.priority) return right.priority - left.priority;
        return right.updated_at.localeCompare(left.updated_at) || left.id.localeCompare(right.id);
      });
  }

  archiveContextItem(id: string, updatedAt = nowIso()) {
    return this.updateContextItem(id, { status: "archived", updated_at: updatedAt });
  }

  pinContextItem(id: string, updatedAt = nowIso()) {
    return this.updateContextItem(id, { status: "pinned", updated_at: updatedAt });
  }
}

export const createStorage = (rootPath: string, databasePath = path.join(rootPath, "context-sidecar.sqlite")) =>
  new SynthKitStorage({ rootPath, databasePath });
