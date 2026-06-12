import { z } from "zod";
import {
  CapabilityManifestV1Schema,
  CitationV1Schema,
  ContextItemCreateV1Schema,
  ContextItemV1Schema,
  ContextItemSearchV1Schema,
  ContextItemUpdateV1Schema,
  ContextPackRequestV1Schema,
  ContextPackV1Schema,
  ContradictionV1Schema,
  DraftV1Schema,
  ExportArtifactV1Schema,
  ExportRequestV1Schema,
  CreateProjectRequestV1Schema,
  IngestPathRequestV1Schema,
  IngestTextRequestV1Schema,
  IngestTranscriptRequestV1Schema,
  IngestUrlRequestV1Schema,
  ProjectV1Schema,
  RevisionV1Schema,
  RevisionRequestV1Schema,
  SynthesisRunRequestV1Schema
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
  { method: "post", path: "/context", summary: "Create context item", requestBody: ContextItemCreateV1Schema, responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema), 400: ErrorEnvelopeSchema }, handlerName: "contextCreate" },
  { method: "patch", path: "/context/:id", summary: "Update context item", parameters: [{ name: "id", in: "path", required: true, schema: z.string() }], requestBody: ContextItemUpdateV1Schema, responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema), 400: ErrorEnvelopeSchema, 404: ErrorEnvelopeSchema }, handlerName: "contextUpdate" },
  { method: "get", path: "/context/:id", summary: "Get context item", parameters: [{ name: "id", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "contextGet" },
  { method: "get", path: "/context", summary: "List context items", responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema.array()), 400: ErrorEnvelopeSchema }, handlerName: "contextList" },
  { method: "post", path: "/context/search", summary: "Search context items", requestBody: ContextItemSearchV1Schema, responses: { 200: ResponseEnvelopeSchema(ContextItemV1Schema.array()), 400: ErrorEnvelopeSchema }, handlerName: "contextSearch" },
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
  { method: "post", path: "/v1/projects", summary: "Create project", requestBody: CreateProjectRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(ProjectV1Schema), 400: ErrorEnvelopeSchema }, handlerName: "createProject" },
  { method: "get", path: "/v1/projects/:projectId", summary: "Get project", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ProjectV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "getProject" },
  { method: "post", path: "/v1/projects/:projectId/ingest/text", summary: "Ingest text", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: IngestTextRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestText" },
  { method: "post", path: "/v1/projects/:projectId/ingest/markdown", summary: "Ingest markdown", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: IngestTextRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestMarkdown" },
  { method: "post", path: "/v1/projects/:projectId/ingest/url", summary: "Ingest URL", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: IngestUrlRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestUrl" },
  { method: "post", path: "/v1/projects/:projectId/ingest/pdf", summary: "Ingest PDF", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: IngestPathRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestPdf" },
  { method: "post", path: "/v1/projects/:projectId/ingest/image", summary: "Ingest image", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: IngestPathRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestImage" },
  { method: "post", path: "/v1/projects/:projectId/ingest/transcript", summary: "Ingest transcript", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: IngestTranscriptRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "ingestTranscript" },
  { method: "post", path: "/v1/projects/:projectId/synthesize", summary: "Run synthesis", parameters: [{ name: "projectId", in: "path", required: true, schema: z.string() }], requestBody: SynthesisRunRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(z.any()), 400: ErrorEnvelopeSchema }, handlerName: "synthesize" },
  { method: "get", path: "/v1/syntheses/:synthesisId", summary: "Get draft", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(DraftV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "getSynthesis" },
  { method: "get", path: "/v1/syntheses/:synthesisId/draft", summary: "Get synthesis draft", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(DraftV1Schema), 404: ErrorEnvelopeSchema }, handlerName: "getDraft" },
  { method: "get", path: "/v1/syntheses/:synthesisId/citations", summary: "Get citations", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(CitationV1Schema.array()) }, handlerName: "getCitations" },
  { method: "get", path: "/v1/syntheses/:synthesisId/contradictions", summary: "Get contradictions", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ContradictionV1Schema.array()) }, handlerName: "getContradictions" },
  { method: "get", path: "/v1/syntheses/:synthesisId/revisions", summary: "Get revisions", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(RevisionV1Schema.array()) }, handlerName: "getRevisions" },
  { method: "post", path: "/v1/syntheses/:synthesisId/revisions", summary: "Revise a section", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], requestBody: RevisionRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(RevisionV1Schema), 400: ErrorEnvelopeSchema }, handlerName: "reviseSection" },
  { method: "get", path: "/v1/syntheses/:synthesisId/export", summary: "List export artifacts", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(ExportArtifactV1Schema.array()) }, handlerName: "listExports" },
  { method: "post", path: "/v1/syntheses/:synthesisId/export", summary: "Export synthesis", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], requestBody: ExportRequestV1Schema, responses: { 200: ResponseEnvelopeSchema(ExportArtifactV1Schema), 400: ErrorEnvelopeSchema }, handlerName: "exportSynthesis" },
  { method: "get", path: "/v1/syntheses/:synthesisId/stages", summary: "Get synthesis stages", parameters: [{ name: "synthesisId", in: "path", required: true, schema: z.string() }], responses: { 200: ResponseEnvelopeSchema(z.array(z.any())), 404: ErrorEnvelopeSchema }, handlerName: "getStages" }
];

export const routeSchemas = {
  contextCreateRequest: ContextItemCreateV1Schema,
  contextUpdateRequest: ContextItemUpdateV1Schema,
  contextSearchRequest: ContextItemSearchV1Schema,
  createProjectRequest: CreateProjectRequestV1Schema,
  ingestTextRequest: IngestTextRequestV1Schema,
  ingestUrlRequest: IngestUrlRequestV1Schema,
  ingestPathRequest: IngestPathRequestV1Schema,
  ingestTranscriptRequest: IngestTranscriptRequestV1Schema,
  synthesisRequest: SynthesisRunRequestV1Schema,
  revisionRequest: RevisionRequestV1Schema,
  exportRequest: ExportRequestV1Schema,
  responseEnvelope: ResponseEnvelopeSchema,
  errorEnvelope: ErrorEnvelopeSchema
};
