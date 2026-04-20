import { z } from "zod";
import { sha256 } from "@synthkit/shared";

export const ProviderKindSchema = z.enum(["mock", "openai", "anthropic", "ollama"]);

export const ProviderConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mock"),
    seed: z.string().default("mock")
  }),
  z.object({
    kind: z.literal("openai"),
    apiKey: z.string().min(1),
    baseUrl: z.string().url().default("https://api.openai.com/v1"),
    model: z.string().min(1).default("gpt-4.1-mini"),
    embeddingModel: z.string().min(1).default("text-embedding-3-small"),
    ocrModel: z.string().min(1).optional(),
    transcriptionModel: z.string().min(1).optional()
  }),
  z.object({
    kind: z.literal("anthropic"),
    apiKey: z.string().min(1),
    baseUrl: z.string().url().default("https://api.anthropic.com"),
    model: z.string().min(1).default("claude-sonnet-4-0"),
    ocrModel: z.string().min(1).optional()
  }),
  z.object({
    kind: z.literal("ollama"),
    baseUrl: z.string().url().default("http://localhost:11434"),
    model: z.string().min(1).default("llama3.1"),
    embeddingModel: z.string().min(1).default("nomic-embed-text")
  })
]);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface TextGenerationInput {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TextGenerationOutput {
  text: string;
  provider: string;
  model: string;
  raw?: unknown;
}

export interface EmbeddingOutput {
  vector: number[];
  provider: string;
  model: string;
}

export interface OcrInput {
  mimeType: string;
  bytes: Buffer;
  hint?: string;
}

export interface TranscriptInput {
  text: string;
  language?: string;
}

export interface ProviderCapabilities {
  textGeneration: boolean;
  embeddings: boolean;
  ocr: boolean;
  transcription: boolean;
}

export interface SynthKitProvider {
  kind: ProviderKind;
  capabilities: ProviderCapabilities;
  generateText(input: TextGenerationInput): Promise<TextGenerationOutput>;
  embed(texts: string[]): Promise<EmbeddingOutput[]>;
  ocr(input: OcrInput): Promise<{ text: string; confidence: number }>;
  transcribe(input: TranscriptInput): Promise<{ text: string; confidence: number }>;
}

export type ProviderKind = z.infer<typeof ProviderKindSchema>;

const hashToNumbers = (value: string, dims = 16) => {
  const digest = sha256(value);
  const vector: number[] = [];
  for (let index = 0; index < dims; index += 1) {
    const start = (index * 4) % digest.length;
    const chunk = digest.slice(start, start + 4);
    vector.push((parseInt(chunk, 16) % 2000) / 1000 - 1);
  }
  return vector;
};

const mockText = ({ system, prompt }: TextGenerationInput) => {
  const lines = [
    "SynthKit mock provider response.",
    system ? `System: ${system}` : undefined,
    `Prompt: ${prompt}`,
    "This mode is deterministic and intentionally shallow."
  ].filter(Boolean);
  return lines.join("\n");
};

export const createMockProvider = (seed = "mock"): SynthKitProvider => ({
  kind: "mock",
  capabilities: { textGeneration: true, embeddings: true, ocr: true, transcription: true },
  async generateText(input) {
    return { text: mockText(input), provider: "mock", model: seed, raw: { seed } };
  },
  async embed(texts) {
    return texts.map((text) => ({
      vector: hashToNumbers(`${seed}:${text}`, 24),
      provider: "mock",
      model: seed
    }));
  },
  async ocr(input) {
    return {
      text: `Mock OCR fallback for ${input.mimeType} (${input.bytes.byteLength} bytes)`,
      confidence: 0.25
    };
  },
  async transcribe(input) {
    return { text: input.text, confidence: 1 };
  }
});

const postJson = async (url: string, body: unknown, headers: Record<string, string>) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Provider request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as Record<string, unknown>;
};

export const createProvider = (config: ProviderConfig): SynthKitProvider => {
  if (config.kind === "mock") return createMockProvider(config.seed);
  if (config.kind === "ollama") {
    return {
      kind: "ollama",
      capabilities: { textGeneration: true, embeddings: true, ocr: false, transcription: false },
      async generateText(input) {
        const payload = await postJson(`${config.baseUrl}/api/generate`, {
          model: config.model,
          prompt: [input.system, input.prompt].filter(Boolean).join("\n\n"),
          stream: false
        }, {});
        return {
          text: String(payload.response ?? ""),
          provider: "ollama",
          model: config.model,
          raw: payload
        };
      },
      async embed(texts) {
        const results: EmbeddingOutput[] = [];
        for (const text of texts) {
          const payload = await postJson(`${config.baseUrl}/api/embeddings`, {
            model: config.embeddingModel,
            prompt: text
          }, {});
          const vector = Array.isArray(payload.embedding) ? payload.embedding.map(Number) : hashToNumbers(text, 24);
          results.push({ vector, provider: "ollama", model: config.embeddingModel });
        }
        return results;
      },
      async ocr() {
        throw new Error("OCR is not provided by Ollama adapter in v1");
      },
      async transcribe() {
        throw new Error("Transcription is not provided by Ollama adapter in v1");
      }
    };
  }
  if (config.kind === "openai" || config.kind === "anthropic") {
    const provider: SynthKitProvider = {
      kind: config.kind,
      capabilities: { textGeneration: true, embeddings: config.kind === "openai", ocr: true, transcription: config.kind === "openai" },
      async generateText(input) {
        if (config.kind === "openai") {
          const payload = await postJson(
            `${config.baseUrl}/chat/completions`,
            {
              model: config.model,
              messages: [
                ...(input.system ? [{ role: "system", content: input.system }] : []),
                { role: "user", content: input.prompt }
              ],
              temperature: input.temperature ?? 0.2,
              max_tokens: input.maxTokens ?? 1200
            },
            { authorization: `Bearer ${config.apiKey}` }
          );
          const choice = Array.isArray(payload.choices) ? payload.choices[0] as { message?: { content?: string } } : undefined;
          return {
            text: choice?.message?.content ?? "",
            provider: "openai",
            model: config.model,
            raw: payload
          };
        }
        const payload = await postJson(
          `${config.baseUrl}/v1/messages`,
          {
            model: config.model,
            max_tokens: input.maxTokens ?? 1200,
            temperature: input.temperature ?? 0.2,
            system: input.system ?? "",
            messages: [{ role: "user", content: input.prompt }]
          },
          { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" }
        );
        const content = Array.isArray(payload.content) ? payload.content : [];
        const text = content.map((part) => String((part as { text?: string }).text ?? "")).join("\n");
        return { text, provider: "anthropic", model: config.model, raw: payload };
      },
      async embed(texts) {
        if (config.kind !== "openai") {
          return texts.map((text) => ({ vector: hashToNumbers(text, 24), provider: "anthropic", model: config.model }));
        }
        const payload = await postJson(
          `${config.baseUrl}/embeddings`,
          {
            model: config.embeddingModel,
            input: texts
          },
          { authorization: `Bearer ${config.apiKey}` }
        );
        const items = Array.isArray(payload.data) ? payload.data as Array<{ embedding?: number[] }> : [];
        return items.map((item, index) => ({
          vector: item.embedding ?? hashToNumbers(texts[index] ?? "", 24),
          provider: "openai",
          model: config.embeddingModel
        }));
      },
      async ocr(input) {
        const prompt = `Extract readable text from this ${input.mimeType} image. Return only text.\nHint: ${input.hint ?? "none"}`;
        const result = await provider.generateText({ prompt, maxTokens: 1200 });
        return { text: result.text, confidence: 0.5 };
      },
      async transcribe(input) {
        if (config.kind !== "openai") {
          throw new Error("Transcription is only lightly supported in v1 for OpenAI");
        }
        return { text: input.text, confidence: 1 };
      }
    };
    return provider;
  }
  throw new Error("Unsupported provider kind");
};

export const getProviderManifest = (provider: SynthKitProvider) => provider.capabilities;
