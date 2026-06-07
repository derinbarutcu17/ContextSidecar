import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import fs from "node:fs";

describe("MCP server", () => {
  afterAll(() => undefined);

  it("lists tools and prompts", async () => {
    const client = new Client({ name: "test", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: "node",
      args: ["--conditions=source", "--import", "tsx", path.join(process.cwd(), "src/index.ts")],
      cwd: process.cwd()
    });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.some((tool) => tool.name === "project_create")).toBe(true);
    expect(tools.tools.some((tool) => tool.name === "context_add")).toBe(true);
    const prompts = await client.listPrompts();
    expect(prompts.prompts.some((prompt) => prompt.name === "research_to_brief")).toBe(true);
    await client.close();
  });

  it("advertises dynamic resources after creating data", async () => {
    const client = new Client({ name: "test", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: "node",
      args: ["--conditions=source", "--import", "tsx", path.join(process.cwd(), "src/index.ts")],
      cwd: process.cwd()
    });
    await client.connect(transport);
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

  it("supports the context tool flow", async () => {
    const client = new Client({ name: "test", version: "0.1.0" });
    const transport = new StdioClientTransport({ command: "node", args: ["--conditions=source", "--import", "tsx", path.join(process.cwd(), "src/index.ts")], cwd: process.cwd() });
    await client.connect(transport);
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
    const client = new Client({ name: "test", version: "0.1.0" });
    const transport = new StdioClientTransport({ command: "node", args: ["--conditions=source", "--import", "tsx", path.join(process.cwd(), "src/index.ts"), "--root", root], cwd: process.cwd() });
    await client.connect(transport);
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
