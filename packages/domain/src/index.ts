import { z } from "zod";

export const SchemaVersionV1 = z.literal(1);

const IsoDateTime = z.string().datetime({ offset: true });
const Id = z.string().min(1);
const NullableText = z.string().nullable().optional();

export const ProjectV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  name: z.string().min(1),
  description: NullableText,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  storage: z.object({
    rootPath: z.string().min(1),
    databasePath: z.string().min(1)
  }),
  settings: z
    .object({
      defaultMode: z.enum(["brief", "decision_memo", "deck_outline"]).default("brief"),
      provider: z.string().default("mock"),
      locale: z.string().default("en")
    })
    .default({
      defaultMode: "brief",
      provider: "mock",
      locale: "en"
    })
});

export const SourceKindV1Schema = z.enum([
  "text",
  "markdown",
  "pdf",
  "url",
  "transcript",
  "image"
]);

export const SourceExtractionQualityV1Schema = z.enum([
  "high",
  "medium",
  "low",
  "failed"
]);

export const SourceV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  projectId: Id,
  kind: SourceKindV1Schema,
  title: z.string().min(1),
  originalUri: NullableText,
  checksum: z.string().min(1),
  extractionQuality: SourceExtractionQualityV1Schema,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  provenance: z.object({
    sourceName: z.string().min(1),
    sourceUri: NullableText,
    importedBy: z.string().default("local")
  }),
  assetIds: z.array(Id).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const SourceAssetKindV1Schema = z.enum([
  "raw",
  "normalized",
  "extracted_text",
  "ocr_text",
  "snapshot",
  "transcript"
]);

export const SourceAssetV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  sourceId: Id,
  kind: SourceAssetKindV1Schema,
  mimeType: z.string().min(1),
  uri: z.string().min(1),
  checksum: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  createdAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const ChunkV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  projectId: Id,
  sourceId: Id,
  assetId: Id.nullable().optional(),
  index: z.number().int().nonnegative(),
  content: z.string().min(1),
  tokenEstimate: z.number().int().nonnegative(),
  quality: SourceExtractionQualityV1Schema,
  createdAt: IsoDateTime,
  locator: z
    .object({
      start: z.number().int().nonnegative().optional(),
      end: z.number().int().nonnegative().optional(),
      page: z.number().int().positive().optional(),
      timestamp: z.string().optional()
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const SynthesisModeV1Schema = z.enum(["brief", "decision_memo", "deck_outline"]);

export const SynthesisRequestV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  projectId: Id,
  mode: SynthesisModeV1Schema,
  title: z.string().min(1),
  question: NullableText,
  audience: NullableText,
  sourceIds: z.array(Id).default([]),
  desiredDirections: z.number().int().min(2).max(3).default(3),
  createdAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const ThemeClusterV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  synthesisId: Id,
  label: z.string().min(1),
  summary: z.string().min(1),
  chunkIds: z.array(Id),
  evidenceCount: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  createdAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const ContradictionSeverityV1Schema = z.enum(["low", "medium", "high"]);

export const ContradictionV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  synthesisId: Id,
  claimA: z.string().min(1),
  claimB: z.string().min(1),
  description: z.string().min(1),
  severity: ContradictionSeverityV1Schema,
  evidenceChunkIds: z.array(Id),
  status: z.enum(["open", "resolved", "needs_review"]).default("open"),
  confidence: z.number().min(0).max(1),
  createdAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const CitationSupportTypeV1Schema = z.enum(["direct", "inferred"]);

export const CitationV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  synthesisId: Id,
  sectionId: Id,
  chunkId: Id,
  sourceId: Id,
  excerpt: z.string().min(1),
  locator: z
    .object({
      page: z.number().int().positive().optional(),
      start: z.number().int().nonnegative().optional(),
      end: z.number().int().nonnegative().optional(),
      timestamp: z.string().optional()
    })
    .optional(),
  supportType: CitationSupportTypeV1Schema,
  confidence: z.number().min(0).max(1),
  createdAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const DraftSectionV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  synthesisId: Id,
  key: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  citations: z.array(CitationV1Schema),
  confidence: z.number().min(0).max(1),
  status: z.enum(["draft", "needs_revision", "final"]).default("draft"),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const DraftV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  synthesisId: Id,
  mode: SynthesisModeV1Schema,
  title: z.string().min(1),
  summary: z.string().min(1),
  directions: z.array(
    z.object({
      id: Id,
      label: z.string().min(1),
      rationale: z.string().min(1),
      evidenceChunkIds: z.array(Id)
    })
  ),
  sections: z.array(DraftSectionV1Schema),
  themeClusterIds: z.array(Id),
  contradictionIds: z.array(Id),
  confidenceReport: z.lazy(() => ConfidenceReportV1Schema),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  revisionIds: z.array(Id).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const ConfidenceBandV1Schema = z.enum(["low", "moderate", "high"]);

export const ConfidenceReportV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  synthesisId: Id,
  overallConfidence: ConfidenceBandV1Schema,
  explanation: z.string().min(1),
  insufficientEvidence: z.boolean(),
  sectionCoverage: z.array(
    z.object({
      sectionId: Id,
      confidence: ConfidenceBandV1Schema,
      note: z.string().min(1)
    })
  ),
  createdAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const RevisionV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  synthesisId: Id,
  sectionId: Id,
  before: z.string().min(1),
  after: z.string().min(1),
  reason: z.string().min(1),
  actor: z.string().default("local"),
  createdAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const ExportArtifactV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  synthesisId: Id,
  format: z.enum(["markdown", "json"]),
  path: z.string().min(1),
  content: z.string().min(1),
  checksum: z.string().min(1),
  createdAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const ContextItemTypeSchema = z.enum([
  "preference",
  "profile_fact",
  "project_fact",
  "task_note",
  "pinned_instruction",
  "workflow_note"
]);

export const SourceTypeSchema = z.enum([
  "user_message",
  "file",
  "url",
  "manual_entry",
  "system_note"
]);

export const ContextStatusSchema = z.enum(["active", "pinned", "archived", "expired"]);

export const ContextItemV1Schema = z.strictObject({
  id: Id,
  namespace: z.string().min(1),
  item_type: ContextItemTypeSchema,
  content: z.string().min(1),
  source_type: SourceTypeSchema,
  source_reference: z.string().nullable(),
  priority: z.number(),
  status: ContextStatusSchema,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  expires_at: IsoDateTime.nullable(),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown())
});

export const ContextItemCreateV1Schema = z.object({
  namespace: z.string().min(1),
  item_type: ContextItemTypeSchema,
  content: z.string().min(1),
  source_type: SourceTypeSchema,
  source_reference: z.string().nullable().optional(),
  priority: z.number().optional(),
  status: ContextStatusSchema.optional(),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const ContextItemUpdateV1Schema = z.object({
  content: z.string().min(1).optional(),
  priority: z.number().optional(),
  status: ContextStatusSchema.optional(),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const ContextItemListV1Schema = z.object({
  namespace: z.string().min(1),
  item_type: ContextItemTypeSchema.optional(),
  status: ContextStatusSchema.optional(),
  tag: z.string().optional()
});

export const ContextItemSearchV1Schema = z.object({
  namespace: z.string().min(1),
  query: z.string().min(1),
  item_type: ContextItemTypeSchema.optional(),
  status: ContextStatusSchema.optional()
});

export const ContextPackRequestV1Schema = z.strictObject({
  namespace: z.string().min(1),
  task_query: z.string().nullable(),
  max_items: z.number().int().positive().nullable(),
  include_types: z.array(ContextItemTypeSchema).nullable(),
  exclude_archived: z.boolean(),
  now: IsoDateTime.nullable()
});

export const ContextPackEntryV1Schema = z.strictObject({
  id: Id,
  item_type: ContextItemTypeSchema,
  content: z.string().min(1),
  priority: z.number(),
  status: ContextStatusSchema,
  source_type: SourceTypeSchema,
  source_reference: z.string().nullable(),
  reason_included: z.string().min(1)
});

export const ContextPackV1Schema = z.strictObject({
  namespace: z.string().min(1),
  generated_at: IsoDateTime,
  task_query: z.string().nullable(),
  items: z.array(ContextPackEntryV1Schema),
  rendered_text: z.string().min(1)
});

export const IngestTextRequestV1Schema = z.object({
  text: z.string().optional(),
  markdown: z.string().optional(),
  title: z.string().optional(),
  provenance: z
    .object({
      sourceName: z.string().optional(),
      sourceUri: z.string().nullable().optional(),
      importedBy: z.string().optional()
    })
    .optional()
});

export const IngestUrlRequestV1Schema = z.object({
  url: z.string().url(),
  title: z.string().optional()
});

export const IngestPathRequestV1Schema = z.object({
  filePath: z.string().min(1),
  title: z.string().optional()
});

export const IngestTranscriptRequestV1Schema = z.object({
  transcript: z.string(),
  title: z.string().optional()
});

export const SynthesisRunRequestV1Schema = z.object({
  mode: SynthesisModeV1Schema,
  title: z.string().min(1),
  question: z.string().optional(),
  audience: z.string().optional(),
  desiredDirections: z.union([z.literal(2), z.literal(3)]).optional(),
  sourceIds: z.array(z.string()).optional()
});

export const RevisionRequestV1Schema = z.object({
  sectionId: z.string().min(1),
  body: z.string().min(1),
  reason: z.string().min(1),
  actor: z.string().optional()
});

export const ExportRequestV1Schema = z.object({
  format: z.enum(["markdown", "json"])
});

export const CreateProjectRequestV1Schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaultMode: SynthesisModeV1Schema.optional()
});

export const ProjectIngestTextRequestV1Schema = IngestTextRequestV1Schema.extend({
  projectId: z.string().min(1)
});

export const ProjectIngestUrlRequestV1Schema = IngestUrlRequestV1Schema.extend({
  projectId: z.string().min(1)
});

export const ProjectIngestPathRequestV1Schema = IngestPathRequestV1Schema.extend({
  projectId: z.string().min(1)
});

export const ProjectSynthesisRequestV1Schema = SynthesisRunRequestV1Schema.extend({
  projectId: z.string().min(1)
});

export const ProviderCapabilityV1Schema = z.enum([
  "text-generation",
  "embeddings",
  "ocr",
  "transcription"
]);

export const CapabilityManifestV1Schema = z.object({
  schemaVersion: SchemaVersionV1,
  id: Id,
  name: z.string().min(1),
  version: z.string().min(1),
  transports: z.array(z.enum(["stdio", "streamable-http", "http-json", "cli"])),
  ingestKinds: z.array(SourceKindV1Schema),
  synthesisModes: z.array(SynthesisModeV1Schema),
  providerCapabilities: z.array(ProviderCapabilityV1Schema),
  features: z.array(z.string().min(1)),
  limits: z.object({
    maxSourcesPerProject: z.number().int().positive(),
    maxChunkChars: z.number().int().positive(),
    defaultChunkChars: z.number().int().positive()
  }),
  createdAt: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type ProjectV1 = z.infer<typeof ProjectV1Schema>;
export type SourceV1 = z.infer<typeof SourceV1Schema>;
export type SourceKindV1 = z.infer<typeof SourceKindV1Schema>;
export type SourceExtractionQualityV1 = z.infer<typeof SourceExtractionQualityV1Schema>;
export type SourceAssetV1 = z.infer<typeof SourceAssetV1Schema>;
export type SourceAssetKindV1 = z.infer<typeof SourceAssetKindV1Schema>;
export type ChunkV1 = z.infer<typeof ChunkV1Schema>;
export type SynthesisRequestV1 = z.infer<typeof SynthesisRequestV1Schema>;
export type SynthesisModeV1 = z.infer<typeof SynthesisModeV1Schema>;
export type ThemeClusterV1 = z.infer<typeof ThemeClusterV1Schema>;
export type ContradictionV1 = z.infer<typeof ContradictionV1Schema>;
export type ContradictionSeverityV1 = z.infer<typeof ContradictionSeverityV1Schema>;
export type DraftSectionV1 = z.infer<typeof DraftSectionV1Schema>;
export type DraftV1 = z.infer<typeof DraftV1Schema>;
export type CitationV1 = z.infer<typeof CitationV1Schema>;
export type ConfidenceReportV1 = z.infer<typeof ConfidenceReportV1Schema>;
export type ConfidenceBandV1 = z.infer<typeof ConfidenceBandV1Schema>;
export type RevisionV1 = z.infer<typeof RevisionV1Schema>;
export type ExportArtifactV1 = z.infer<typeof ExportArtifactV1Schema>;
export type ContextItemType = z.infer<typeof ContextItemTypeSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type ContextStatus = z.infer<typeof ContextStatusSchema>;
export type ContextItemV1 = z.infer<typeof ContextItemV1Schema>;
export type ContextItemCreateV1 = z.infer<typeof ContextItemCreateV1Schema>;
export type ContextItemUpdateV1 = z.infer<typeof ContextItemUpdateV1Schema>;
export type ContextItemListV1 = z.infer<typeof ContextItemListV1Schema>;
export type ContextItemSearchV1 = z.infer<typeof ContextItemSearchV1Schema>;
export type ContextPackRequestV1 = z.infer<typeof ContextPackRequestV1Schema>;
export type ContextPackEntryV1 = z.infer<typeof ContextPackEntryV1Schema>;
export type ContextPackV1 = z.infer<typeof ContextPackV1Schema>;
export type CreateProjectRequestV1 = z.infer<typeof CreateProjectRequestV1Schema>;
export type ProjectIngestTextRequestV1 = z.infer<typeof ProjectIngestTextRequestV1Schema>;
export type ProjectIngestUrlRequestV1 = z.infer<typeof ProjectIngestUrlRequestV1Schema>;
export type ProjectIngestPathRequestV1 = z.infer<typeof ProjectIngestPathRequestV1Schema>;
export type ProjectSynthesisRequestV1 = z.infer<typeof ProjectSynthesisRequestV1Schema>;
export type IngestTextRequestV1 = z.infer<typeof IngestTextRequestV1Schema>;
export type IngestUrlRequestV1 = z.infer<typeof IngestUrlRequestV1Schema>;
export type IngestPathRequestV1 = z.infer<typeof IngestPathRequestV1Schema>;
export type IngestTranscriptRequestV1 = z.infer<typeof IngestTranscriptRequestV1Schema>;
export type SynthesisRunRequestV1 = z.infer<typeof SynthesisRunRequestV1Schema>;
export type RevisionRequestV1 = z.infer<typeof RevisionRequestV1Schema>;
export type ExportRequestV1 = z.infer<typeof ExportRequestV1Schema>;
export type CapabilityManifestV1 = z.infer<typeof CapabilityManifestV1Schema>;

export const SynthKitErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).default({})
});

export type SynthKitErrorShape = z.infer<typeof SynthKitErrorSchema>;

export const nowIso = () => new Date().toISOString();

export const stableStringify = (value: unknown) =>
  JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort(), 2);

export const normalizeWhitespace = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";
