import fs from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import {
  ChunkV1Schema,
  SourceAssetV1Schema,
  type SourceExtractionQualityV1,
  type SourceKindV1,
  SourceV1Schema,
  type ChunkV1,
  type SourceAssetV1,
  type SourceV1
} from "@synthkit/domain";
import { dedupeHash, makeId, sha256, titleFromText, truncate } from "@synthkit/shared";
import { createStorage, type SynthKitStorage } from "@synthkit/storage";
import { type SynthKitProvider } from "@synthkit/providers";

const require = createRequire(import.meta.url);
const pdfParse: any = require("pdf-parse");

export interface IngestContext {
  storage: SynthKitStorage;
  provider: SynthKitProvider;
}

export interface IngestInputBase {
  projectId: string;
  title?: string;
  provenance?: {
    sourceName?: string;
    sourceUri?: string | null;
    importedBy?: string;
  };
}

export interface IngestResult {
  source: SourceV1;
  assets: SourceAssetV1[];
  chunks: ChunkV1[];
  duplicateOf?: string;
  warnings: string[];
}

const normalize = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const createChunkId = (projectId: string, sourceId: string, index: number, content: string) =>
  `chunk_${sha256(`${projectId}:${sourceId}:${index}:${content}`).slice(0, 16)}`;

const createSourceId = (projectId: string, kind: string, checksum: string) =>
  `source_${sha256(`${projectId}:${kind}:${checksum}`).slice(0, 16)}`;

const createAssetId = (sourceId: string, kind: string, checksum: string) =>
  `asset_${sha256(`${sourceId}:${kind}:${checksum}`).slice(0, 16)}`;

const chunkText = (projectId: string, sourceId: string, assetId: string | undefined, text: string, quality: SourceExtractionQualityV1, chunkSize = 900): ChunkV1[] => {
  const normalized = normalize(text);
  if (!normalized) return [];
  const parts: ChunkV1[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + chunkSize);
    const content = normalized.slice(cursor, end);
    const chunk = ChunkV1Schema.parse({
      schemaVersion: 1,
      id: createChunkId(projectId, sourceId, index, content),
      projectId,
      sourceId,
      assetId,
      index,
      content,
      tokenEstimate: Math.max(1, Math.ceil(content.length / 4)),
      quality,
      createdAt: new Date().toISOString(),
      locator: { start: cursor, end },
      metadata: { sourceKind: "text" }
    });
    parts.push(chunk);
    cursor = end;
    index += 1;
  }
  return parts;
};

const createSourceRecord = (base: IngestInputBase & { projectId: string }, kind: SourceKindV1, text: string, quality: SourceExtractionQualityV1, sourceUri?: string | null) => {
  const checksum = dedupeHash(text);
  const id = createSourceId(base.projectId, kind, checksum);
  const title = base.title?.trim() || titleFromText(text, `${kind} source`);
  return SourceV1Schema.parse({
    schemaVersion: 1,
    id,
    projectId: base.projectId,
    kind,
    title,
    originalUri: sourceUri ?? null,
    checksum,
    extractionQuality: quality,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provenance: {
      sourceName: base.provenance?.sourceName?.trim() || title,
      sourceUri: sourceUri ?? null,
      importedBy: base.provenance?.importedBy?.trim() || "local"
    },
    assetIds: [],
    metadata: {
      duplicateCandidate: false,
      originalLength: text.length
    }
  });
};

const saveSourceSet = (storage: SynthKitStorage, source: SourceV1, assets: SourceAssetV1[], chunks: ChunkV1[]) => {
  storage.upsertSource(source);
  for (const asset of assets) storage.upsertAsset(asset);
  for (const chunk of chunks) storage.insertChunk(chunk);
  return { source, assets, chunks };
};

const loadTextAsset = (sourceId: string, text: string, mimeType = "text/plain", kind: "raw" | "normalized" | "extracted_text" | "transcript" = "raw"): SourceAssetV1 =>
  SourceAssetV1Schema.parse({
    schemaVersion: 1,
    id: createAssetId(sourceId, kind, dedupeHash(text)),
    sourceId,
    kind,
    mimeType,
    uri: `memory://${sourceId}/${kind}`,
    checksum: dedupeHash(text),
    byteSize: Buffer.byteLength(text),
    createdAt: new Date().toISOString(),
    metadata: { lineCount: text.split("\n").length }
  });

export class SynthKitIngestor {
  constructor(private readonly context: IngestContext) {}

  async ingestText(input: IngestInputBase & { text: string }): Promise<IngestResult> {
    const normalizedText = normalize(input.text);
    const source = createSourceRecord(input, "text", normalizedText, normalizedText ? "high" : "failed", input.provenance?.sourceUri);
    const duplicateOf = this.findDuplicateSource(source);
    if (duplicateOf) source.metadata = { ...source.metadata, duplicateOf, duplicateCandidate: true };
    const asset = loadTextAsset(source.id, normalizedText, "text/plain", "raw");
    const chunks = chunkText(source.projectId, source.id, asset.id, normalizedText, source.extractionQuality);
    const saved = saveSourceSet(this.context.storage, source, [asset], chunks);
    return { ...saved, ...(duplicateOf ? { duplicateOf } : {}), warnings: normalizedText ? [] : ["Empty text source"] };
  }

  async ingestMarkdown(input: IngestInputBase & { markdown: string }): Promise<IngestResult> {
    const normalizedText = normalize(input.markdown);
    const source = createSourceRecord(input, "markdown", normalizedText, normalizedText ? "high" : "failed", input.provenance?.sourceUri);
    const duplicateOf = this.findDuplicateSource(source);
    if (duplicateOf) source.metadata = { ...source.metadata, duplicateOf, duplicateCandidate: true };
    const asset = loadTextAsset(source.id, normalizedText, "text/markdown", "normalized");
    const chunks = chunkText(source.projectId, source.id, asset.id, normalizedText, source.extractionQuality);
    const saved = saveSourceSet(this.context.storage, source, [asset], chunks);
    return { ...saved, ...(duplicateOf ? { duplicateOf } : {}), warnings: normalizedText ? [] : ["Empty markdown source"] };
  }

  async ingestUrl(input: IngestInputBase & { url: string }): Promise<IngestResult> {
    const blocked = await assertSafeHttpUrl(input.url);
    if (blocked) {
      const source = createSourceRecord(input, "url", input.url, "failed", input.url);
      const saved = saveSourceSet(this.context.storage, source, [], []);
      return { ...saved, warnings: [blocked] };
    }
    const fetched = await fetch(input.url);
    const warnings: string[] = [];
    if (!fetched.ok) {
      const fallback = createSourceRecord(input, "url", input.url, "failed", input.url);
      const saved = saveSourceSet(this.context.storage, fallback, [], []);
      return { ...saved, warnings: [`Fetch failed: ${fetched.status} ${fetched.statusText}`] };
    }
    const contentType = fetched.headers.get("content-type") ?? "";
    const body = await fetched.text();
    const text = contentType.includes("html") ? stripHtml(body) : body;
    const normalizedText = normalize(text);
    const source = createSourceRecord(input, "url", normalizedText || input.url, normalizedText ? "medium" : "failed", input.url);
    const duplicateOf = this.findDuplicateSource(source);
    if (duplicateOf) source.metadata = { ...source.metadata, duplicateOf, duplicateCandidate: true };
    const asset = loadTextAsset(source.id, normalizedText || input.url, contentType || "text/html", "extracted_text");
    const chunks = chunkText(source.projectId, source.id, asset.id, normalizedText || input.url, source.extractionQuality, 1000);
    const saved = saveSourceSet(this.context.storage, source, [asset], chunks);
    return { ...saved, ...(duplicateOf ? { duplicateOf } : {}), warnings };
  }

  async ingestPdf(input: IngestInputBase & { filePath: string }): Promise<IngestResult> {
    const warnings: string[] = [];
    let raw = Buffer.alloc(0);
    try {
      raw = fs.readFileSync(input.filePath);
    } catch {
      const source = createSourceRecord(input, "pdf", input.filePath, "failed", input.filePath);
      const saved = saveSourceSet(this.context.storage, source, [], []);
      return { ...saved, warnings: ["Could not read PDF file"] };
    }
    let extracted = "";
    try {
      const parsed = await pdfParse(raw);
      extracted = normalize(parsed.text || "");
      if (!extracted) warnings.push("PDF parsed but yielded no text");
    } catch (error) {
      warnings.push(`PDF parse failed: ${(error as Error).message}`);
    }
    const source = createSourceRecord(input, "pdf", extracted || input.filePath, extracted ? "medium" : "failed", input.filePath);
    const duplicateOf = this.findDuplicateSource(source);
    if (duplicateOf) source.metadata = { ...source.metadata, duplicateOf, duplicateCandidate: true };
    const asset = SourceAssetV1Schema.parse({
      schemaVersion: 1,
      id: createAssetId(source.id, "raw", sha256(raw)),
      sourceId: source.id,
      kind: "raw",
      mimeType: "application/pdf",
      uri: `file://${path.resolve(input.filePath)}`,
      checksum: sha256(raw),
      byteSize: raw.byteLength,
      createdAt: new Date().toISOString(),
      metadata: { filePath: input.filePath }
    });
    const chunks = extracted
      ? chunkText(source.projectId, source.id, asset.id, extracted, source.extractionQuality, 950)
      : [];
    const saved = saveSourceSet(this.context.storage, source, [asset], chunks);
    return { ...saved, ...(duplicateOf ? { duplicateOf } : {}), warnings };
  }

  async ingestTranscript(input: IngestInputBase & { transcript: string }): Promise<IngestResult> {
    const normalized = normalizeTranscript(input.transcript);
    const text = normalized.map((line) => line.text).join("\n");
    const transcriptionSupported = this.context.provider.capabilities.transcription;
    const warnings = transcriptionSupported ? [] : ["Transcription provider unavailable; using provided transcript text only"];
    const source = createSourceRecord(
      input,
      "transcript",
      text,
      text ? (transcriptionSupported ? "high" : "medium") : "failed",
      input.provenance?.sourceUri
    );
    const duplicateOf = this.findDuplicateSource(source);
    if (duplicateOf) source.metadata = { ...source.metadata, duplicateOf, duplicateCandidate: true };
    const asset = loadTextAsset(source.id, text, "text/plain", "transcript");
    const chunks = chunkText(source.projectId, source.id, asset.id, text, source.extractionQuality);
    const saved = saveSourceSet(this.context.storage, source, [asset], chunks);
    return { ...saved, ...(duplicateOf ? { duplicateOf } : {}), warnings };
  }

  async ingestImage(input: IngestInputBase & { filePath: string }): Promise<IngestResult> {
    let bytes = Buffer.alloc(0);
    const warnings: string[] = [];
    try {
      bytes = fs.readFileSync(input.filePath);
    } catch {
      const source = createSourceRecord(input, "image", input.filePath, "failed", input.filePath);
      const saved = saveSourceSet(this.context.storage, source, [], []);
      return { ...saved, warnings: ["Could not read image file"] };
    }
    const source = createSourceRecord(input, "image", input.filePath, "low", input.filePath);
    const duplicateOf = this.findDuplicateSource(source);
    if (duplicateOf) source.metadata = { ...source.metadata, duplicateOf, duplicateCandidate: true };
    let extracted = "";
    if (!this.context.provider.capabilities.ocr) {
      warnings.push("OCR provider unavailable; image text was not extracted");
      source.extractionQuality = "failed";
    } else {
      try {
        const ocr = await this.context.provider.ocr({
          mimeType: guessMimeType(input.filePath),
          bytes,
          ...(input.title ? { hint: input.title } : {})
        });
        extracted = normalize(ocr.text);
        if (ocr.confidence < 0.4) warnings.push("OCR confidence was low");
      } catch (error) {
        warnings.push(`OCR failed: ${(error as Error).message}`);
        source.extractionQuality = "failed";
      }
    }
    const asset = SourceAssetV1Schema.parse({
      schemaVersion: 1,
      id: createAssetId(source.id, "raw", sha256(bytes)),
      sourceId: source.id,
      kind: "raw",
      mimeType: guessMimeType(input.filePath),
      uri: `file://${path.resolve(input.filePath)}`,
      checksum: sha256(bytes),
      byteSize: bytes.byteLength,
      createdAt: new Date().toISOString(),
      metadata: { filePath: input.filePath, ocrTextLength: extracted.length }
    });
    const ocrAsset = extracted
      ? loadTextAsset(source.id, extracted, "text/plain", "extracted_text")
      : undefined;
    const chunks = extracted
      ? chunkText(source.projectId, source.id, ocrAsset?.id ?? asset.id, extracted, source.extractionQuality, 900)
      : [];
    const saved = saveSourceSet(this.context.storage, source, ocrAsset ? [asset, ocrAsset] : [asset], chunks);
    return { ...saved, ...(duplicateOf ? { duplicateOf } : {}), warnings };
  }

  private findDuplicateSource(source: SourceV1) {
    const sources = this.context.storage.listSources(source.projectId);
    const duplicate = sources.find((item) => item.checksum === source.checksum && item.kind === source.kind);
    return duplicate?.id;
  }
}

const assertSafeHttpUrl = async (url: string) => {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return `Unsupported URL protocol: ${parsed.protocol}`;
    }
    if (parsed.username || parsed.password) {
      return "Blocked URL credentials";
    }
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1") {
      return `Blocked local URL host: ${parsed.hostname}`;
    }
    if (net.isIP(hostname) === 4) {
      if (isPrivateIpv4(hostname)) {
        return `Blocked private IPv4 host: ${parsed.hostname}`;
      }
    }
    if (net.isIP(hostname) === 6) {
      if (isPrivateIpv6(hostname)) {
        return `Blocked private IPv6 host: ${parsed.hostname}`;
      }
    }
    if (!net.isIP(hostname)) {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      if (records.some((record) => isPrivateResolvedAddress(record.address))) {
        return `Blocked private resolved address for host: ${parsed.hostname}`;
      }
    }
    return undefined;
  } catch {
    return "Invalid URL";
  }
};

const isPrivateIpv4 = (value: string) => {
  const parts = value.split(".").map((part) => Number(part));
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
};

const isPrivateIpv6 = (value: string) => {
  const normalized = value.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
};

const isPrivateResolvedAddress = (address: string) => net.isIP(address) === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);

const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h\d|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n");

const normalizeTranscript = (input: string) =>
  input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      text: line.replace(/^\[(\d{2}:\d{2}(:\d{2})?)\]\s*/, ""),
      timestamp: line.match(/^\[(\d{2}:\d{2}(?::\d{2})?)\]/)?.[1]
    }));

const guessMimeType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
};

export const createIngestor = (storageRoot: string, provider: SynthKitProvider) =>
  new SynthKitIngestor({ storage: createStorage(storageRoot), provider });
