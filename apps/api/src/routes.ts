import { z } from "zod";
import {
  CapabilityManifestV1Schema,
  CitationV1Schema,
  ContextItemV1Schema,
  ContextPackRequestV1Schema,
  ContextPackV1Schema,
  ContradictionV1Schema,
  DraftV1Schema,
  ExportArtifactV1Schema,
  ProjectV1Schema,
  RevisionV1Schema,
  SynthesisModeV1Schema
} from "@context-sidecar/domain";

const ResponseEnvelopeSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    ok: z.literal(true),
    data: schema
  });

const ErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});

const createProjectRequest = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaultMode: SynthesisModeV1Schema.optional()
});

const ingestTextRequest = z.object({
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

const ingestUrlRequest = z.object({
  url: z.string().url(),
  title: z.string().optional()
});

const ingestPathRequest = z.object({
  filePath: z.string().min(1),
  title: z.string().optional()
});

const ingestTranscriptRequest = z.object({
  transcript: z.string(),
  title: z.string().optional()
});

const synthesisRequest = z.object({
  mode: SynthesisModeV1Schema,
  title: z.string().min(1),
  question: z.string().optional(),
  audience: z.string().optional(),
  desiredDirections: z.union([z.literal(2), z.literal(3)]).optional(),
  sourceIds: z.array(z.string()).optional()
});

const revisionRequest = z.object({
  sectionId: z.string().min(1),
  body: z.string().min(1),
  reason: z.string().min(1),
  actor: z.string().optional()
});

const exportRequest = z.object({ format: z.enum(["markdown", "json"]) });
const contextCreateRequest = ContextItemV1Schema.omit({ id: true, created_at: true, updated_at: true });
const contextUpdateRequest = z.object({ content: z.string().min(1).optional(), priority: z.number().optional(), status: z.enum(["active", "pinned", "archived", "expired"]).optional(), expires_at: z.string().datetime({ offset: true }).nullable().optional(), tags: z.array(z.string()).optional(), metadata: z.record(z.string(), z.unknown()).optional() });
const contextSearchRequest = z.object({ namespace: z.string().min(1), query: z.string().min(1), item_type: z.enum(["preference", "profile_fact", "project_fact", "task_note", "pinned_instruction", "workflow_note"]).optional(), status: z.enum(["active", "pinned", "archived", "expired"]).optional() });

export type RouteMethod = "get" | "post" | "patch";

export interface RouteDefinition {
  method: RouteMethod;
  path: string;
  summary: string;
  requestBody?: z.ZodTypeAny;
  responses: Record<number, z.ZodTypeAny>;
  parameters?: Array<{ name: string; in: "path"; required: true; schema: z.ZodTypeAny }>;
  handlerName: string;
}

export const apiRouteDefinitions: RouteDefinition[] = [
  { method: "get", path: "/health", summary: "Health check", responses: { 200: ResponseEnvelopeSchema(z.object({ status: z.literal("ok"), rootPath: z.string() })) }, handlerName: "health" },
  { method: "post", path: "/context", summary: "Create context item", requestBody: contextCreateRequest, responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema), 400: ErrorEnvelopeSchema }, handlerName: "contextCreate" },
  { method: "patch", path: "/context/:id", summary: "Update context item", parameters: [{ name: "id", in: "path", required: true, schema: z.string() }], requestBody: contextUpdateRequest, responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema), 400: ErrorEnvelopeSchema, 404: ErrorEnvelopeSchema }, handlerName: "contextUpdate" },
  { method: "get", path: "/context/:id", summary: "Get context item", parameters: [{ name: "id", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "contextGet" },
  { method: "get", path: "/context", summary: "List context items", responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema.array()), 400: ErrorEnvelopeSchema }, handlerName: "contextList" },
  { method: "post", path: "/context/search", summary: "Search context items", requestBody: contextSearchRequest, responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema.array()), 400: ErrorEnvelopeSchema }, handlerName: "contextSearch" },
  { method: "post", path: "/context/pack", summary: "Build context pack", requestBody: ContextPackRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(ContextPackV1Schema), 400: ErrorEnvelopeSchema }, handlerName: "contextPack" },
  { method: "post", path: "/context/:id/archive", summary: "Archive context item", parameters: [{ name: "id", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "contextArchive" },
  { method: "post", path: "/context/:id/pin", summary: "Pin context item", parameters: [{ name: "id", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "contextPin" },
  { method: "get", path: "/v1/health", summary: "Health check", responses: { 200: ResponseEnvelopeSchema(z.object({ status: z.literal("ok"), rootPath: z.string() })) }, handlerName: "healthV1" },
  { method: "get", path: "/version", summary: "Version", responses: { 200: ResponseEnvelopeSchema(z.object({ version: z.string() })) }, handlerName: "version" },
  { method: "get", path: "/v1/version", summary: "Version", responses: { 200: ResponseEnvelopeSchema(z.object({ version: z.string() })) }, handlerName: "versionV1" },
  { method: "get", path: "/capabilities", summary: "Capability manifest", responses: { 200: ResponseEnvelopeSchema(CapabilityManifestV1Schema) }, handlerName: "capabilities" },
  { method: "get", path: "/v1/capabilities", summary: "Capability manifest", responses: { 200: ResponseEnvelopeSchema(CapabilityManifestV1Schema) }, handlerName: "capabilitiesV1" },
  { method: "get", path: "/v1/openapi.json", summary: "OpenAPI document", responses: { 200: z.any() }, handlerName: "openapi" },
  { method: "get", path: "/v1/projects", summary: "List projects", responses: { 200: ResponseEnvelopeSchema(ProjectV1Schema.array()) }, handlerName: "listProjects" },
  { method: "post", path: "/v1/projects", summary: "Create project", requestBody: createProjectRequest, responses: { 200: ResponseEnvelopeSchema(ProjectV1Schema), 400: ErrorEnvelopeSchema }, handlerName: "createProject" },
  { method: "get", path: "/v1/projects/:projectId", summary: "Get project", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ProjectV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "getProject" },
  { method: "post", path: "/v1/projects/:projectId/ingest/text", summary: "Ingest text", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: ingestTextRequest, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestText" },
  { method: "post", path: "/v1/projects/:projectId/ingest/markdown", summary: "Ingest markdown", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: ingestTextRequest, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestMarkdown" },
  { method: "post", path: "/v1/projects/:projectId/ingest/url", summary: "Ingest URL", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: ingestUrlRequest, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestUrl" },
  { method: "post", path: "/v1/projects/:projectId/ingest/pdf", summary: "Ingest PDF", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: ingestPathRequest, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestPdf" },
  { method: "post", path: "/v1/projects/:projectId/ingest/image", summary: "Ingest image", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: ingestPathRequest, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestImage" },
  { method: "post", path: "/v1/projects/:projectId/ingest/transcript", summary: "Ingest transcript", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: ingestTranscriptRequest, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestTranscript" },
  { method: "post", path: "/v1/projects/:projectId/synthesize", summary: "Run synthesis", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: synthesisRequest, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "synthesize" },
  { method: "get", path: "/v1/syntheses/:synthesisId", summary: "Get draft", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(DraftV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "getSynthesis" },
  { method: "get", path: "/v1/syntheses/:synthesisId/draft", summary: "Get synthesis draft", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(DraftV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "getDraft" },
  { method: "get", path: "/v1/syntheses/:synthesisId/citations", summary: "Get citations", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(CitationV1Schema.array()) }, handlerName: "getCitations" },
  { method: "get", path: "/v1/syntheses/:synthesisId/contradictions", summary: "Get contradictions", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ContradictionV1Schema.array()) }, handlerName: "getContradictions" },
  { method: "get", path: "/v1/syntheses/:synthesisId/revisions", summary: "Get revisions", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(RevisionV1Schema.array()) }, handlerName: "getRevisions" },
  { method: "post", path: "/v1/syntheses/:synthesisId/revisions", summary: "Revise a section", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], requestBody: revisionRequest, responses: { 200: ResponseEnvelopeSchema(RevisionV1Schema), 400: ErrorEnvelopeSchema }, handlerName: "reviseSection" },
  { method: "get", path: "/v1/syntheses/:synthesisId/export", summary: "List export artifacts", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ExportArtifactV1Schema.array()) }, handlerName: "listExports" },
  { method: "post", path: "/v1/syntheses/:synthesisId/export", summary: "Export synthesis", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], requestBody: exportRequest, responses: { 200: ResponseEnvelopeSchema(ExportArtifactV1Schema), 400: ErrorEnvelopeSchema }, handlerName: "exportSynthesis" },
  { method: "get", path: "/v1/syntheses/:synthesisId/stages", summary: "Get synthesis stages", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(z.array(z.any())), 404: ErrorEnvelopeSchema }, handlerName: "getStages" }
];

export const routeSchemas = {
  createProjectRequest,
  ingestTextRequest,
  ingestUrlRequest,
  ingestPathRequest,
  ingestTranscriptRequest,
  synthesisRequest,
  revisionRequest,
  exportRequest,
  contextCreateRequest,
  contextUpdateRequest,
  contextSearchRequest,
  responseEnvelope: ResponseEnvelopeSchema,
  errorEnvelope: ErrorEnvelopeSchema
};
