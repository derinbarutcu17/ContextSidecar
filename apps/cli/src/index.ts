import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { createContextSidecarService, SynthKitEngine } from "@synthkit/core";
import { startApiServer } from "@synthkit/api";
import { startMcpHttpServer, startMcpServer } from "@synthkit/mcp";
import { ProviderConfigSchema } from "@synthkit/providers";
import { z } from "zod";

const program = new Command();
program.name("context-sidecar").description("Local-first agent context sidecar").version("0.1.0");
program.option("--root <path>", "workspace root path", process.env.SYNTHKIT_HOME ?? path.join(process.cwd(), ".synthkit"));
program.option("--json", "emit JSON only", false);

const rootPathOption = (cmd: Command) =>
  cmd.option("--root <path>", "workspace root path", process.env.SYNTHKIT_HOME ?? path.join(process.cwd(), ".synthkit"));

const jsonOption = (cmd: Command) => cmd.option("--json", "emit JSON only", false);

const providerFromEnv = () => {
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
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL
    });
  }
  if (kind === "anthropic") {
    return ProviderConfigSchema.parse({
      kind: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL,
      model: process.env.ANTHROPIC_MODEL
    });
  }
  return ProviderConfigSchema.parse({
    kind: "ollama",
    baseUrl: process.env.OLLAMA_BASE_URL,
    model: process.env.OLLAMA_MODEL,
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL
  });
};

const createEngine = (rootPath: string) => new SynthKitEngine({ rootPath, provider: providerFromEnv() });

const output = (value: unknown, json = false) => {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
};

const ensureProject = (engine: SynthKitEngine, projectId?: string, name = "SynthKit Demo") => {
  if (projectId) {
    const existing = engine.getProject(projectId);
    if (existing) return existing;
  }
  return engine.createProject({ name, defaultMode: "brief" });
};

program
  .command("init")
  .description("Initialize a workspace and print the default project path")
  .action(() => {
    const rootPath = process.env.SYNTHKIT_HOME ?? path.join(process.cwd(), ".synthkit");
    fs.mkdirSync(rootPath, { recursive: true });
    output({ ok: true, rootPath });
  });

program
  .command("demo")
  .description("Run a demo synthesis locally")
  .option("--project-name <name>", "project name", "SynthKit Demo")
  .option("--mode <mode>", "brief, decision_memo, or deck_outline", "brief")
  .action(async function (this: Command) {
    const opts = this.optsWithGlobals() as { json?: boolean; root: string; projectName: string; mode: "brief" | "decision_memo" | "deck_outline" };
    await runDemo(opts.root, opts.projectName, opts.mode, opts.json ?? false);
  });

program.command("run").description("Run workflows").addCommand(
  new Command("demo")
    .option("--project-name <name>", "project name", "SynthKit Demo")
    .option("--mode <mode>", "brief, decision_memo, or deck_outline", "brief")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { json?: boolean; root: string; projectName: string; mode: "brief" | "decision_memo" | "deck_outline" };
      await runDemo(opts.root, opts.projectName, opts.mode, opts.json ?? false);
    })
);

program
  .command("ingest")
  .description("Ingest sources")
  .addCommand(
    new Command("text")
      .requiredOption("--project <id>")
      .requiredOption("--text <text>")
      .option("--title <title>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as { json?: boolean; root: string; project: string; text: string; title?: string };
        const engine = createEngine(opts.root);
        const result = await engine.ingestText(opts.project, opts.text, opts.title);
        output(result, opts.json ?? false);
        engine.close();
      })
  )
  .addCommand(
    new Command("markdown")
      .requiredOption("--project <id>")
      .requiredOption("--markdown <markdown>")
      .option("--title <title>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as { json?: boolean; root: string; project: string; markdown: string; title?: string };
        const engine = createEngine(opts.root);
        const result = await engine.ingestMarkdown(opts.project, opts.markdown, opts.title);
        output(result, opts.json ?? false);
        engine.close();
      })
  )
  .addCommand(
    new Command("pdf")
      .requiredOption("--project <id>")
      .requiredOption("--file <path>")
      .option("--title <title>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as { json?: boolean; root: string; project: string; file: string; title?: string };
        const engine = createEngine(opts.root);
        const result = await engine.ingestPdf(opts.project, opts.file, opts.title);
        output(result, opts.json ?? false);
        engine.close();
      })
  )
  .addCommand(
    new Command("url")
      .requiredOption("--project <id>")
      .requiredOption("--url <url>")
      .option("--title <title>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as { json?: boolean; root: string; project: string; url: string; title?: string };
        const engine = createEngine(opts.root);
        const result = await engine.ingestUrl(opts.project, opts.url, opts.title);
        output(result, opts.json ?? false);
        engine.close();
      })
  );

program
  .command("synthesize")
  .description("Run a synthesis")
  .argument("<mode>", "brief, memo, or deck")
  .requiredOption("--project <id>")
  .requiredOption("--title <title>")
  .option("--question <question>")
  .option("--audience <audience>")
  .option("--source-id <ids...>")
  .action(async function (this: Command, modeArg: string) {
    const opts = this.optsWithGlobals() as { json?: boolean; root: string; project: string; title: string; question?: string; audience?: string; sourceId?: string[] };
    const mode = normalizeMode(modeArg);
    const engine = createEngine(opts.root);
    const bundle = await engine.runSynthesis({
      projectId: opts.project,
      mode,
      title: opts.title,
      ...(opts.question ? { question: opts.question } : {}),
      ...(opts.audience ? { audience: opts.audience } : {}),
      ...(opts.sourceId ? { sourceIds: opts.sourceId } : {})
    });
    output(bundle, opts.json ?? false);
    engine.close();
  });

program
  .command("inspect")
  .description("Inspect synthesis outputs")
  .addCommand(
    new Command("citations")
      .requiredOption("--synthesis <id>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as { json?: boolean; root: string; synthesis: string };
        const engine = createEngine(opts.root);
        output(engine.listCitations(opts.synthesis), opts.json ?? false);
        engine.close();
      })
  )
  .addCommand(
    new Command("contradictions")
      .requiredOption("--synthesis <id>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as { json?: boolean; root: string; synthesis: string };
        const engine = createEngine(opts.root);
        output(engine.listContradictions(opts.synthesis), opts.json ?? false);
        engine.close();
      })
  );

program
  .command("export")
  .description("Export synthesis output")
  .addCommand(
    new Command("md")
      .requiredOption("--synthesis <id>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as { json?: boolean; root: string; synthesis: string };
        const engine = createEngine(opts.root);
        output(engine.exportMarkdown(opts.synthesis), opts.json ?? false);
        engine.close();
      })
  )
  .addCommand(
    new Command("json")
      .requiredOption("--synthesis <id>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as { json?: boolean; root: string; synthesis: string };
        const engine = createEngine(opts.root);
        output(engine.exportJson(opts.synthesis), opts.json ?? false);
        engine.close();
      })
  );

program.command("serve").description("Start local servers").addCommand(
  new Command("api").action(async function (this: Command) {
    const opts = this.optsWithGlobals() as { root: string };
    await startApiServer({ rootPath: opts.root });
  })
).addCommand(
  new Command("mcp").action(async function (this: Command) {
    const opts = this.optsWithGlobals() as { root: string };
    await startMcpServer({ rootPath: opts.root });
  })
).addCommand(
  new Command("mcp-http")
    .option("--port <port>", "HTTP port", process.env.PORT ?? "8788")
    .option("--host <host>", "HTTP host", process.env.HOST ?? "127.0.0.1")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { root: string; port: string; host: string };
      await startMcpHttpServer({
        rootPath: opts.root,
        host: opts.host,
        port: Number(opts.port)
      });
    })
);

program.command("context").description("Manage local-first context sidecar items and packs")
  .addCommand(new Command("add")
    .requiredOption("--namespace <namespace>")
    .requiredOption("--item-type <itemType>")
    .requiredOption("--content <content>")
    .requiredOption("--source-type <sourceType>")
    .option("--source-reference <sourceReference>")
    .option("--priority <priority>", "numeric priority", "0")
    .option("--status <status>", "active, pinned, archived, expired", "active")
    .option("--expires-at <expiresAt>")
    .option("--tag <tags...>")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as Record<string, string | string[] | boolean | undefined>;
      const service = createContextSidecarService(String(opts.root));
      try {
        output(service.addItem({
          namespace: String(opts.namespace),
          item_type: String(opts.itemType) as any,
          content: String(opts.content),
          source_type: String(opts.sourceType) as any,
          source_reference: opts.sourceReference ? String(opts.sourceReference) : null,
          priority: Number(opts.priority ?? 0),
          status: String(opts.status) as any,
          expires_at: opts.expiresAt ? String(opts.expiresAt) : null,
          tags: (opts.tag as string[] | undefined) ?? []
        }), Boolean(opts.json));
      } finally { service.storage.close(); }
    }))
  .addCommand(new Command("update").requiredOption("--id <id>").option("--content <content>").option("--priority <priority>").option("--status <status>").option("--expires-at <expiresAt>").option("--tag <tags...>").action(async function (this: Command) {
    const opts = this.optsWithGlobals() as Record<string, string | string[] | boolean | undefined>;
    const service = createContextSidecarService(String(opts.root));
    try { output(service.updateItem(String(opts.id), { ...(opts.content !== undefined ? { content: String(opts.content) } : {}), ...(opts.priority !== undefined ? { priority: Number(opts.priority) } : {}), ...(opts.status !== undefined ? { status: String(opts.status) as any } : {}), ...(opts.expiresAt !== undefined ? { expires_at: String(opts.expiresAt) } : {}), ...(opts.tag !== undefined ? { tags: opts.tag as string[] } : {}) }), Boolean(opts.json)); } finally { service.storage.close(); }
  }))
  .addCommand(new Command("get").requiredOption("--id <id>").action(async function (this: Command) {
    const opts = this.optsWithGlobals() as Record<string, string | boolean>; const service = createContextSidecarService(String(opts.root));
    try { output(service.getItem(String(opts.id)), Boolean(opts.json)); } finally { service.storage.close(); }
  }))
  .addCommand(new Command("list").requiredOption("--namespace <namespace>").option("--item-type <itemType>").option("--status <status>").option("--tag <tag>").action(async function (this: Command) {
    const opts = this.optsWithGlobals() as Record<string, string | boolean>; const service = createContextSidecarService(String(opts.root));
    try { output(service.listItems({ namespace: String(opts.namespace), ...(opts.itemType ? { item_type: String(opts.itemType) as any } : {}), ...(opts.status ? { status: String(opts.status) as any } : {}), ...(opts.tag ? { tag: String(opts.tag) } : {}) }), Boolean(opts.json)); } finally { service.storage.close(); }
  }))
  .addCommand(new Command("search").requiredOption("--namespace <namespace>").requiredOption("--query <query>").option("--item-type <itemType>").option("--status <status>").action(async function (this: Command) {
    const opts = this.optsWithGlobals() as Record<string, string | boolean>; const service = createContextSidecarService(String(opts.root));
    try { output(service.searchItems({ namespace: String(opts.namespace), query: String(opts.query), ...(opts.itemType ? { item_type: String(opts.itemType) as any } : {}), ...(opts.status ? { status: String(opts.status) as any } : {}) }), Boolean(opts.json)); } finally { service.storage.close(); }
  }))
  .addCommand(new Command("pack").requiredOption("--namespace <namespace>").option("--task-query <taskQuery>").option("--max-items <maxItems>").option("--include-type <types...>").option("--include-archived", "include archived items in the pack", false).action(async function (this: Command) {
    const opts = this.optsWithGlobals() as Record<string, string | string[] | boolean>; const service = createContextSidecarService(String(opts.root));
    try { output(service.buildContextPack({ namespace: String(opts.namespace), task_query: opts.taskQuery ? String(opts.taskQuery) : null, max_items: opts.maxItems ? Number(opts.maxItems) : null, include_types: (opts.includeType as string[] | undefined)?.map((value) => value as any) ?? null, exclude_archived: !Boolean(opts.includeArchived), now: null }), Boolean(opts.json)); } finally { service.storage.close(); }
  }))
  .addCommand(new Command("archive").requiredOption("--id <id>").action(async function (this: Command) {
    const opts = this.optsWithGlobals() as Record<string, string | boolean>; const service = createContextSidecarService(String(opts.root));
    try { output(service.archiveItem(String(opts.id)), Boolean(opts.json)); } finally { service.storage.close(); }
  }))
  .addCommand(new Command("pin").requiredOption("--id <id>").action(async function (this: Command) {
    const opts = this.optsWithGlobals() as Record<string, string | boolean>; const service = createContextSidecarService(String(opts.root));
    try { output(service.pinItem(String(opts.id)), Boolean(opts.json)); } finally { service.storage.close(); }
  }));

program
  .command("doctor")
  .description("Check local environment and workspace readiness")
  .action(async function (this: Command) {
    const opts = this.optsWithGlobals() as { json?: boolean; root: string };
    const engine = createEngine(opts.root);
    const manifest = engine.getManifest();
    const result = {
      ok: true,
      rootPath: opts.root,
      node: process.version,
      manifest,
      storageExists: fs.existsSync(path.join(opts.root, "synthkit.sqlite"))
    };
    output(result, opts.json ?? false);
    engine.close();
  });

const DEMO_TEXT = `
We need a structured research brief from messy input.
The product direction may be to build a local-first synthesis engine with citations.
One note says the first release should prioritize MCP and CLI.
Another note says the web UI can wait.
There is disagreement on whether to support streamable HTTP in v1.
`;

const DEMO_MARKDOWN = `
# Demo notes

- Core engine first
- MCP, CLI, HTTP, SDK next
- Web UI later
- Use SQLite by default
`;

const DEMO_TRANSCRIPT = `
[00:01] We should keep the scope tight.
[00:05] The system needs citations and contradiction detection.
[00:11] We want a demo that works without API keys.
`;

const normalizeMode = (value: string): "brief" | "decision_memo" | "deck_outline" => {
  if (value === "memo" || value === "decision_memo") return "decision_memo";
  if (value === "deck" || value === "deck_outline") return "deck_outline";
  return "brief";
};

const runDemo = async (root: string, projectName: string, mode: "brief" | "decision_memo" | "deck_outline", json: boolean) => {
  const engine = createEngine(root);
  const project = engine.createProject({ name: projectName, defaultMode: mode });
  await engine.ingestText(project.id, DEMO_TEXT, "Demo notes");
  await engine.ingestMarkdown(project.id, DEMO_MARKDOWN, "Demo markdown");
  await engine.ingestTranscript(project.id, DEMO_TRANSCRIPT, "Demo transcript");
  const bundle = await engine.runSynthesis({
    projectId: project.id,
    mode,
    title: "Demo synthesis",
    question: "What should we do next?",
    audience: "internal team",
    desiredDirections: 3
  });
  const markdown = engine.exportMarkdown(bundle.request.id);
  const jsonArtifact = engine.exportJson(bundle.request.id);
  output(
    {
      project,
      synthesisId: bundle.request.id,
      confidence: bundle.confidenceReport.overallConfidence,
      markdownPath: markdown.path,
      jsonPath: jsonArtifact.path,
      sections: bundle.draft.sections.length,
      citations: bundle.citations.length,
      contradictions: bundle.contradictions.length
    },
    json
  );
  engine.close();
};

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exit(1);
});
