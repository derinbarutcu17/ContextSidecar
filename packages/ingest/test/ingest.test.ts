import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SynthKitEngine } from "@synthkit/core";
import { SynthKitIngestor } from "../src/index.js";
import { createStorage } from "@synthkit/storage";
import type { SynthKitProvider } from "@synthkit/providers";

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "synthkit-ingest-"));

describe("SynthKitIngestor", () => {
  it("blocks local URLs instead of fetching them", async () => {
    const root = tmpRoot();
    const engine = new SynthKitEngine({ rootPath: root, provider: { kind: "mock", seed: "ingest" } });
    const project = engine.createProject({ name: "Ingest" });
    const result = await engine.ingestUrl(project.id, "http://127.0.0.1:7777/private", "Blocked");
    expect(result.source.extractionQuality).toBe("failed");
    expect(result.warnings.some((warning) => warning.includes("Blocked private IPv4 host"))).toBe(true);
    const localhostResult = await engine.ingestUrl(project.id, "http://localhost:7777/private", "Blocked");
    expect(localhostResult.source.extractionQuality).toBe("failed");
    expect(localhostResult.warnings.some((warning) => warning.includes("Blocked private resolved address")) || localhostResult.warnings.some((warning) => warning.includes("Blocked local URL host"))).toBe(true);
    engine.close();
  });

  it("survives malformed PDFs and records a warning", async () => {
    const root = tmpRoot();
    const engine = new SynthKitEngine({ rootPath: root, provider: { kind: "mock", seed: "pdf" } });
    const project = engine.createProject({ name: "PDF" });
    const filePath = path.join(root, "broken.pdf");
    fs.writeFileSync(filePath, Buffer.from("not a pdf"));
    const result = await engine.ingestPdf(project.id, filePath, "Broken PDF");
    expect(result.source.kind).toBe("pdf");
    expect(result.warnings.length).toBeGreaterThan(0);
    engine.close();
  });

  it("records honest fallback warnings when OCR is unavailable", async () => {
    const root = tmpRoot();
    const storage = createStorage(root);
    const provider: SynthKitProvider = {
      kind: "ollama",
      capabilities: { textGeneration: true, embeddings: true, ocr: false, transcription: false },
      async generateText() {
        return { text: "", provider: "ollama", model: "mock" };
      },
      async embed() {
        return [];
      },
      async ocr() {
        throw new Error("not supported");
      },
      async transcribe() {
        throw new Error("not supported");
      }
    };
    const ingestor = new SynthKitIngestor({ storage, provider });
    const projectId = "project_fallback";
    const imagePath = path.join(root, "image.png");
    fs.writeFileSync(imagePath, Buffer.from([0, 1, 2, 3]));
    const image = await ingestor.ingestImage({ projectId, filePath: imagePath, title: "Image" });
    expect(image.source.extractionQuality).toBe("failed");
    expect(image.warnings.some((warning) => warning.includes("OCR provider unavailable"))).toBe(true);
    const transcript = await ingestor.ingestTranscript({ projectId, transcript: "[00:01] hello world", title: "Transcript" });
    expect(transcript.source.extractionQuality).toBe("medium");
    expect(transcript.warnings.some((warning) => warning.includes("Transcription provider unavailable"))).toBe(true);
    storage.close();
  });
});
