import http from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { createContextSidecarService, SynthKitEngine } from "@synthkit/core";
import { ProviderConfigSchema } from "@synthkit/providers";
import { z } from "zod";

const ProjectCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaultMode: z.enum(["brief", "decision_memo", "deck_outline"]).optional()
});

const SynthesisSchema = z.object({
  projectId: z.string().min(1),
  mode: z.enum(["brief", "decision_memo", "deck_outline"]),
  title: z.string().min(1),
  question: z.string().optional(),
  audience: z.string().optional(),
  desiredDirections: z.union([z.literal(2), z.literal(3)]).optional(),
  sourceIds: z.array(z.string()).optional()
});

const StringBodySchema = z.object({
  projectId: z.string().min(1),
  text: z.string().optional(),
  markdown: z.string().optional(),
  url: z.string().optional(),
  filePath: z.string().optional(),
  title: z.string().optional()
});

const RevisionSchema = z.object({
  synthesisId: z.string().min(1),
  sectionId: z.string().min(1),
  body: z.string().min(1),
  reason: z.string().min(1),
  actor: z.string().optional()
});

export interface McpServerOptions {
  rootPath?: string;
  provider?: unknown;
}

export const createMcpServer = (options: McpServerOptions = {}) => {
  const rootPath = options.rootPath ?? process.env.SYNTHKIT_HOME ?? path.join(process.cwd(), ".synthkit");
  const provider = options.provider ? ProviderConfigSchema.parse(options.provider) : parseProviderEnv();
  const engine = new SynthKitEngine({ rootPath, provider });
  const contextService = createContextSidecarService(rootPath);
  const server = new Server(
    {
      name: "synthkit",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: "project_create", description: "Create a project", inputSchema: { type: "object" } },
      { name: "context_add", description: "Create a context item", inputSchema: { type: "object" } },
      { name: "context_update", description: "Update a context item", inputSchema: { type: "object" } },
      { name: "context_get", description: "Get a context item", inputSchema: { type: "object" } },
      { name: "context_list", description: "List context items for a namespace", inputSchema: { type: "object" } },
      { name: "context_search", description: "Search context items in a namespace", inputSchema: { type: "object" } },
      { name: "context_pack", description: "Build a compact context pack", inputSchema: { type: "object" } },
      { name: "context_archive", description: "Archive a context item", inputSchema: { type: "object" } },
      { name: "context_pin", description: "Pin a context item", inputSchema: { type: "object" } },
      { name: "source_ingest_text", description: "Ingest pasted text", inputSchema: { type: "object" } },
      { name: "source_ingest_markdown", description: "Ingest markdown", inputSchema: { type: "object" } },
      { name: "source_ingest_pdf", description: "Ingest a PDF", inputSchema: { type: "object" } },
      { name: "source_ingest_url", description: "Ingest a URL", inputSchema: { type: "object" } },
      { name: "synthesis_run", description: "Run synthesis", inputSchema: { type: "object" } },
      { name: "synthesis_get_draft", description: "Get synthesis draft", inputSchema: { type: "object" } },
      { name: "synthesis_get_citations", description: "Get citations", inputSchema: { type: "object" } },
      { name: "synthesis_get_contradictions", description: "Get contradictions", inputSchema: { type: "object" } },
      { name: "draft_revise_section", description: "Revise a section", inputSchema: { type: "object" } },
      { name: "export_markdown", description: "Export markdown", inputSchema: { type: "object" } },
      { name: "export_json", description: "Export JSON", inputSchema: { type: "object" } },
      { name: "health_check", description: "Return service health", inputSchema: { type: "object" } }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case "context_add": {
          const body = z.object({ namespace: z.string().min(1), item_type: z.enum(["preference", "profile_fact", "project_fact", "task_note", "pinned_instruction", "workflow_note"]), content: z.string().min(1), source_type: z.enum(["user_message", "file", "url", "manual_entry", "system_note"]), source_reference: z.string().nullable().optional(), priority: z.number().optional(), status: z.enum(["active", "pinned", "archived", "expired"]).optional(), expires_at: z.string().datetime({ offset: true }).nullable().optional(), tags: z.array(z.string()).optional(), metadata: z.record(z.string(), z.unknown()).optional() }).parse(args ?? {});
          return textResult(contextService.addItem({ namespace: body.namespace, item_type: body.item_type, content: body.content, source_type: body.source_type, ...(body.source_reference !== undefined ? { source_reference: body.source_reference } : {}), ...(body.priority !== undefined ? { priority: body.priority } : {}), ...(body.status !== undefined ? { status: body.status } : {}), ...(body.expires_at !== undefined ? { expires_at: body.expires_at } : {}), ...(body.tags !== undefined ? { tags: body.tags } : {}), ...(body.metadata !== undefined ? { metadata: body.metadata } : {}) }));
        }
        case "context_update": {
          const body = z.object({ id: z.string().min(1), content: z.string().min(1).optional(), priority: z.number().optional(), status: z.enum(["active", "pinned", "archived", "expired"]).optional(), expires_at: z.string().datetime({ offset: true }).nullable().optional(), tags: z.array(z.string()).optional(), metadata: z.record(z.string(), z.unknown()).optional() }).parse(args ?? {});
          return textResult(contextService.updateItem(body.id, { ...(body.content !== undefined ? { content: body.content } : {}), ...(body.priority !== undefined ? { priority: body.priority } : {}), ...(body.status !== undefined ? { status: body.status } : {}), ...(body.expires_at !== undefined ? { expires_at: body.expires_at } : {}), ...(body.tags !== undefined ? { tags: body.tags } : {}), ...(body.metadata !== undefined ? { metadata: body.metadata } : {}) }));
        }
        case "context_get": return textResult(contextService.getItem(z.object({ id: z.string().min(1) }).parse(args ?? {}).id));
        case "context_list": {
          const body = z.object({ namespace: z.string().min(1), item_type: z.enum(["preference", "profile_fact", "project_fact", "task_note", "pinned_instruction", "workflow_note"]).optional(), status: z.enum(["active", "pinned", "archived", "expired"]).optional(), tag: z.string().optional() }).parse(args ?? {});
          return textResult(contextService.listItems({ namespace: body.namespace, ...(body.item_type !== undefined ? { item_type: body.item_type } : {}), ...(body.status !== undefined ? { status: body.status } : {}), ...(body.tag !== undefined ? { tag: body.tag } : {}) }));
        }
        case "context_search": {
          const body = z.object({ namespace: z.string().min(1), query: z.string().min(1), item_type: z.enum(["preference", "profile_fact", "project_fact", "task_note", "pinned_instruction", "workflow_note"]).optional(), status: z.enum(["active", "pinned", "archived", "expired"]).optional() }).parse(args ?? {});
          return textResult(contextService.searchItems({ namespace: body.namespace, query: body.query, ...(body.item_type !== undefined ? { item_type: body.item_type } : {}), ...(body.status !== undefined ? { status: body.status } : {}) }));
        }
        case "context_pack": {
          const body = z.object({ namespace: z.string().min(1), task_query: z.string().nullable().optional(), max_items: z.number().int().positive().nullable().optional(), include_types: z.array(z.enum(["preference", "profile_fact", "project_fact", "task_note", "pinned_instruction", "workflow_note"])).nullable().optional(), exclude_archived: z.boolean().default(true), now: z.string().datetime({ offset: true }).nullable().optional() }).parse(args ?? {});
          return textResult(contextService.buildContextPack({ namespace: body.namespace, task_query: body.task_query ?? null, max_items: body.max_items ?? null, include_types: body.include_types ?? null, exclude_archived: body.exclude_archived, now: body.now ?? null }));
        }
        case "context_archive": return textResult(contextService.archiveItem(z.object({ id: z.string().min(1) }).parse(args ?? {}).id));
        case "context_pin": return textResult(contextService.pinItem(z.object({ id: z.string().min(1) }).parse(args ?? {}).id));
        case "project_create": {
          const body = ProjectCreateSchema.parse(args ?? {});
          return textResult(
            engine.createProject({
              name: body.name,
              ...(body.description ? { description: body.description } : {}),
              ...(body.defaultMode ? { defaultMode: body.defaultMode } : {})
            })
          );
        }
        case "source_ingest_text": {
          const body = StringBodySchema.parse(args ?? {});
          return textResult(await engine.ingestText(body.projectId, body.text ?? "", ...(body.title ? [body.title] : [])));
        }
        case "source_ingest_markdown": {
          const body = StringBodySchema.parse(args ?? {});
          return textResult(
            await engine.ingestMarkdown(body.projectId, body.markdown ?? "", ...(body.title ? [body.title] : []))
          );
        }
        case "source_ingest_pdf": {
          const body = StringBodySchema.parse(args ?? {});
          return textResult(await engine.ingestPdf(body.projectId, body.filePath ?? "", ...(body.title ? [body.title] : [])));
        }
        case "source_ingest_url": {
          const body = StringBodySchema.parse(args ?? {});
          return textResult(await engine.ingestUrl(body.projectId, body.url ?? "", ...(body.title ? [body.title] : [])));
        }
        case "synthesis_run": {
          const body = SynthesisSchema.parse(args ?? {});
          return textResult(
            await engine.runSynthesis({
              projectId: body.projectId,
              mode: body.mode,
              title: body.title,
              ...(body.question ? { question: body.question } : {}),
              ...(body.audience ? { audience: body.audience } : {}),
              ...(body.desiredDirections ? { desiredDirections: body.desiredDirections } : {}),
              ...(body.sourceIds ? { sourceIds: body.sourceIds } : {})
            })
          );
        }
        case "synthesis_get_draft": {
          const body = z.object({ synthesisId: z.string().min(1) }).parse(args ?? {});
          return textResult(engine.getDraft(body.synthesisId));
        }
        case "synthesis_get_citations": {
          const body = z.object({ synthesisId: z.string().min(1) }).parse(args ?? {});
          return textResult(engine.listCitations(body.synthesisId));
        }
        case "synthesis_get_contradictions": {
          const body = z.object({ synthesisId: z.string().min(1) }).parse(args ?? {});
          return textResult(engine.listContradictions(body.synthesisId));
        }
        case "draft_revise_section": {
          const body = RevisionSchema.parse(args ?? {});
          return textResult(
            engine.reviseSection(body.synthesisId, body.sectionId, body.body, body.reason, body.actor)
          );
        }
        case "export_markdown": {
          const body = z.object({ synthesisId: z.string().min(1) }).parse(args ?? {});
          return textResult(engine.exportMarkdown(body.synthesisId));
        }
        case "export_json": {
          const body = z.object({ synthesisId: z.string().min(1) }).parse(args ?? {});
          return textResult(engine.exportJson(body.synthesisId));
        }
        case "health_check":
          return textResult({ status: "ok", rootPath });
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: false,
                error: {
                  message: error instanceof Error ? error.message : "Unknown error"
                }
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const synthesisRows = engine.storage.db.prepare(`SELECT id FROM syntheses ORDER BY created_at DESC`).all() as Array<{ id: string }>;
    return {
      resources: [
        { uri: "manifest://capabilities", name: "Capability Manifest", mimeType: "application/json" },
        { uri: "examples://catalog", name: "Example Catalog", mimeType: "application/json" },
        ...engine.storage.listProjects().flatMap((project) => [
          {
            uri: `project://${project.id}`,
            name: `Project ${project.name}`,
            mimeType: "application/json"
          },
          {
            uri: `project://${project.id}/sources`,
            name: `Project ${project.name} Sources`,
            mimeType: "application/json"
          },
          {
            uri: `project://${project.id}/chunks`,
            name: `Project ${project.name} Chunks`,
            mimeType: "application/json"
          }
        ]),
        ...synthesisRows.map((row) => ({
          uri: `synthesis://${row.id}/draft`,
          name: `Synthesis ${row.id} Draft`,
          mimeType: "application/json"
        })),
        ...synthesisRows.map((row) => ({
          uri: `synthesis://${row.id}/citations`,
          name: `Synthesis ${row.id} Citations`,
          mimeType: "application/json"
        })),
        ...synthesisRows.map((row) => ({
          uri: `synthesis://${row.id}/contradictions`,
          name: `Synthesis ${row.id} Contradictions`,
          mimeType: "application/json"
        }))
      ]
    };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      {
        uriTemplate: "project://{projectId}",
        name: "Project",
        description: "Project metadata and storage pointers",
        mimeType: "application/json"
      },
      {
        uriTemplate: "project://{projectId}/sources",
        name: "Project Sources",
        description: "All sources ingested into a project",
        mimeType: "application/json"
      },
      {
        uriTemplate: "project://{projectId}/chunks",
        name: "Project Chunks",
        description: "All chunks created from project sources",
        mimeType: "application/json"
      },
      {
        uriTemplate: "synthesis://{synthesisId}/draft",
        name: "Synthesis Draft",
        description: "The current draft for a synthesis",
        mimeType: "application/json"
      },
      {
        uriTemplate: "synthesis://{synthesisId}/citations",
        name: "Synthesis Citations",
        description: "Section-level citations for a synthesis",
        mimeType: "application/json"
      },
      {
        uriTemplate: "synthesis://{synthesisId}/contradictions",
        name: "Synthesis Contradictions",
        description: "Detected contradictions for a synthesis",
        mimeType: "application/json"
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri === "manifest://capabilities") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(engine.getManifest(), null, 2)
          }
        ]
      };
    }
    if (uri === "examples://catalog") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(getExampleCatalog(), null, 2)
          }
        ]
      };
    }
    const projectSources = uri.match(/^project:\/\/([^/]+)\/sources$/);
    const projectChunks = uri.match(/^project:\/\/([^/]+)\/chunks$/);
    const project = uri.match(/^project:\/\/([^/]+)$/);
    const synthesisDraft = uri.match(/^synthesis:\/\/([^/]+)\/draft$/);
    const synthesisCitations = uri.match(/^synthesis:\/\/([^/]+)\/citations$/);
    const synthesisContradictions = uri.match(/^synthesis:\/\/([^/]+)\/contradictions$/);
    if (project?.[1]) {
      return resourceJson(uri, engine.getProject(project[1]));
    }
    if (projectSources?.[1]) {
      return resourceJson(uri, engine.storage.listSources(projectSources[1]));
    }
    if (projectChunks?.[1]) {
      return resourceJson(uri, engine.storage.listChunks(projectChunks[1]));
    }
    if (synthesisDraft?.[1]) {
      return resourceJson(uri, engine.getDraft(synthesisDraft[1]));
    }
    if (synthesisCitations?.[1]) {
      return resourceJson(uri, engine.listCitations(synthesisCitations[1]));
    }
    if (synthesisContradictions?.[1]) {
      return resourceJson(uri, engine.listContradictions(synthesisContradictions[1]));
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      { name: "research_to_brief", description: "Turn research into a brief" },
      { name: "research_to_decision_memo", description: "Turn research into a decision memo" },
      { name: "research_to_deck_outline", description: "Turn research into a deck outline" },
      { name: "inspect_contradictions", description: "Inspect contradictory evidence" },
      { name: "compare_directions", description: "Compare possible directions" },
      { name: "quality_audit_draft", description: "Audit a draft for trustworthiness" }
    ]
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const name = request.params.name;
    const messages = promptMessages(name);
    if (!messages) {
      throw new Error(`Unknown prompt: ${name}`);
    }
    return {
      description: `SynthKit prompt: ${name}`,
      messages
    };
  });

  return { server, engine, rootPath };
};

export const startMcpServer = async (options: McpServerOptions = {}) => {
  const state = createMcpServer(options);
  const transport = new StdioServerTransport();
  await state.server.connect(transport);
  return state;
};

export interface McpHttpServerOptions extends McpServerOptions {
  host?: string;
  port?: number;
  path?: string;
}

export const startMcpHttpServer = async (options: McpHttpServerOptions = {}) => {
  const state = createMcpServer(options);
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.PORT ?? 8788);
  const routePath = options.path ?? "/mcp";
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    enableDnsRebindingProtection: true,
    allowedHosts: [],
    sessionIdGenerator: () => randomUUID()
  } as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
  await state.server.connect(transport as any);

  const httpServer = http.createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Missing request URL");
      return;
    }
    const requestUrl = new URL(req.url, `http://${req.headers.host ?? `${host}:${port}`}`);
    if (requestUrl.pathname !== routePath) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    await transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, resolve);
  });

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address && "port" in address ? address.port : port;
  const guardedTransport = transport as typeof transport & {
    _allowedHosts?: string[];
  };
  guardedTransport._allowedHosts = Array.from(
    new Set([
      host,
      `${host}:${actualPort}`,
      "127.0.0.1",
      `127.0.0.1:${actualPort}`,
      "localhost",
      `localhost:${actualPort}`
    ])
  );

  return { ...state, httpServer, host, port: actualPort, path: routePath };
};

const textResult = (value: unknown) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(value, null, 2)
    }
  ]
});

const resourceJson = (uri: string, value: unknown) => ({
  contents: [
    {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(value, null, 2)
    }
  ]
});

const promptMessages = (name: string) => {
  switch (name) {
    case "research_to_brief":
      return [
        { role: "user" as const, content: { type: "text" as const, text: "Produce a concise research brief with citations, contradictions, confidence markers, and 2-3 directions." } }
      ];
    case "research_to_decision_memo":
      return [
        { role: "user" as const, content: { type: "text" as const, text: "Produce a decision memo with options, tradeoffs, evidence, and unresolved contradictions." } }
      ];
    case "research_to_deck_outline":
      return [
        { role: "user" as const, content: { type: "text" as const, text: "Turn the material into a deck outline with slide-level structure and proof points." } }
      ];
    case "inspect_contradictions":
      return [
        { role: "user" as const, content: { type: "text" as const, text: "Inspect contradictory claims, list evidence, and explain whether the conflict is material." } }
      ];
    case "compare_directions":
      return [
        { role: "user" as const, content: { type: "text" as const, text: "Compare the strongest directions and note the evidence behind each." } }
      ];
    case "quality_audit_draft":
      return [
        { role: "user" as const, content: { type: "text" as const, text: "Audit the draft for unsupported claims, weak citations, and insufficient evidence." } }
      ];
    default:
      return undefined;
  }
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

const getExampleCatalog = () => [
  { name: "brief-from-notes", description: "Short brief from messy notes" },
  { name: "decision-memo-from-research", description: "Decision memo with options and tradeoffs" },
  { name: "deck-outline-from-transcript", description: "Deck outline from transcript snippets" }
];
