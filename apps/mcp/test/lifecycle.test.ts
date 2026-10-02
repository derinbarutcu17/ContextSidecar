import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = path.resolve(process.cwd(), "../..");
const cliEntry = path.join(repoRoot, "apps/cli/src/index.ts");

const cleanupRoots: string[] = [];
const freshRoot = () => {
  const root = path.join(process.cwd(), ".tmp-mcp-lifecycle", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(root, { recursive: true });
  cleanupRoots.push(root);
  return root;
};

const connectClient = async (root: string) => {
  const client = new Client({ name: "lifecycle-test", version: "1" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["--conditions=source", "--import", "tsx", cliEntry, "serve", "mcp", "--root", root],
    cwd: process.cwd()
  });
  await client.connect(transport);
  return { client, transport };
};

afterAll(() => {
  for (const root of cleanupRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("MCP server lifecycle", () => {
  it("serves consecutive sessions over the same workspace", async () => {
    const root = freshRoot();
    for (let i = 0; i < 3; i += 1) {
      const { client } = await connectClient(root);
      const health = await client.callTool({ name: "health_check", arguments: {} });
      const payload = JSON.parse((health.content as Array<{ text: string }>)[0]?.text ?? "{}") as { status: string };
      expect(payload.status).toBe("ok");
      await client.close();
    }
  });

  it("recovers with a fresh server after the previous one is killed", async () => {
    const root = freshRoot();
    const first = await connectClient(root);
    const health = await first.client.callTool({ name: "health_check", arguments: {} });
    expect(JSON.parse((health.content as Array<{ text: string }>)[0]?.text ?? "{}").status).toBe("ok");
    await first.transport.close();
    await expect(
      first.client.callTool({ name: "health_check", arguments: {} })
    ).rejects.toThrow();

    const second = await connectClient(root);
    const healthAfter = await second.client.callTool({ name: "health_check", arguments: {} });
    expect(JSON.parse((healthAfter.content as Array<{ text: string }>)[0]?.text ?? "{}").status).toBe("ok");
    await second.client.close();
  });

  it("keeps items and namespaces across server restarts", async () => {
    const root = freshRoot();
    const first = await connectClient(root);
    const added = await first.client.callTool({
      name: "context_add",
      arguments: { namespace: "project:persist", item_type: "pinned_instruction", content: "Survives restarts.", source_type: "manual_entry", status: "pinned" }
    });
    const item = JSON.parse((added.content as Array<{ text: string }>)[0]?.text ?? "{}") as { id: string };
    expect(item.id).toMatch(/^ctx_/);
    await first.client.close();

    const second = await connectClient(root);
    const listed = await second.client.callTool({ name: "context_list", arguments: { namespace: "project:persist" } });
    const items = JSON.parse((listed.content as Array<{ text: string }>)[0]?.text ?? "[]") as Array<{ id: string }>;
    expect(items.some((entry) => entry.id === item.id)).toBe(true);
    await second.client.close();
  });
});
