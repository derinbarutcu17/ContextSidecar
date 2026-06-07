import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { createContextSidecarService, SynthKitEngine } from "@context-sidecar/core";
import { startApiServer } from "@context-sidecar/api";
import { startMcpHttpServer, startMcpServer } from "@context-sidecar/mcp";
import { ProviderConfigSchema } from "@context-sidecar/providers";

const program = new Command();
program.name("context-sidecar").description("Local-first agent context sidecar").version("0.1.0");
program.option("--root <path>", "workspace root path", process.env.CONTEXT_SIDECAR_HOME ?? path.join(process.cwd(), ".context-sidecar"));
program.option("--json", "emit JSON only", false);

const providerFromEnv = () => {
  const kind = process.env.CONTEXT_SIDECAR_PROVIDER_KIND ?? "mock";
  if (kind === "mock") {
    return ProviderConfigSchema.parse({ kind: "mock", seed: process.env.CONTEXT_SIDECAR_PROVIDER_SEED ?? "mock" });
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

program
  .command("init")
  .description("Initialize a workspace and print the default project path")
  .action(() => {
    const rootPath = process.env.CONTEXT_SIDECAR_HOME ?? path.join(process.cwd(), ".context-sidecar");
    fs.mkdirSync(rootPath, { recursive: true });
    output({ ok: true, rootPath });
  });

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
  .addCommand(new Command("namespaces").option("--now <now>").action(async function (this: Command) {
    const opts = this.optsWithGlobals() as Record<string, string | boolean>; const service = createContextSidecarService(String(opts.root));
    try {
      const namespaces = opts.now ? service.listNamespaces({ now: String(opts.now) }) : service.listNamespaces();
      output(namespaces, Boolean(opts.json));
    } finally { service.storage.close(); }
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
      storageExists: fs.existsSync(path.join(opts.root, "context-sidecar.sqlite"))
    };
    output(result, opts.json ?? false);
    engine.close();
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exit(1);
});
