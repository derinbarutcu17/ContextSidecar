import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import {
  CitationV1Schema,
  ChunkV1Schema,
  ConfidenceReportV1Schema,
  CapabilityManifestV1Schema,
  ContextItemV1Schema,
  ContextPackRequestV1Schema,
  ContradictionV1Schema,
  DraftV1Schema,
  DraftSectionV1Schema,
  ExportArtifactV1Schema,
  ProjectV1Schema,
  RevisionV1Schema,
  SourceAssetV1Schema,
  SourceV1Schema,
  SynthesisRequestV1Schema,
  SynthesisModeV1Schema,
  ThemeClusterV1Schema,
  type SynthesisModeV1
} from "@synthkit/domain";
import { createContextSidecarService, SynthKitEngine, type SynthKitConfig } from "@synthkit/core";
import { ProviderConfigSchema } from "@synthkit/providers";
import { z } from "zod";
import { apiRouteDefinitions, routeSchemas } from "./routes.js";

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaultMode: SynthesisModeV1Schema.optional()
});

const SynthesisBodySchema = z.object({
  mode: SynthesisModeV1Schema,
  title: z.string().min(1),
  question: z.string().optional(),
  audience: z.string().optional(),
  desiredDirections: z.union([z.literal(2), z.literal(3)]).optional(),
  sourceIds: z.array(z.string()).optional()
});

const IngestTextSchema = z.object({
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

const IngestUrlSchema = z.object({
  url: z.string().url(),
  title: z.string().optional()
});

const IngestPathSchema = z.object({
  filePath: z.string().min(1),
  title: z.string().optional()
});

const IngestTranscriptSchema = z.object({
  transcript: z.string(),
  title: z.string().optional()
});

export interface AppServerOptions {
  rootPath?: string;
  provider?: unknown;
}

export const createAppServer = (options: AppServerOptions = {}) => {
  const rootPath = options.rootPath ?? process.env.SYNTHKIT_HOME ?? path.join(process.cwd(), ".synthkit");
  fs.mkdirSync(rootPath, { recursive: true });
  const provider = options.provider ? ProviderConfigSchema.parse(options.provider) : parseProviderEnv();
  const engine = new SynthKitEngine({ rootPath, provider });
  const contextService = createContextSidecarService(rootPath);
  const app = Fastify({
    logger: false
  });

  const ok = <T>(data: T) => ({ ok: true as const, data });
  const fail = (error: unknown) => ({
    ok: false as const,
    error: {
      code: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Unknown error"
    }
  });

  app.get("/health", async () => ok({ status: "ok", rootPath }));
  app.post("/context", async (request, reply) => {
    try {
      const body = ContextItemV1Schema.omit({ id: true, created_at: true, updated_at: true }).parse(request.body);
      return ok(contextService.addItem(body));
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  });
  app.patch("/context/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = z.object({ content: z.string().min(1).optional(), priority: z.number().optional(), status: z.enum(["active", "pinned", "archived", "expired"]).optional(), expires_at: z.string().datetime({ offset: true }).nullable().optional(), tags: z.array(z.string()).optional(), metadata: z.record(z.string(), z.unknown()).optional() }).parse(request.body);
      return ok(contextService.updateItem(id, { ...(body.content !== undefined ? { content: body.content } : {}), ...(body.priority !== undefined ? { priority: body.priority } : {}), ...(body.status !== undefined ? { status: body.status } : {}), ...(body.expires_at !== undefined ? { expires_at: body.expires_at } : {}), ...(body.tags !== undefined ? { tags: body.tags } : {}), ...(body.metadata !== undefined ? { metadata: body.metadata } : {}) }));
    } catch (error) {
      reply.code(error instanceof Error && error.message.includes("not found") ? 404 : 400);
      return fail(error);
    }
  });
  app.get("/context/:id", async (request, reply) => {
    try { const { id } = request.params as { id: string }; return ok(contextService.getItem(id)); } catch (error) { reply.code(404); return fail(error); }
  });
  app.get("/context", async (request, reply) => {
    try {
      const query = z.object({ namespace: z.string().min(1), item_type: z.enum(["preference", "profile_fact", "project_fact", "task_note", "pinned_instruction", "workflow_note"]).optional(), status: z.enum(["active", "pinned", "archived", "expired"]).optional(), tag: z.string().optional() }).parse(request.query);
      return ok(contextService.listItems({ namespace: query.namespace, ...(query.item_type !== undefined ? { item_type: query.item_type } : {}), ...(query.status !== undefined ? { status: query.status } : {}), ...(query.tag !== undefined ? { tag: query.tag } : {}) }));
    } catch (error) { reply.code(400); return fail(error); }
  });
  app.post("/context/search", async (request, reply) => {
    try {
      const body = z.object({ namespace: z.string().min(1), query: z.string().min(1), item_type: z.enum(["preference", "profile_fact", "project_fact", "task_note", "pinned_instruction", "workflow_note"]).optional(), status: z.enum(["active", "pinned", "archived", "expired"]).optional() }).parse(request.body);
      return ok(contextService.searchItems({ namespace: body.namespace, query: body.query, ...(body.item_type !== undefined ? { item_type: body.item_type } : {}), ...(body.status !== undefined ? { status: body.status } : {}) }));
    } catch (error) { reply.code(400); return fail(error); }
  });
  app.post("/context/pack", async (request, reply) => {
    try { return ok(contextService.buildContextPack(ContextPackRequestV1Schema.parse(request.body))); } catch (error) { reply.code(400); return fail(error); }
  });
  app.post("/context/:id/archive", async (request, reply) => {
    try { const { id } = request.params as { id: string }; return ok(contextService.archiveItem(id)); } catch (error) { reply.code(404); return fail(error); }
  });
  app.post("/context/:id/pin", async (request, reply) => {
    try { const { id } = request.params as { id: string }; return ok(contextService.pinItem(id)); } catch (error) { reply.code(404); return fail(error); }
  });
  app.get("/v1/health", async () => ok({ status: "ok", rootPath }));
  app.get("/version", async () => ok({ version: "0.1.0" }));
  app.get("/v1/version", async () => ok({ version: "0.1.0" }));
  app.get("/capabilities", async () => ok(engine.getManifest()));
  app.get("/v1/capabilities", async () => ok(engine.getManifest()));
  app.get("/v1/openapi.json", async (_request, reply) => {
    reply.type("application/json");
    return getOpenApi(engine.getManifest());
  });

  app.get("/v1/projects", async () => ok(engine.listProjects()));
  app.post("/v1/projects", async (request, reply) => {
    try {
      const body = CreateProjectSchema.parse(request.body);
      return ok(
        engine.createProject({
          name: body.name,
          ...(body.description ? { description: body.description } : {}),
          ...(body.defaultMode ? { defaultMode: body.defaultMode } : {})
        })
      );
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  });
  app.get("/v1/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = engine.getProject(projectId);
    if (!project) {
      reply.code(404);
      return fail(new Error("Project not found"));
    }
    return ok(project);
  });

  const ingestText = async (request: any, reply: any) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = IngestTextSchema.parse(request.body);
      return ok(await engine.ingestText(projectId, body.text ?? "", ...(body.title ? [body.title] : [])));
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  };
  const ingestMarkdown = async (request: any, reply: any) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = IngestTextSchema.parse(request.body);
      return ok(
        await engine.ingestMarkdown(projectId, body.markdown ?? body.text ?? "", ...(body.title ? [body.title] : []))
      );
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  };
  const ingestUrl = async (request: any, reply: any) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = IngestUrlSchema.parse(request.body);
      return ok(await engine.ingestUrl(projectId, body.url, ...(body.title ? [body.title] : [])));
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  };
  const ingestPdf = async (request: any, reply: any) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = IngestPathSchema.parse(request.body);
      return ok(await engine.ingestPdf(projectId, body.filePath, ...(body.title ? [body.title] : [])));
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  };
  const ingestImage = async (request: any, reply: any) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = IngestPathSchema.parse(request.body);
      return ok(await engine.ingestImage(projectId, body.filePath, ...(body.title ? [body.title] : [])));
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  };
  const ingestTranscript = async (request: any, reply: any) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = IngestTranscriptSchema.parse(request.body);
      return ok(
        await engine.ingestTranscript(projectId, body.transcript, ...(body.title ? [body.title] : []))
      );
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  };

  app.post("/v1/projects/:projectId/ingest/text", ingestText);
  app.post("/v1/projects/:projectId/ingest/markdown", ingestMarkdown);
  app.post("/v1/projects/:projectId/ingest/url", ingestUrl);
  app.post("/v1/projects/:projectId/ingest/pdf", ingestPdf);
  app.post("/v1/projects/:projectId/ingest/image", ingestImage);
  app.post("/v1/projects/:projectId/ingest/transcript", ingestTranscript);

  app.post("/v1/projects/:projectId/synthesize", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = SynthesisBodySchema.parse(request.body);
      return ok(
        await engine.runSynthesis({
          projectId,
          mode: body.mode,
          title: body.title,
          ...(body.question ? { question: body.question } : {}),
          ...(body.audience ? { audience: body.audience } : {}),
          ...(body.desiredDirections ? { desiredDirections: body.desiredDirections } : {}),
          ...(body.sourceIds ? { sourceIds: body.sourceIds } : {})
        })
      );
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  });

  app.get("/v1/syntheses/:synthesisId", async (request, reply) => {
    const { synthesisId } = request.params as { synthesisId: string };
    const draft = engine.getDraft(synthesisId);
    if (!draft) {
      reply.code(404);
      return fail(new Error("Draft not found"));
    }
    return ok(draft);
  });

  app.get("/v1/syntheses/:synthesisId/draft", async (request, reply) => {
    const { synthesisId } = request.params as { synthesisId: string };
    const draft = engine.getDraft(synthesisId);
    if (!draft) {
      reply.code(404);
      return fail(new Error("Draft not found"));
    }
    return ok(DraftV1Schema.parse(draft));
  });

  app.get("/v1/syntheses/:synthesisId/citations", async (request) => {
    const { synthesisId } = request.params as { synthesisId: string };
    return ok(engine.listCitations(synthesisId));
  });

  app.get("/v1/syntheses/:synthesisId/contradictions", async (request) => {
    const { synthesisId } = request.params as { synthesisId: string };
    return ok(engine.listContradictions(synthesisId));
  });

  app.get("/v1/syntheses/:synthesisId/revisions", async (request) => {
    const { synthesisId } = request.params as { synthesisId: string };
    return ok(engine.listRevisions(synthesisId));
  });

  app.post("/v1/syntheses/:synthesisId/revisions", async (request, reply) => {
    try {
      const { synthesisId } = request.params as { synthesisId: string };
      const body = z.object({
        sectionId: z.string().min(1),
        body: z.string().min(1),
        reason: z.string().min(1),
        actor: z.string().optional()
      }).parse(request.body);
      return ok(engine.reviseSection(synthesisId, body.sectionId, body.body, body.reason, body.actor));
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  });

  app.get("/v1/syntheses/:synthesisId/export", async (request) => {
    const { synthesisId } = request.params as { synthesisId: string };
    return ok(engine.listExports(synthesisId));
  });

  app.post("/v1/syntheses/:synthesisId/export", async (request, reply) => {
    try {
      const { synthesisId } = request.params as { synthesisId: string };
      const body = z.object({ format: z.enum(["markdown", "json"]) }).parse(request.body);
      const artifact = body.format === "markdown" ? engine.exportMarkdown(synthesisId) : engine.exportJson(synthesisId);
      return ok(artifact);
    } catch (error) {
      reply.code(400);
      return fail(error);
    }
  });

  app.get("/v1/syntheses/:synthesisId/stages", async (request, reply) => {
    const { synthesisId } = request.params as { synthesisId: string };
    const record = engine.storage.getSynthesisRecord(synthesisId);
    if (!record) {
      reply.code(404);
      return fail(new Error("Synthesis not found"));
    }
    return ok(record.stageTrace ?? []);
  });

  app.setErrorHandler((error, _request, reply) => {
    reply.code(500);
    return fail(error);
  });

  return { app, engine, rootPath };
};

export const startApiServer = async (options: AppServerOptions = {}) => {
  const server = createAppServer(options);
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  await server.app.listen({ port, host });
  return server;
};

const parseProviderEnv = () => {
  const kind = process.env.SYNTHKIT_PROVIDER_KIND ?? "mock";
  if (kind === "mock") {
    return ProviderConfigSchema.parse({ kind: "mock", seed: process.env.SYNTHKIT_PROVIDER_SEED ?? "mock" });
  }
  if (kind === "openai") {
    return ProviderConfigSchema.parse({
      kind: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
      ocrModel: process.env.OPENAI_OCR_MODEL,
      transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL
    });
  }
  if (kind === "anthropic") {
    return ProviderConfigSchema.parse({
      kind: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL,
      model: process.env.ANTHROPIC_MODEL,
      ocrModel: process.env.ANTHROPIC_OCR_MODEL
    });
  }
  return ProviderConfigSchema.parse({
    kind: "ollama",
    baseUrl: process.env.OLLAMA_BASE_URL,
    model: process.env.OLLAMA_MODEL,
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL
  });
};

const getOpenApi = (manifest: unknown) => {
  const jsonSchema = <T extends z.ZodTypeAny>(schema: T) => z.toJSONSchema(schema);
  const routeToPath = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  const operations = apiRouteDefinitions.reduce<Record<string, Record<string, unknown>>>((acc, route) => {
    const path = routeToPath(route.path);
    const existing = acc[path] ?? {};
    acc[path] = {
      ...existing,
      [route.method]: {
        summary: route.summary,
        ...(route.parameters
          ? {
              parameters: route.parameters.map((parameter) => ({
                name: parameter.name,
                in: parameter.in,
                required: parameter.required,
                schema: jsonSchema(parameter.schema)
              }))
            }
          : {}),
        ...(route.requestBody
          ? {
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: jsonSchema(route.requestBody)
                  }
                }
              }
            }
          : {}),
        responses: Object.fromEntries(
          Object.entries(route.responses).map(([status, schema]) => [
            status,
            {
              description: Number(status) >= 400 ? "Error" : "OK",
              content: {
                "application/json": {
                  schema: jsonSchema(schema as z.ZodTypeAny)
                }
              }
            }
          ])
        )
      }
    };
    return acc;
  }, {});
  return {
    openapi: "3.1.0",
    info: { title: "SynthKit API", version: "0.1.0" },
    servers: [{ url: "http://127.0.0.1:8787" }],
    paths: operations,
    components: {
      schemas: {
        CapabilityManifestV1: jsonSchema(CapabilityManifestV1Schema),
        ProjectV1: jsonSchema(routeSchemas.responseEnvelope(ProjectV1Schema)),
        CitationV1: jsonSchema(routeSchemas.responseEnvelope(CitationV1Schema)),
        ContradictionV1: jsonSchema(routeSchemas.responseEnvelope(ContradictionV1Schema)),
        DraftV1: jsonSchema(routeSchemas.responseEnvelope(DraftV1Schema)),
        ExportArtifactV1: jsonSchema(routeSchemas.responseEnvelope(ExportArtifactV1Schema)),
        RevisionV1: jsonSchema(routeSchemas.responseEnvelope(RevisionV1Schema))
      },
      examples: {
        CapabilityManifestV1: manifest
      }
    }
  };
};
