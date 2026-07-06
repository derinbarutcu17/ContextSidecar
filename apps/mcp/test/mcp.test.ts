import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import fs from "node:fs";

const repoRoot = path.resolve(process.cwd(), "../..");
const cliEntry = path.join(repoRoot, "apps/cli/src/index.ts");

const bootstrapRepo = (root: string) => {
  const output = execFileSync(
    "node",
    ["--conditions=source", "--import", "tsx", cliEntry, "context", "bootstrap", "repo", "--namespace", "project:context-sidecar", "--json", "--root", root],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );
  return JSON.parse(output) as {
    ok: boolean;
    namespace: string;
    imports: Array<{ label: string; result: { created: number; updated: number } }>;
  };
};

const connectClient = async (root: string) => {
  const client = new Client({ name: "test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["--conditions=source", "--import", "tsx", cliEntry, "serve", "mcp", "--root", root],
    cwd: process.cwd(),
  });
  await client.connect(transport);
  return client;
};

const parseTextContent = <T>(content: Array<{ text: string }> | undefined, label: string) => {
  const text = content?.[0]?.text;
  if (!text) {
    throw new Error(`Expected ${label} text`);
  }
  return JSON.parse(text) as T;
};

describe("MCP server", () => {
  afterAll(() => undefined);

  it("boots repo docs and is ready on a fresh client session", async () => {
    const root = path.join(process.cwd(), ".tmp-mcp-bootstrap");
    fs.rmSync(root, { recursive: true, force: true });

    const firstBootstrap = bootstrapRepo(root);
    expect(firstBootstrap.ok).toBe(true);
    expect(firstBootstrap.namespace).toBe("project:context-sidecar");
    expect(firstBootstrap.imports.map((entry) => entry.label)).toEqual(["repo_docs", "agent_contract"]);
    expect(firstBootstrap.imports[0]?.result.created).toBeGreaterThan(0);
    expect(firstBootstrap.imports[1]?.result.created).toBeGreaterThan(0);

    const secondBootstrap = bootstrapRepo(root);
    expect(secondBootstrap.ok).toBe(true);
    expect(secondBootstrap.imports.map((entry) => entry.label)).toEqual(["repo_docs", "agent_contract"]);
    expect(secondBootstrap.imports[0]?.result.created).toBe(0);
    expect(secondBootstrap.imports[0]?.result.updated).toBeGreaterThan(0);
    expect(secondBootstrap.imports[1]?.result.created).toBe(0);
    expect(secondBootstrap.imports[1]?.result.updated).toBeGreaterThan(0);

    const client = await connectClient(root);
    const health = await client.callTool({ name: "health_check", arguments: {} });
    const healthPayload = parseTextContent<{ status: string; rootPath: string }>(health.content as Array<{ text: string }>, "health");
    expect(healthPayload).toEqual({ status: "ok", rootPath: root });

    const list = await client.callTool({
      name: "context_list",
      arguments: { namespace: "project:context-sidecar" }
    });
    const items = parseTextContent<Array<{ item_type: string; source_reference: string | null }>>(list.content as Array<{ text: string }>, "context list");
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.item_type === "pinned_instruction")).toBe(true);

    const pack = await client.callTool({
      name: "context_pack",
      arguments: {
        namespace: "project:context-sidecar",
        task_query: "bootstrap readiness",
        max_items: 6,
        include_types: null,
        exclude_archived: true,
        now: "2026-04-21T12:00:00.000Z"
      }
    });
    const packed = parseTextContent<{ rendered_text: string }>(pack.content as Array<{ text: string }>, "context pack");
    expect(packed.rendered_text).toContain("[Context Pack]");

    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("lists tools and prompts", async () => {
    const client = await connectClient(path.join(process.cwd(), ".tmp-mcp-tools"));
    const tools = await client.listTools();
    expect(tools.tools.some((tool) => tool.name === "project_create")).toBe(true);
    expect(tools.tools.some((tool) => tool.name === "context_add")).toBe(true);
    const prompts = await client.listPrompts();
    expect(prompts.prompts.some((prompt) => prompt.name === "research_to_brief")).toBe(true);
    await client.close();
  });

  it("advertises dynamic resources after creating data", async () => {
    const client = await connectClient(path.join(process.cwd(), ".tmp-mcp-resources"));
    const created = (await client.callTool({
      name: "project_create",
      arguments: { name: "MCP resources" }
    })) as { content: Array<{ text: string }> };
    const createdContent = created.content[0];
    if (!createdContent) {
      throw new Error("Expected project creation content");
    }
    const project = JSON.parse(createdContent.text) as { id: string };
    await client.callTool({
      name: "source_ingest_text",
      arguments: { projectId: project.id, text: "MCP discovery matters." }
    });
    const synthesis = (await client.callTool({
      name: "synthesis_run",
      arguments: { projectId: project.id, mode: "brief", title: "MCP synthesis" }
    })) as { content: Array<{ text: string }> };
    const synthesisContent = synthesis.content[0];
    if (!synthesisContent) {
      throw new Error("Expected synthesis content");
    }
    const synthesisPayload = JSON.parse(synthesisContent.text) as { request: { id: string } };
    const resources = await client.listResources();
    expect(resources.resources.some((resource) => resource.uri === `project://${project.id}`)).toBe(true);
    expect(resources.resources.some((resource) => resource.uri === `project://${project.id}/sources`)).toBe(true);
    expect(resources.resources.some((resource) => resource.uri === `synthesis://${synthesisPayload.request.id}/draft`)).toBe(true);
    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates.some((template) => template.uriTemplate === "project://{projectId}")).toBe(true);
    expect(templates.resourceTemplates.some((template) => template.uriTemplate === "synthesis://{synthesisId}/draft")).toBe(true);
    const draftResource = await client.readResource({ uri: `synthesis://${synthesisPayload.request.id}/draft` });
    const draftContent = draftResource.contents[0];
    if (!draftContent || !("text" in draftContent)) {
      throw new Error("Expected text draft resource");
    }
    expect(draftContent.text).toContain("Executive Summary");
    await client.close();
  });

  it("makes fresh synthesis runs visible as resources", async () => {
    const client = await connectClient(path.join(process.cwd(), ".tmp-mcp-fresh-run"));
    const created = (await client.callTool({
      name: "project_create",
      arguments: { name: "Fresh run visibility" }
    })) as { content: Array<{ text: string }> };
    const project = parseTextContent<{ id: string }>(created.content as Array<{ text: string }>, "project create");

    await client.callTool({
      name: "source_ingest_text",
      arguments: { projectId: project.id, text: "Fresh runs should appear in resources immediately." }
    });

    const before = await client.listResources();
    expect(before.resources.some((resource) => resource.uri === `synthesis://${project.id}/draft`)).toBe(false);

    const synthesis = (await client.callTool({
      name: "synthesis_run",
      arguments: { projectId: project.id, mode: "brief", title: "Fresh run synthesis" }
    })) as { content: Array<{ text: string }> };
    const run = parseTextContent<{ request: { id: string } }>(synthesis.content as Array<{ text: string }>, "synthesis run");

    const after = await client.listResources();
    expect(after.resources.some((resource) => resource.uri === `synthesis://${run.request.id}/draft`)).toBe(true);
    expect(after.resources.some((resource) => resource.uri === `synthesis://${run.request.id}/citations`)).toBe(true);
    expect(after.resources.some((resource) => resource.uri === `synthesis://${run.request.id}/contradictions`)).toBe(true);

    const draft = await client.callTool({
      name: "synthesis_get_draft",
      arguments: { synthesisId: run.request.id }
    });
    const draftPayload = parseTextContent<{ synthesisId: string }>(draft.content as Array<{ text: string }>, "synthesis draft");
    expect(draftPayload.synthesisId).toBe(run.request.id);

    await client.close();
  });

  it("links run results to the synthesis id returned by synthesis_run", async () => {
    const client = await connectClient(path.join(process.cwd(), ".tmp-mcp-run-link"));
    const created = (await client.callTool({
      name: "project_create",
      arguments: { name: "Run linkage" }
    })) as { content: Array<{ text: string }> };
    const project = parseTextContent<{ id: string }>(created.content as Array<{ text: string }>, "project create");

    await client.callTool({
      name: "source_ingest_text",
      arguments: { projectId: project.id, text: "Link the run result back to the same synthesis id." }
    });

    const synthesis = (await client.callTool({
      name: "synthesis_run",
      arguments: { projectId: project.id, mode: "brief", title: "Run linkage synthesis" }
    })) as { content: Array<{ text: string }> };
    const run = parseTextContent<{ request: { id: string } }>(synthesis.content as Array<{ text: string }>, "synthesis run");

    const draftResource = await client.readResource({ uri: `synthesis://${run.request.id}/draft` });
    const draftContent = draftResource.contents[0];
    if (!draftContent || !("text" in draftContent)) {
      throw new Error("Expected text draft resource");
    }
    const draft = JSON.parse(draftContent.text) as { synthesisId: string; id: string };
    expect(draft.synthesisId).toBe(run.request.id);
    expect(draft.id).toMatch(/^draft_/);

    const directDraft = await client.callTool({
      name: "synthesis_get_draft",
      arguments: { synthesisId: run.request.id }
    });
    const directDraftPayload = parseTextContent<{ synthesisId: string }>(directDraft.content as Array<{ text: string }>, "direct draft");
    expect(directDraftPayload.synthesisId).toBe(run.request.id);

    await client.close();
  });

  it("supports the context tool flow", async () => {
    const client = await connectClient(path.join(process.cwd(), ".tmp-mcp-context"));
    const created = (await client.callTool({ name: "context_add", arguments: { namespace: "project:repo-a", item_type: "pinned_instruction", content: "Never widen scope.", source_type: "manual_entry", status: "pinned" } })) as { content: Array<{ text: string }> };
    const createdItem = JSON.parse(created.content[0]?.text ?? "{}") as { id: string };
    expect(createdItem.id).toMatch(/^ctx_/);
    const pack = (await client.callTool({ name: "context_pack", arguments: { namespace: "project:repo-a", task_query: "scope", max_items: 4, include_types: null, exclude_archived: true, now: "2026-04-21T12:00:00.000Z" } })) as { content: Array<{ text: string }> };
    const packed = JSON.parse(pack.content[0]?.text ?? "{}") as { items: Array<{ id: string }>; rendered_text: string };
    expect(packed.items[0]?.id).toBe(createdItem.id);
    expect(packed.rendered_text).toContain("[Context Pack]");
    await client.close();
  });

  it("lists namespaces through MCP", async () => {
    const root = path.join(process.cwd(), ".tmp-mcp-namespaces");
    fs.rmSync(root, { recursive: true, force: true });
    const client = await connectClient(root);
    await client.callTool({ name: "context_add", arguments: { namespace: "project:repo-a", item_type: "pinned_instruction", content: "One.", source_type: "manual_entry", status: "pinned" } });
    await client.callTool({ name: "context_add", arguments: { namespace: "project:repo-b", item_type: "workflow_note", content: "Two.", source_type: "manual_entry" } });
    const namespaces = (await client.callTool({ name: "context_list_namespaces", arguments: { now: "2026-04-21T12:00:00.000Z" } })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(namespaces.content[0]?.text ?? "[]") as Array<{ namespace: string; item_count: number }>;
    expect(parsed.map((entry) => entry.namespace)).toEqual(["project:repo-b", "project:repo-a"]);
    expect(parsed[0]?.item_count).toBeGreaterThan(0);
    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
});
