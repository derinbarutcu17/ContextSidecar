import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SynthKitEngine } from "../src/index.js";

const makeRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "synthkit-core-"));

describe("SynthKitEngine", () => {
  it("creates a project, ingests sources, and synthesizes a brief", async () => {
    const root = makeRoot();
    const engine = new SynthKitEngine({ rootPath: root, provider: { kind: "mock", seed: "test" } });
    const project = engine.createProject({ name: "Core test" });
    await engine.ingestText(project.id, "We need citations. The UI can wait. MCP matters.", "notes");
    await engine.ingestMarkdown(project.id, "# Plan\n\n- core\n- api\n- mcp", "markdown");
    const bundle = await engine.runSynthesis({
      projectId: project.id,
      mode: "brief",
      title: "Core synthesis",
      question: "What should we do next?"
    });
    expect(bundle.draft.sections.length).toBeGreaterThan(0);
    expect(bundle.citations.length).toBeGreaterThan(0);
    expect(bundle.confidenceReport.overallConfidence).toMatch(/low|moderate|high/);
    const markdown = engine.exportMarkdown(bundle.request.id);
    expect(markdown.content).toContain("Executive Summary");
    engine.close();
  });

  it("tracks revisions", async () => {
    const root = makeRoot();
    const engine = new SynthKitEngine({ rootPath: root, provider: { kind: "mock", seed: "test" } });
    const project = engine.createProject({ name: "Revision test" });
    await engine.ingestText(project.id, "A single source is enough for a draft.", "notes");
    const bundle = await engine.runSynthesis({
      projectId: project.id,
      mode: "brief",
      title: "Revision synthesis"
    });
    const section = bundle.draft.sections[0];
    const revised = engine.reviseSection(bundle.request.id, section.id, "Revised body", "tighten scope");
    expect(revised.revision.after).toBe("Revised body");
    expect(engine.listRevisions(bundle.request.id)).toHaveLength(1);
    engine.close();
  });
});

