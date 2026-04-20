import path from "node:path";
import {
  CapabilityManifestV1Schema,
  type CapabilityManifestV1,
  type CitationV1,
  type ChunkV1,
  type ConfidenceBandV1,
  type ConfidenceReportV1,
  type ContradictionV1,
  type DraftSectionV1,
  type DraftV1,
  type ExportArtifactV1,
  type ProjectV1,
  type RevisionV1,
  type SourceV1,
  type SynthesisModeV1,
  type SynthesisRequestV1,
  type ThemeClusterV1,
  nowIso
} from "@synthkit/domain";
import { createIngestor, type IngestResult } from "@synthkit/ingest";
import { createMockProvider, createProvider, type ProviderConfig, type SynthKitProvider } from "@synthkit/providers";
import { makeId, median, sha256, toSafeFilename, truncate, uniq } from "@synthkit/shared";
import { createStorage, type SynthKitStorage } from "@synthkit/storage";
export { ContextSidecarService, createContextSidecarService } from "./context-service.js";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "have",
  "has",
  "are",
  "was",
  "were",
  "not",
  "will",
  "about",
  "into",
  "your",
  "their",
  "there",
  "what",
  "when",
  "where",
  "which",
  "they",
  "them",
  "our",
  "can",
  "you",
  "use",
  "used",
  "should",
  "would",
  "could",
  "need",
  "needs",
  "more",
  "than",
  "less",
  "best"
]);

export interface SynthKitConfig {
  rootPath: string;
  provider?: ProviderConfig;
}

export interface StageTraceRecord {
  stage: string;
  startedAt: string;
  finishedAt: string;
  inputSummary: string;
  outputSummary: string;
}

export interface SynthesisBundle {
  project: ProjectV1;
  request: SynthesisRequestV1;
  draft: DraftV1;
  citations: CitationV1[];
  contradictions: ContradictionV1[];
  themeClusters: ThemeClusterV1[];
  confidenceReport: ConfidenceReportV1;
  stageTrace: StageTraceRecord[];
}

export interface ProjectCreateInput {
  name: string;
  description?: string | null;
  defaultMode?: SynthesisModeV1;
}

export interface SynthesisRunInput {
  projectId: string;
  mode: SynthesisModeV1;
  title: string;
  question?: string | null;
  audience?: string | null;
  desiredDirections?: 2 | 3;
  sourceIds?: string[];
}

const now = () => new Date().toISOString();

const summarize = (value: unknown) => truncate(JSON.stringify(value, null, 2), 800);

const words = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));

const scoreOverlap = (a: string, b: string) => {
  const left = new Set(words(a));
  const right = new Set(words(b));
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
};

const sectionSpecs: Record<SynthesisModeV1, { key: string; title: string; prompt: string }[]> = {
  brief: [
    { key: "summary", title: "Executive Summary", prompt: "Summarize the core situation in plain English." },
    { key: "themes", title: "Key Themes", prompt: "Explain the most important patterns and evidence." },
    { key: "directions", title: "Recommended Directions", prompt: "Offer 2-3 practical directions." },
    { key: "contradictions", title: "Contradictions and Gaps", prompt: "Call out conflicts and missing evidence." }
  ],
  decision_memo: [
    { key: "decision", title: "Decision", prompt: "State the decision or recommendation clearly." },
    { key: "options", title: "Options", prompt: "Compare 2-3 options." },
    { key: "tradeoffs", title: "Tradeoffs", prompt: "Explain tradeoffs and risks." },
    { key: "evidence", title: "Evidence", prompt: "Cite the evidence used." }
  ],
  deck_outline: [
    { key: "narrative", title: "Storyline", prompt: "Shape the narrative into slides." },
    { key: "slides", title: "Slide Outline", prompt: "Map the deck into 5-8 slides." },
    { key: "proof", title: "Proof Points", prompt: "Provide supporting evidence." },
    { key: "risks", title: "Risks and Questions", prompt: "List questions and risks." }
  ]
};

interface ProposedStructure {
  synthesisId: string;
  specs: Array<{ key: string; title: string; prompt: string; sectionId: string }>;
  directions: Array<{ id: string; label: string; rationale: string; evidenceChunkIds: string[] }>;
  gapAnalysis: { insufficientEvidence: boolean; note: string; sourceCount: number; chunkCount: number; projectName: string };
}

export class SynthKitEngine {
  readonly storage: SynthKitStorage;
  readonly provider: SynthKitProvider;
  readonly rootPath: string;
  readonly ingestor: ReturnType<typeof createIngestor>;

  constructor(config: SynthKitConfig) {
    this.rootPath = config.rootPath;
    this.storage = createStorage(config.rootPath);
    this.provider = config.provider ? createProvider(config.provider) : createMockProvider();
    this.ingestor = createIngestor(config.rootPath, this.provider);
  }

  close() {
    this.storage.close();
  }

  getManifest(): CapabilityManifestV1 {
    return this.storage.getManifest();
  }

  createProject(input: ProjectCreateInput): ProjectV1 {
    const project: ProjectV1 = {
      schemaVersion: 1,
      id: `project_${sha256(`${this.rootPath}:${input.name}:${now()}`).slice(0, 16)}`,
      name: input.name,
      description: input.description ?? null,
      createdAt: now(),
      updatedAt: now(),
      storage: {
        rootPath: this.rootPath,
        databasePath: path.join(this.rootPath, "synthkit.sqlite")
      },
      settings: {
        defaultMode: input.defaultMode ?? "brief",
        provider: this.provider.kind,
        locale: "en"
      }
    };
    return this.storage.ensureProject(project);
  }

  listProjects() {
    return this.storage.listProjects();
  }

  getProject(projectId: string) {
    return this.storage.getProject(projectId);
  }

  async ingestText(projectId: string, text: string, title?: string) {
    return this.ingestor.ingestText({ projectId, text, ...(title ? { title } : {}) });
  }

  async ingestMarkdown(projectId: string, markdown: string, title?: string) {
    return this.ingestor.ingestMarkdown({ projectId, markdown, ...(title ? { title } : {}) });
  }

  async ingestUrl(projectId: string, url: string, title?: string) {
    return this.ingestor.ingestUrl({ projectId, url, ...(title ? { title } : {}) });
  }

  async ingestPdf(projectId: string, filePath: string, title?: string) {
    return this.ingestor.ingestPdf({ projectId, filePath, ...(title ? { title } : {}) });
  }

  async ingestImage(projectId: string, filePath: string, title?: string) {
    return this.ingestor.ingestImage({ projectId, filePath, ...(title ? { title } : {}) });
  }

  async ingestTranscript(projectId: string, transcript: string, title?: string) {
    return this.ingestor.ingestTranscript({ projectId, transcript, ...(title ? { title } : {}) });
  }

  async runSynthesis(input: SynthesisRunInput): Promise<SynthesisBundle> {
    const project = this.storage.getProject(input.projectId);
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`);
    }
    const request = this.createRequest(input);
    const stageTrace: StageTraceRecord[] = [];

    const allSources = this.storage.listSources(project.id);
    const sources = input.sourceIds?.length
      ? allSources.filter((source) => input.sourceIds?.includes(source.id))
      : allSources;
    const chunks = sources.flatMap((source) => this.storage.getChunksBySource(source.id));

    const normalizedChunks = this.normalizeChunks(chunks);
    stageTrace.push(this.trace("source_normalization", chunks, normalizedChunks));

    const metadata = this.extractMetadata(normalizedChunks);
    stageTrace.push(this.trace("metadata_extraction", normalizedChunks, metadata));

    const evidenceCandidates = this.recallEvidence(normalizedChunks, request);
    stageTrace.push(this.trace("evidence_retrieval", metadata, evidenceCandidates));

    const themeClusters = this.clusterThemes(evidenceCandidates, request.id);
    stageTrace.push(this.trace("thematic_clustering", evidenceCandidates, themeClusters));

    const contradictions = this.detectContradictions(evidenceCandidates, request.id);
    stageTrace.push(this.trace("contradiction_detection", evidenceCandidates, contradictions));

    const gapAnalysis = this.detectGaps(project, evidenceCandidates, contradictions);
    stageTrace.push(this.trace("gap_detection", contradictions, gapAnalysis));

    const structure = this.proposeStructure(request, themeClusters, gapAnalysis);
    stageTrace.push(this.trace("structure_proposal", themeClusters, structure));

    const citations = this.mapCitations(structure, evidenceCandidates, contradictions);
    stageTrace.push(this.trace("citation_mapping", structure, citations));

    const sections = this.buildSections(request, structure, citations, contradictions, themeClusters, gapAnalysis);
    stageTrace.push(this.trace("draft_generation", structure, sections));

    const confidenceReport = this.estimateConfidence(request, sections, citations, contradictions, themeClusters);
    stageTrace.push(this.trace("confidence_estimation", sections, confidenceReport));

    const draft: DraftV1 = {
      schemaVersion: 1,
      id: `draft_${sha256(`${request.id}:${project.id}`).slice(0, 16)}`,
      synthesisId: request.id,
      mode: request.mode,
      title: request.title,
      summary: this.buildSummary(request, themeClusters, contradictions, confidenceReport),
      directions: structure.directions,
      sections,
      themeClusterIds: themeClusters.map((cluster) => cluster.id),
      contradictionIds: contradictions.map((item) => item.id),
      confidenceReport,
      createdAt: now(),
      updatedAt: now(),
      revisionIds: [],
      metadata: {
        sourceCount: sources.length,
        chunkCount: chunks.length,
        evidenceCount: evidenceCandidates.length
      }
    };

    for (const cluster of themeClusters) {
      this.storage.upsertThemeCluster(cluster);
    }
    for (const contradiction of contradictions) {
      this.storage.upsertContradiction(contradiction);
    }
    for (const citation of citations) {
      this.storage.upsertCitation({
        id: citation.id,
        synthesisId: citation.synthesisId,
        sectionId: citation.sectionId,
        chunkId: citation.chunkId,
        sourceId: citation.sourceId,
        supportType: citation.supportType,
        data: citation,
        createdAt: citation.createdAt
      });
    }

    this.storage.saveSynthesis({
      id: request.id,
      request,
      draft,
      confidenceReport,
      stageTrace
    });

    const bundle: SynthesisBundle = {
      project,
      request,
      draft,
      citations,
      contradictions,
      themeClusters,
      confidenceReport,
      stageTrace
    };
    return bundle;
  }

  getDraft(synthesisId: string) {
    return this.storage.getDraft(synthesisId);
  }

  listCitations(synthesisId: string) {
    return this.storage.listCitations(synthesisId);
  }

  listContradictions(synthesisId: string) {
    return this.storage.listContradictions(synthesisId);
  }

  listRevisions(synthesisId: string) {
    return this.storage.listRevisions(synthesisId);
  }

  listExports(synthesisId: string) {
    return this.storage.listExports(synthesisId);
  }

  reviseSection(synthesisId: string, sectionId: string, body: string, reason: string, actor = "local") {
    const draft = this.getDraft(synthesisId);
    const synthesisRecord = this.storage.getSynthesisRecord(synthesisId);
    if (!draft) throw new Error(`Draft not found: ${synthesisId}`);
    if (!synthesisRecord?.request) throw new Error(`Request record not found for synthesis ${synthesisId}`);
    const section = draft.sections.find((item) => item.id === sectionId);
    if (!section) throw new Error(`Section not found: ${sectionId}`);
    const revisedSection: DraftSectionV1 = {
      ...section,
      body,
      status: "final",
      updatedAt: now()
    };
    const revision: RevisionV1 = {
      schemaVersion: 1,
      id: `revision_${sha256(`${synthesisId}:${sectionId}:${body}`).slice(0, 16)}`,
      synthesisId,
      sectionId,
      before: section.body,
      after: body,
      reason,
      actor,
      createdAt: now(),
      metadata: { bodyLengthDelta: body.length - section.body.length }
    };
    this.storage.upsertRevision(revision);
    const updatedSections = draft.sections.map((item) => (item.id === sectionId ? revisedSection : item));
    const updatedDraft: DraftV1 = {
      ...draft,
      sections: updatedSections,
      revisionIds: uniq([...draft.revisionIds, revision.id]),
      updatedAt: now()
    };
    const confidenceReport = { ...draft.confidenceReport, updatedAt: now() } as ConfidenceReportV1;
    this.storage.saveSynthesis({
      id: synthesisId,
      request: synthesisRecord.request,
      draft: updatedDraft,
      confidenceReport,
      stageTrace: synthesisRecord.stageTrace
    });
    return { draft: updatedDraft, revision };
  }

  exportMarkdown(synthesisId: string) {
    const draft = this.getDraft(synthesisId);
    if (!draft) throw new Error(`Draft not found: ${synthesisId}`);
    const content = draft.sections
      .map((section) => `## ${section.title}\n\n${section.body}\n`)
      .join("\n");
    const artifact: ExportArtifactV1 = {
      schemaVersion: 1,
      id: `export_${sha256(`${synthesisId}:markdown:${content}`).slice(0, 16)}`,
      synthesisId,
      format: "markdown",
      path: `${toSafeFilename(draft.title)}.md`,
      content,
      checksum: sha256(content),
      createdAt: now(),
      metadata: {}
    };
    this.storage.upsertExportArtifact(artifact);
    return artifact;
  }

  exportJson(synthesisId: string) {
    const draft = this.getDraft(synthesisId);
    if (!draft) throw new Error(`Draft not found: ${synthesisId}`);
    const content = JSON.stringify(draft, null, 2);
    const artifact: ExportArtifactV1 = {
      schemaVersion: 1,
      id: `export_${sha256(`${synthesisId}:json:${content}`).slice(0, 16)}`,
      synthesisId,
      format: "json",
      path: `${toSafeFilename(draft.title)}.json`,
      content,
      checksum: sha256(content),
      createdAt: now(),
      metadata: {}
    };
    this.storage.upsertExportArtifact(artifact);
    return artifact;
  }

  private createRequest(input: SynthesisRunInput): SynthesisRequestV1 {
    return {
      schemaVersion: 1,
      id: `synth_${sha256(`${input.projectId}:${input.mode}:${input.title}:${now()}`).slice(0, 16)}`,
      projectId: input.projectId,
      mode: input.mode,
      title: input.title,
      question: input.question ?? null,
      audience: input.audience ?? null,
      sourceIds: input.sourceIds ?? [],
      desiredDirections: input.desiredDirections ?? 3,
      createdAt: now(),
      metadata: {}
    };
  }

  private normalizeChunks(chunks: ChunkV1[]) {
    return chunks.map((chunk) => ({
      ...chunk,
      content: chunk.content.trim().replace(/\n{3,}/g, "\n\n")
    }));
  }

  private extractMetadata(chunks: ChunkV1[]) {
    return {
      totalChunks: chunks.length,
      uniqueSources: uniq(chunks.map((chunk) => chunk.sourceId)).length,
      avgTokens: median(chunks.map((chunk) => chunk.tokenEstimate))
    };
  }

  private recallEvidence(chunks: ChunkV1[], request: SynthesisRequestV1) {
    const query = `${request.title} ${request.question ?? ""} ${request.audience ?? ""}`;
    return [...chunks]
      .map((chunk) => ({
        chunk,
        score: scoreOverlap(chunk.content, query) + Math.min(6, chunk.tokenEstimate / 300)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(6, Math.min(18, chunks.length)));
  }

  private clusterThemes(evidence: { chunk: ChunkV1; score: number }[], synthesisId: string) {
    const buckets = new Map<string, { chunks: ChunkV1[]; weight: number }>();
    for (const item of evidence) {
      const key = words(item.chunk.content)[0] ?? "general";
      const bucket = buckets.get(key) ?? { chunks: [], weight: 0 };
      bucket.chunks.push(item.chunk);
      bucket.weight += item.score;
      buckets.set(key, bucket);
    }
    return [...buckets.entries()].slice(0, 4).map(([key, bucket], index) => ({
      schemaVersion: 1 as const,
      id: `theme_${sha256(`${key}:${index}:${bucket.chunks.map((chunk) => chunk.id).join(",")}`).slice(0, 16)}`,
      synthesisId,
      label: key.replace(/-/g, " "),
      summary: `Clustered evidence around ${key}.`,
      chunkIds: bucket.chunks.map((chunk) => chunk.id),
      evidenceCount: bucket.chunks.length,
      confidence: Math.min(1, bucket.weight / 10),
      createdAt: now(),
      metadata: { topKeyword: key }
    })) satisfies ThemeClusterV1[];
  }

  private detectContradictions(evidence: { chunk: ChunkV1; score: number }[], synthesisId: string) {
    const contradictions: ContradictionV1[] = [];
    for (let index = 0; index < evidence.length; index += 1) {
      for (let other = index + 1; other < evidence.length; other += 1) {
        const a = evidence[index]?.chunk;
        const b = evidence[other]?.chunk;
        if (!a || !b) continue;
        const negationConflict =
          /not\s+\w+/i.test(a.content) !== /not\s+\w+/i.test(b.content) &&
          scoreOverlap(a.content, b.content) > 1;
        const numericConflict = hasConflictingNumbers(a.content, b.content);
        if (!negationConflict && !numericConflict) continue;
        contradictions.push({
          schemaVersion: 1,
          id: `contra_${sha256(`${a.id}:${b.id}`).slice(0, 16)}`,
          synthesisId,
          claimA: truncate(a.content, 160),
          claimB: truncate(b.content, 160),
          description: numericConflict
            ? "The sources present different numeric claims about the same topic."
            : "The sources disagree on the direction or polarity of the claim.",
          severity: numericConflict ? "high" : "medium",
          evidenceChunkIds: [a.id, b.id],
          status: "open",
          confidence: 0.65,
          createdAt: now(),
          metadata: {}
        });
      }
    }
    return contradictions.slice(0, 6);
  }

  private detectGaps(
    project: ProjectV1,
    evidence: { chunk: ChunkV1; score: number }[],
    contradictions: ContradictionV1[]
  ): ProposedStructure["gapAnalysis"] {
    const chunkCount = evidence.length;
    const sourceCount = uniq(evidence.map((item) => item.chunk.sourceId)).length;
    return {
      insufficientEvidence: chunkCount < 3 || sourceCount < 2,
      note: chunkCount < 3
        ? "There are too few evidence chunks to support a confident synthesis."
        : contradictions.length > 3
          ? "The evidence contains several contradictions that need review."
          : "Evidence coverage is acceptable.",
      sourceCount,
      chunkCount,
      projectName: project.name
    };
  }

  private proposeStructure(request: SynthesisRequestV1, clusters: ThemeClusterV1[], gapAnalysis: ProposedStructure["gapAnalysis"]): ProposedStructure {
    const specs = sectionSpecs[request.mode];
    const directions = [
      {
        id: `direction_${sha256(`${request.mode}:${clusters.map((item) => item.id).join(":")}:1`).slice(0, 12)}`,
        label: clusters[0]?.label ? `Double down on ${clusters[0].label}` : "Proceed with the clearest path",
        rationale: gapAnalysis.insufficientEvidence
          ? "The evidence is thin, so favor the direction with the least assumption load."
          : "The strongest cluster gives the best signal-to-risk ratio.",
        evidenceChunkIds: clusters[0]?.chunkIds ?? []
      },
      {
        id: `direction_${sha256(`${request.mode}:${clusters.map((item) => item.id).join(":")}:2`).slice(0, 12)}`,
        label: clusters[1]?.label ? `Explore ${clusters[1].label}` : "Test a second direction",
        rationale: "A second path preserves optionality and helps compare tradeoffs.",
        evidenceChunkIds: clusters[1]?.chunkIds ?? []
      }
    ];
    if (clusters.length > 2) {
      directions.push({
        id: `direction_${sha256(`${request.mode}:${clusters.map((item) => item.id).join(":")}:3`).slice(0, 12)}`,
        label: `Hybridize the strongest signals`,
        rationale: "A combined direction can absorb the best pieces of multiple clusters.",
        evidenceChunkIds: clusters[2]?.chunkIds ?? []
      });
    }
    return {
      synthesisId: request.id,
      specs: specs.map((spec) => ({
        ...spec,
        sectionId: `section_${sha256(`${request.id}:${spec.key}`).slice(0, 16)}`
      })),
      directions: directions.slice(0, 3),
      gapAnalysis
    };
  }

  private mapCitations(structure: ProposedStructure, evidence: { chunk: ChunkV1; score: number }[], contradictions: ContradictionV1[]) {
    const citations: CitationV1[] = [];
    for (const spec of structure.specs) {
      const sectionId = spec.sectionId;
      const sectionText = `${spec.title} ${spec.prompt} ${structure.gapAnalysis.note}`;
      const supporting = evidence
        .filter((item) => scoreOverlap(item.chunk.content, sectionText) > 0)
        .slice(0, 4);
      for (const item of supporting) {
        citations.push({
          schemaVersion: 1,
          id: `citation_${sha256(`${sectionId}:${item.chunk.id}`).slice(0, 16)}`,
          synthesisId: structure.synthesisId,
          sectionId,
          chunkId: item.chunk.id,
          sourceId: item.chunk.sourceId,
          excerpt: truncate(item.chunk.content, 180),
          locator: item.chunk.locator,
          supportType: "direct",
          confidence: Math.min(1, item.score / 8),
          createdAt: now(),
          metadata: { sectionKey: spec.key }
        });
      }
      if (!supporting.length && evidence[0]?.chunk) {
        citations.push({
          schemaVersion: 1,
          id: `citation_${sha256(`${sectionId}:${evidence[0].chunk.id}:fallback`).slice(0, 16)}`,
          synthesisId: structure.synthesisId,
          sectionId,
          chunkId: evidence[0].chunk.id,
          sourceId: evidence[0].chunk.sourceId,
          excerpt: truncate(evidence[0].chunk.content, 180),
          locator: evidence[0].chunk.locator,
          supportType: contradictions.length ? "inferred" : "direct",
          confidence: 0.35,
          createdAt: now(),
          metadata: { fallback: true, sectionKey: spec.key }
        });
      }
    }
    return citations;
  }

  private buildSections(
    request: SynthesisRequestV1,
    structure: ProposedStructure,
    citations: CitationV1[],
    contradictions: ContradictionV1[],
    clusters: ThemeClusterV1[],
    gapAnalysis: ProposedStructure["gapAnalysis"]
  ) {
    return structure.specs.map((spec, index) => {
      const sectionId = spec.sectionId;
      const sectionCitations = citations.filter((item) => item.sectionId === sectionId);
      const supportingCluster = clusters[index];
      const body = buildSectionBody({
        mode: request.mode,
        spec,
        citations: sectionCitations,
        cluster: supportingCluster,
        contradictions,
        gapAnalysis,
        question: request.question,
        audience: request.audience,
        directions: structure.directions
      });
      return {
        schemaVersion: 1 as const,
        id: sectionId,
        synthesisId: request.id,
        key: spec.key,
        title: spec.title,
        body,
        citations: sectionCitations,
        confidence: confidenceFromCitations(sectionCitations, gapAnalysis.insufficientEvidence),
        status: gapAnalysis.insufficientEvidence ? "needs_revision" : "draft",
        createdAt: now(),
        updatedAt: now(),
        metadata: { index }
      } satisfies DraftSectionV1;
    });
  }

  private estimateConfidence(
    request: SynthesisRequestV1,
    sections: DraftSectionV1[],
    citations: CitationV1[],
    contradictions: ContradictionV1[],
    clusters: ThemeClusterV1[]
  ) {
    const sourceCount = uniq(citations.map((citation) => citation.sourceId)).length;
    const sectionScore = median(sections.map((section) => section.confidence));
    const contradictionPenalty = Math.min(0.4, contradictions.length * 0.08);
    const diversityBonus = Math.min(0.15, sourceCount * 0.04);
    const clusterBonus = Math.min(0.12, clusters.length * 0.03);
    const rawScore = Math.max(0, Math.min(1, sectionScore - contradictionPenalty + diversityBonus + clusterBonus));
    const band: ConfidenceBandV1 = rawScore < 0.42 ? "low" : rawScore < 0.72 ? "moderate" : "high";
    return {
      schemaVersion: 1,
      id: `confidence_${sha256(`${request.id}:${rawScore.toFixed(3)}`).slice(0, 16)}`,
      synthesisId: request.id,
      overallConfidence: band,
      explanation: buildConfidenceExplanation(rawScore, sourceCount, contradictions.length, clusters.length),
      insufficientEvidence: sourceCount < 2 || citations.length < 3,
      sectionCoverage: sections.map((section) => ({
        sectionId: section.id,
        confidence: section.confidence < 0.4 ? "low" : section.confidence < 0.7 ? "moderate" : "high",
        note: section.status === "needs_revision" ? "Section needs more evidence." : "Section has enough support for v1."
      })),
      createdAt: now(),
      metadata: { rawScore }
    } satisfies ConfidenceReportV1;
  }

  private buildSummary(
    request: SynthesisRequestV1,
    clusters: ThemeClusterV1[],
    contradictions: ContradictionV1[],
    confidenceReport: ConfidenceReportV1
  ) {
    const topThemes = clusters.slice(0, 3).map((item) => item.label).join(", ") || "no stable theme clusters";
    const contradictionNote =
      contradictions.length > 0
        ? `${contradictions.length} contradiction(s) need review.`
        : "No major contradictions surfaced.";
    return [
      `Synthesized ${request.mode.replace(/_/g, " ")} for "${request.title}".`,
      `Top themes: ${topThemes}.`,
      contradictionNote,
      `Confidence: ${confidenceReport.overallConfidence}.`
    ].join(" ");
  }

  private trace(stage: string, input: unknown, output: unknown): StageTraceRecord {
    return {
      stage,
      startedAt: now(),
      finishedAt: now(),
      inputSummary: summarize(input),
      outputSummary: summarize(output)
    };
  }
}

const buildSectionBody = (input: {
  mode: SynthesisModeV1;
  spec: { key: string; title: string; prompt: string };
  citations: CitationV1[];
  cluster: ThemeClusterV1 | undefined;
  contradictions: ContradictionV1[];
  gapAnalysis: ProposedStructure["gapAnalysis"];
  question: string | null | undefined;
  audience: string | null | undefined;
  directions: { label: string; rationale: string }[];
}) => {
  const bullets = input.citations.slice(0, 4).map((citation) => `- ${citation.excerpt}`);
  const directionBlock =
    input.mode === "brief"
      ? input.directions.map((direction) => `- ${direction.label}: ${direction.rationale}`).join("\n")
      : input.directions.map((direction) => `- ${direction.label}`).join("\n");
  const contradictionBlock = input.contradictions.length
    ? input.contradictions.map((item) => `- ${item.description}`).join("\n")
    : "- No direct contradictions surfaced.";
  return [
    `${input.spec.prompt}`,
    input.question ? `Question: ${input.question}` : undefined,
    input.audience ? `Audience: ${input.audience}` : undefined,
    input.cluster ? `Theme: ${input.cluster.label} - ${input.cluster.summary}` : undefined,
    `Evidence:`,
    bullets.length ? bullets.join("\n") : "- Evidence is thin and should be treated cautiously.",
    `Directions:`,
    directionBlock || "- No direction proposals available.",
    `Contradictions:`,
    contradictionBlock,
    `Gap note: ${input.gapAnalysis.note}`
  ]
    .filter(Boolean)
    .join("\n\n");
};

const confidenceFromCitations = (citations: CitationV1[], insufficientEvidence: boolean) => {
  const base = citations.length ? Math.min(0.95, citations.length * 0.18) : 0.18;
  const penalty = insufficientEvidence ? 0.25 : 0;
  return Math.max(0.05, Math.min(0.95, base - penalty));
};

const buildConfidenceExplanation = (score: number, sources: number, contradictions: number, clusters: number) =>
  `Confidence is ${score.toFixed(2)} based on ${sources} source(s), ${clusters} theme cluster(s), and ${contradictions} contradiction(s).`;

const hasConflictingNumbers = (a: string, b: string) => {
  const numbersA: string[] = a.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const numbersB: string[] = b.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  if (!numbersA.length || !numbersB.length) return false;
  return numbersA.some((value) => !numbersB.includes(value));
};

export const createEngine = (rootPath: string, provider?: ProviderConfig) =>
  provider ? new SynthKitEngine({ rootPath, provider }) : new SynthKitEngine({ rootPath });
