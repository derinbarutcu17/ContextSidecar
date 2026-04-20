import { SynthKitEngine, type SynthKitConfig } from "@synthkit/core";
import {
  CapabilityManifestV1Schema,
  CitationV1Schema,
  ContradictionV1Schema,
  DraftV1Schema,
  ExportArtifactV1Schema,
  ProjectV1Schema,
  RevisionV1Schema,
  SynthesisModeV1Schema,
  type ProjectV1,
  type SynthesisModeV1
} from "@synthkit/domain";
import { z } from "zod";

const ApiResponseSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string()
    })
    .optional()
});

export class SynthKitClientError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, options: { code?: string; status?: number; details?: unknown } = {}) {
    super(message);
    this.name = "SynthKitClientError";
    this.code = options.code ?? "client_error";
    if (options.status !== undefined) {
      this.status = options.status;
    }
    this.details = options.details;
  }
}

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class SynthKitApiClient {
  readonly baseUrl: string;
  readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async health() {
    return this.get("/v1/health");
  }

  async version() {
    return this.get("/v1/version");
  }

  async capabilities() {
    const response = await this.get("/v1/capabilities");
    return CapabilityManifestV1Schema.parse(response);
  }

  async listProjects(): Promise<ProjectV1[]> {
    return ProjectV1Schema.array().parse(await this.get("/v1/projects"));
  }

  async createProject(input: { name: string; description?: string; defaultMode?: SynthesisModeV1 }) {
    return ProjectV1Schema.parse(await this.post("/v1/projects", input));
  }

  async getProject(projectId: string) {
    return ProjectV1Schema.parse(await this.get(`/v1/projects/${encodeURIComponent(projectId)}`));
  }

  async ingestText(projectId: string, input: { text: string; title?: string }) {
    return this.post(`/v1/projects/${encodeURIComponent(projectId)}/ingest/text`, input);
  }

  async ingestMarkdown(projectId: string, input: { markdown: string; title?: string }) {
    return this.post(`/v1/projects/${encodeURIComponent(projectId)}/ingest/markdown`, { markdown: input.markdown, title: input.title });
  }

  async ingestUrl(projectId: string, input: { url: string; title?: string }) {
    return this.post(`/v1/projects/${encodeURIComponent(projectId)}/ingest/url`, input);
  }

  async ingestPdf(projectId: string, input: { filePath: string; title?: string }) {
    return this.post(`/v1/projects/${encodeURIComponent(projectId)}/ingest/pdf`, input);
  }

  async ingestImage(projectId: string, input: { filePath: string; title?: string }) {
    return this.post(`/v1/projects/${encodeURIComponent(projectId)}/ingest/image`, input);
  }

  async ingestTranscript(projectId: string, input: { transcript: string; title?: string }) {
    return this.post(`/v1/projects/${encodeURIComponent(projectId)}/ingest/transcript`, input);
  }

  async synthesize(projectId: string, input: { mode: SynthesisModeV1; title: string; question?: string; audience?: string; desiredDirections?: 2 | 3; sourceIds?: string[] }) {
    return this.post(`/v1/projects/${encodeURIComponent(projectId)}/synthesize`, input);
  }

  async getDraft(synthesisId: string) {
    return DraftV1Schema.parse(await this.get(`/v1/syntheses/${encodeURIComponent(synthesisId)}/draft`));
  }

  async getCitations(synthesisId: string) {
    return CitationV1Schema.array().parse(await this.get(`/v1/syntheses/${encodeURIComponent(synthesisId)}/citations`));
  }

  async getContradictions(synthesisId: string) {
    return ContradictionV1Schema.array().parse(await this.get(`/v1/syntheses/${encodeURIComponent(synthesisId)}/contradictions`));
  }

  async getRevisions(synthesisId: string) {
    return RevisionV1Schema.array().parse(await this.get(`/v1/syntheses/${encodeURIComponent(synthesisId)}/revisions`));
  }

  async exportMarkdown(synthesisId: string) {
    return ExportArtifactV1Schema.parse(await this.post(`/v1/syntheses/${encodeURIComponent(synthesisId)}/export`, { format: "markdown" }));
  }

  async exportJson(synthesisId: string) {
    return ExportArtifactV1Schema.parse(await this.post(`/v1/syntheses/${encodeURIComponent(synthesisId)}/export`, { format: "json" }));
  }

  async createRevision(synthesisId: string, input: { sectionId: string; body: string; reason: string; actor?: string }) {
    return RevisionV1Schema.parse(await this.post(`/v1/syntheses/${encodeURIComponent(synthesisId)}/revisions`, input));
  }

  async getStages(synthesisId: string) {
    return this.get(`/v1/syntheses/${encodeURIComponent(synthesisId)}/stages`);
  }

  private async get(pathname: string) {
    return this.request(pathname, { method: "GET" });
  }

  private async post(pathname: string, body: unknown) {
    return this.request(pathname, { method: "POST", body: JSON.stringify(body) });
  }

  private async request(pathname: string, init: RequestInit) {
    const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });
    const payload = ApiResponseSchema.parse(await response.json());
    if (!response.ok || !payload.ok) {
      throw new SynthKitClientError(payload.error?.message ?? response.statusText, {
        ...(payload.error?.code ? { code: payload.error.code } : {}),
        status: response.status,
        details: payload
      });
    }
    return payload.data;
  }
}

export class SynthKitCoreClient {
  readonly engine: SynthKitEngine;

  constructor(config: SynthKitConfig) {
    this.engine = new SynthKitEngine(config);
  }

  createProject(input: { name: string; description?: string | null; defaultMode?: SynthesisModeV1 }) {
    return this.engine.createProject(input);
  }

  listProjects() {
    return this.engine.listProjects();
  }

  getProject(projectId: string) {
    return this.engine.getProject(projectId);
  }

  ingestText(projectId: string, text: string, title?: string) {
    return this.engine.ingestText(projectId, text, title);
  }

  ingestMarkdown(projectId: string, markdown: string, title?: string) {
    return this.engine.ingestMarkdown(projectId, markdown, title);
  }

  ingestUrl(projectId: string, url: string, title?: string) {
    return this.engine.ingestUrl(projectId, url, title);
  }

  ingestPdf(projectId: string, filePath: string, title?: string) {
    return this.engine.ingestPdf(projectId, filePath, title);
  }

  ingestImage(projectId: string, filePath: string, title?: string) {
    return this.engine.ingestImage(projectId, filePath, title);
  }

  ingestTranscript(projectId: string, transcript: string, title?: string) {
    return this.engine.ingestTranscript(projectId, transcript, title);
  }

  runSynthesis(input: Parameters<SynthKitEngine["runSynthesis"]>[0]) {
    return this.engine.runSynthesis(input);
  }

  getDraft(synthesisId: string) {
    return this.engine.getDraft(synthesisId);
  }

  getCitations(synthesisId: string) {
    return this.engine.listCitations(synthesisId);
  }

  getContradictions(synthesisId: string) {
    return this.engine.listContradictions(synthesisId);
  }

  reviseSection(synthesisId: string, sectionId: string, body: string, reason: string, actor?: string) {
    return this.engine.reviseSection(synthesisId, sectionId, body, reason, actor);
  }

  exportMarkdown(synthesisId: string) {
    return this.engine.exportMarkdown(synthesisId);
  }

  exportJson(synthesisId: string) {
    return this.engine.exportJson(synthesisId);
  }

  close() {
    return this.engine.close();
  }
}

export {
  CapabilityManifestV1Schema,
  CitationV1Schema,
  ContradictionV1Schema,
  DraftV1Schema,
  ExportArtifactV1Schema,
  ProjectV1Schema,
  RevisionV1Schema,
  SynthesisModeV1Schema
} from "@synthkit/domain";
