import { afterEach, describe, expect, it } from "vitest";
import { createAppServer } from "../src/server.js";
import { apiRouteDefinitions } from "../src/routes.js";

describe("API server", () => {
  const servers: Array<{ app: { close: () => Promise<void> } }> = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await server.app.close();
    }
  });

  it("exposes health and project creation", async () => {
    const server = createAppServer({ rootPath: "./.tmp-api-test", provider: { kind: "mock", seed: "api" } });
    servers.push(server);
    const health = await server.app.inject({ method: "GET", url: "/v1/health" });
    expect(health.statusCode).toBe(200);
    const openapi = await server.app.inject({ method: "GET", url: "/v1/openapi.json" });
    expect(openapi.statusCode).toBe(200);
    const openapiBody = openapi.json() as { openapi: string; info: { title: string } };
    expect(openapiBody.openapi).toBe("3.1.0");
    expect(openapiBody.info.title).toBe("SynthKit API");
    const openapiPaths = (openapiBody as {
      paths?: Record<string, Record<string, { requestBody?: unknown }>>;
    }).paths;
    for (const route of apiRouteDefinitions) {
      const openapiPath = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      expect(openapiPaths?.[openapiPath]).toBeTruthy();
      expect(openapiPaths?.[openapiPath]?.[route.method]).toBeTruthy();
      if (route.requestBody) {
        expect(openapiPaths?.[openapiPath]?.[route.method]?.requestBody).toBeTruthy();
      }
    }
    const project = await server.app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "API test" }
    });
    expect(project.statusCode).toBe(200);
    const body = project.json() as { ok: boolean; data: { id: string } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toMatch(/^project_/);
  });

  it("supports full context sidecar flow", async () => {
    const server = createAppServer({ rootPath: "./.tmp-api-test-context", provider: { kind: "mock", seed: "api" } });
    servers.push(server);
    const created = await server.app.inject({ method: "POST", url: "/context", payload: { namespace: "project:repo-a", item_type: "pinned_instruction", content: "Never widen scope.", source_type: "manual_entry", source_reference: null, priority: 10, status: "pinned", expires_at: null, tags: ["scope"], metadata: {} } });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as { data: { id: string } };
    expect((await server.app.inject({ method: "GET", url: `/context/${createdBody.data.id}` })).statusCode).toBe(200);
    expect((await server.app.inject({ method: "GET", url: "/context?namespace=project:repo-a" })).statusCode).toBe(200);
    expect((await server.app.inject({ method: "POST", url: "/context/search", payload: { namespace: "project:repo-a", query: "widen scope" } })).statusCode).toBe(200);
    const packed = await server.app.inject({ method: "POST", url: "/context/pack", payload: { namespace: "project:repo-a", task_query: "scope", max_items: 4, include_types: null, exclude_archived: true, now: "2026-04-21T12:00:00.000Z" } });
    expect(packed.statusCode).toBe(200);
    expect((packed.json() as { data: { rendered_text: string } }).data.rendered_text).toContain("[Context Pack]");
    expect((await server.app.inject({ method: "POST", url: `/context/${createdBody.data.id}/pin` })).statusCode).toBe(200);
    expect((await server.app.inject({ method: "POST", url: `/context/${createdBody.data.id}/archive` })).statusCode).toBe(200);
  });

  it("requires an API token when the server is exposed beyond loopback", async () => {
    const server = createAppServer({
      rootPath: "./.tmp-api-test-auth",
      provider: { kind: "mock", seed: "auth" },
      listenHost: "0.0.0.0",
      apiToken: "super-secret-token"
    });
    servers.push(server);
    const denied = await server.app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Denied" }
    });
    expect(denied.statusCode).toBe(401);
    const allowed = await server.app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        authorization: "Bearer super-secret-token"
      },
      payload: { name: "Allowed" }
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("rejects file paths outside the workspace root through the API", async () => {
    const server = createAppServer({ rootPath: "./.tmp-api-test-paths", provider: { kind: "mock", seed: "paths" } });
    servers.push(server);
    const project = await server.app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Paths" }
    });
    expect(project.statusCode).toBe(200);
    const projectId = (project.json() as { data: { id: string } }).data.id;
    const outsidePath = "/tmp/contextsidecar-outside.pdf";
    const response = await server.app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/ingest/pdf`,
      payload: { filePath: outsidePath, title: "Outside PDF" }
    });
    expect(response.statusCode).toBe(400);
    const body = response.json() as { ok: boolean; error: { message: string } };
    expect(body.ok).toBe(false);
    expect(body.error.message).toMatch(/workspace root/i);
  });
});
