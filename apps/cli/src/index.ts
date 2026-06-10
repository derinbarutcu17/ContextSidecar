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

const markdownExtensions = new Set([".md", ".markdown", ".mdx"]);

const isMarkdownFile = (filePath: string) => markdownExtensions.has(path.extname(filePath).toLowerCase());

const collectMarkdownFiles = (inputs: string[]) => {
  const files = new Set<string>();
  const visit = (input: string) => {
    const resolved = path.resolve(input);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Input path not found: ${input}`);
    }
    const stats = fs.statSync(resolved);
    if (stats.isDirectory()) {
      for (const entry of fs.readdirSync(resolved)) visit(path.join(resolved, entry));
      return;
    }
    if (stats.isFile() && isMarkdownFile(resolved)) files.add(resolved);
  };

  for (const input of inputs) visit(input);
  return [...files].sort((left, right) => left.localeCompare(right));
};

const readMarkdownContent = (filePath: string) =>
  fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const markdownTitle = (filePath: string, content: string) => {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  return headingMatch?.[1]?.trim() || path.basename(filePath, path.extname(filePath));
};

const uniqueStrings = (values: string[]) => [...new Set(values.filter(Boolean))];

const importMarkdownPaths = (
  service: ReturnType<typeof createContextSidecarService>,
  options: {
    namespace: string;
    inputs: string[];
    itemType: string;
    sourceType: string;
    priority: number;
    status: string;
    tags: string[];
  }
) => {
  const files = collectMarkdownFiles(options.inputs);
  const now = new Date().toISOString();
  const existingItems = service.listItems({ namespace: options.namespace, include_archived: true });
  const imported = {
    created: 0,
    updated: 0,
    skipped: 0,
    files: [] as Array<{ file: string; action: "created" | "updated" | "skipped"; id?: string }>
  };

  for (const filePath of files) {
    const content = readMarkdownContent(filePath);
    if (!content) {
      imported.skipped += 1;
      imported.files.push({ file: filePath, action: "skipped" });
      continue;
    }
    const tags = uniqueStrings(["markdown-import", ...options.tags]);
    const metadata = {
      importedFrom: filePath,
      importedAt: now,
      markdownImport: true,
      title: markdownTitle(filePath, content),
      byteSize: Buffer.byteLength(content),
      lineCount: content.split("\n").length
    };
    const existingItem = existingItems.find((item) => item.item_type === options.itemType && item.source_reference === filePath);
    if (existingItem) {
      const updated = service.updateItem(existingItem.id, {
        content,
        priority: options.priority,
        status: options.status as any,
        tags,
        metadata
      });
      imported.updated += 1;
      imported.files.push({ file: filePath, action: "updated", id: updated.id });
      continue;
    }
    const created = service.addItem({
      namespace: options.namespace,
      item_type: options.itemType as any,
      content,
      source_type: options.sourceType as any,
      source_reference: filePath,
      priority: options.priority,
      status: options.status as any,
      tags,
      metadata
    });
    imported.created += 1;
    imported.files.push({ file: filePath, action: "created", id: created.id });
  }

  return imported;
};

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

const withService = async <T>(root: string, action: (service: ReturnType<typeof createContextSidecarService>) => Promise<T> | T, json: boolean) => {
  const service = createContextSidecarService(root);
  try {
    const result = await action(service);
    output(result, json);
    return result;
  } finally {
    service.storage.close();
  }
};

const contextCommand = program.command("context").description("Manage local-first context sidecar items and packs");

program
  .command("init")
  .description("Initialize a workspace and print the default project path")
  .action(() => {
    const rootPath = process.env.CONTEXT_SIDECAR_HOME ?? path.join(process.cwd(), ".context-sidecar");
    fs.mkdirSync(rootPath, { recursive: true });
    output({ ok: true, rootPath });
  });

program
  .command("demo")
  .description("Seed a throwaway workspace and print a sample context pack")
  .option("--workspace <path>", "demo workspace path", process.env.CONTEXT_SIDECAR_DEMO_HOME ?? path.join(process.cwd(), ".context-sidecar-demo"))
  .option("--namespace <namespace>", "demo namespace", "project:demo")
  .action(async function (this: Command) {
    const opts = this.optsWithGlobals() as Record<string, string | boolean>;
    const workspace = String(opts.workspace);
    const namespace = String(opts.namespace);
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.mkdirSync(workspace, { recursive: true });
    const service = createContextSidecarService(workspace);
    try {
      const seededItems = [
        service.addItem({
          namespace,
          item_type: "pinned_instruction",
          content: "Keep scope tight and prefer inspectable local behavior.",
          source_type: "manual_entry",
          priority: 100,
          status: "pinned",
          tags: ["demo"]
        }),
        service.addItem({
          namespace,
          item_type: "preference",
          content: "Prefer terse updates and practical implementation details.",
          source_type: "user_message",
          priority: 70,
          tags: ["demo"]
        }),
        service.addItem({
          namespace,
          item_type: "project_fact",
          content: "CLI, HTTP, and MCP all share the same storage-backed service.",
          source_type: "system_note",
          priority: 80,
          tags: ["demo"]
        }),
        service.addItem({
          namespace,
          item_type: "task_note",
          content: "Run pnpm eval and pnpm test before claiming the repo is ready.",
          source_type: "manual_entry",
          priority: 60,
          tags: ["demo"]
        })
      ];
      const pack = service.buildContextPack({
        namespace,
        task_query: "what should I know before working here?",
        max_items: 6,
        include_types: null,
        exclude_archived: true,
        now: null
      });
      const result = {
        ok: true,
        workspace,
        namespace,
        seeded: seededItems.length,
        pack
      };
      output(opts.json ? result : `${pack.rendered_text}\n\nWorkspace: ${workspace}`, Boolean(opts.json));
    } finally {
      service.storage.close();
    }
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

contextCommand
  .addCommand(
    new Command("add")
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
        await withService(String(opts.root), (service) => service.addItem({
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
      })
  )
  .addCommand(
    new Command("update")
      .requiredOption("--id <id>")
      .option("--content <content>")
      .option("--priority <priority>")
      .option("--status <status>")
      .option("--expires-at <expiresAt>")
      .option("--tag <tags...>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as Record<string, string | string[] | boolean | undefined>;
        await withService(String(opts.root), (service) => service.updateItem(String(opts.id), {
          ...(opts.content !== undefined ? { content: String(opts.content) } : {}),
          ...(opts.priority !== undefined ? { priority: Number(opts.priority) } : {}),
          ...(opts.status !== undefined ? { status: String(opts.status) as any } : {}),
          ...(opts.expiresAt !== undefined ? { expires_at: String(opts.expiresAt) } : {}),
          ...(opts.tag !== undefined ? { tags: opts.tag as string[] } : {})
        }), Boolean(opts.json));
      })
  )
  .addCommand(
    new Command("get")
      .requiredOption("--id <id>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as Record<string, string | boolean>;
        await withService(String(opts.root), (service) => service.getItem(String(opts.id)), Boolean(opts.json));
      })
  )
  .addCommand(
    new Command("list")
      .requiredOption("--namespace <namespace>")
      .option("--item-type <itemType>")
      .option("--status <status>")
      .option("--tag <tag>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as Record<string, string | boolean>;
        await withService(String(opts.root), (service) => service.listItems({
          namespace: String(opts.namespace),
          ...(opts.itemType ? { item_type: String(opts.itemType) as any } : {}),
          ...(opts.status ? { status: String(opts.status) as any } : {}),
          ...(opts.tag ? { tag: String(opts.tag) } : {})
        }), Boolean(opts.json));
      })
  )
  .addCommand(
    new Command("search")
      .requiredOption("--namespace <namespace>")
      .requiredOption("--query <query>")
      .option("--item-type <itemType>")
      .option("--status <status>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as Record<string, string | boolean>;
        await withService(String(opts.root), (service) => service.searchItems({
          namespace: String(opts.namespace),
          query: String(opts.query),
          ...(opts.itemType ? { item_type: String(opts.itemType) as any } : {}),
          ...(opts.status ? { status: String(opts.status) as any } : {})
        }), Boolean(opts.json));
      })
  )
  .addCommand(
    new Command("pack")
      .requiredOption("--namespace <namespace>")
      .option("--task-query <taskQuery>")
      .option("--max-items <maxItems>")
      .option("--include-type <types...>")
      .option("--include-archived", "include archived items in the pack", false)
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as Record<string, string | string[] | boolean>;
        await withService(String(opts.root), (service) => service.buildContextPack({
          namespace: String(opts.namespace),
          task_query: opts.taskQuery ? String(opts.taskQuery) : null,
          max_items: opts.maxItems ? Number(opts.maxItems) : null,
          include_types: (opts.includeType as string[] | undefined)?.map((value) => value as any) ?? null,
          exclude_archived: !Boolean(opts.includeArchived),
          now: null
        }), Boolean(opts.json));
      })
  )
  .addCommand(
    new Command("namespaces")
      .option("--now <now>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as Record<string, string | boolean>;
        await withService(String(opts.root), (service) => {
          const namespaces = opts.now ? service.listNamespaces({ now: String(opts.now) }) : service.listNamespaces();
          return namespaces;
        }, Boolean(opts.json));
      })
  )
  .addCommand(
    new Command("summary")
      .description("Show a compact workspace summary")
      .option("--now <now>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as Record<string, string | boolean>;
        await withService(String(opts.root), (service) => {
          const namespaces = opts.now ? service.listNamespaces({ now: String(opts.now) }) : service.listNamespaces();
          const totals = namespaces.reduce((accumulator, summary) => ({
            namespaceCount: accumulator.namespaceCount + 1,
            itemCount: accumulator.itemCount + summary.item_count,
            activeCount: accumulator.activeCount + summary.active_count,
            pinnedCount: accumulator.pinnedCount + summary.pinned_count,
            archivedCount: accumulator.archivedCount + summary.archived_count,
            expiredCount: accumulator.expiredCount + summary.expired_count
          }), {
            namespaceCount: 0,
            itemCount: 0,
            activeCount: 0,
            pinnedCount: 0,
            archivedCount: 0,
            expiredCount: 0
          });
          return {
            ok: true,
            rootPath: String(opts.root),
            storageExists: fs.existsSync(path.join(String(opts.root), "context-sidecar.sqlite")),
            namespaces,
            totals,
            recommendedNextStep: "Run `pnpm exec context-sidecar context bootstrap repo` to seed repo docs."
          };
        }, Boolean(opts.json));
      })
  )
  .addCommand(
    new Command("archive")
      .requiredOption("--id <id>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as Record<string, string | boolean>;
        await withService(String(opts.root), (service) => service.archiveItem(String(opts.id)), Boolean(opts.json));
      })
  )
  .addCommand(
    new Command("pin")
      .requiredOption("--id <id>")
      .action(async function (this: Command) {
        const opts = this.optsWithGlobals() as Record<string, string | boolean>;
        await withService(String(opts.root), (service) => service.pinItem(String(opts.id)), Boolean(opts.json));
      })
  )
  .addCommand(
    new Command("import")
      .description("Import content into context items")
      .addCommand(
        new Command("markdown")
          .description("Import markdown files or directories as context items")
          .requiredOption("--namespace <namespace>")
          .requiredOption("--input <paths...>")
          .option("--item-type <itemType>", "preference, profile_fact, project_fact, task_note, pinned_instruction, or workflow_note", "project_fact")
          .option("--source-type <sourceType>", "file, url, manual_entry, user_message, or system_note", "file")
          .option("--priority <priority>", "numeric priority", "0")
          .option("--status <status>", "active, pinned, archived, expired", "active")
          .option("--tag <tags...>")
          .action(async function (this: Command) {
            const opts = this.optsWithGlobals() as Record<string, string | string[] | boolean | undefined>;
            const inputs = Array.isArray(opts.input) ? opts.input.map(String) : [String(opts.input)];
            await withService(String(opts.root), (service) => {
              const imported = importMarkdownPaths(service, {
                namespace: String(opts.namespace),
                inputs,
                itemType: String(opts.itemType),
                sourceType: String(opts.sourceType),
                priority: Number(opts.priority ?? 0),
                status: String(opts.status),
                tags: (opts.tag as string[] | undefined) ?? []
              });
              return {
                ok: true,
                namespace: String(opts.namespace),
                import: imported
              };
            }, Boolean(opts.json));
          })
      )
  )
  .addCommand(
    new Command("bootstrap")
      .description("Seed the current repository into the sidecar")
      .addCommand(
        new Command("repo")
          .description("Import repo docs and instructions into a namespace")
          .option("--namespace <namespace>", "bootstrap namespace", "project:context-sidecar")
          .option("--priority <priority>", "numeric priority", "80")
          .option("--tag <tags...>")
          .action(async function (this: Command) {
            const opts = this.optsWithGlobals() as Record<string, string | string[] | boolean | undefined>;
            await withService(String(opts.root), (service) => {
              const sharedTags = uniqueStrings(["bootstrap", "repo", ...((opts.tag as string[] | undefined) ?? [])]);
              const namespace = String(opts.namespace);
              const priority = Number(opts.priority ?? 80);
              const imported = [
                {
                  label: "repo_docs",
                  result: importMarkdownPaths(service, {
                    namespace,
                    inputs: ["README.md", "ROADMAP.md", "docs"],
                    itemType: "project_fact",
                    sourceType: "file",
                    priority,
                    status: "active",
                    tags: sharedTags
                  })
                },
                {
                  label: "agent_contract",
                  result: importMarkdownPaths(service, {
                    namespace,
                    inputs: ["AGENTS.md"],
                    itemType: "pinned_instruction",
                    sourceType: "file",
                    priority: 100,
                    status: "pinned",
                    tags: sharedTags
                  })
                }
              ];
              return {
                ok: true,
                namespace,
                imports: imported
              };
            }, Boolean(opts.json));
          })
      )
  );

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
