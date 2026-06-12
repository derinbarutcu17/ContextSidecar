import { z } from "zod";

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
export type ProviderKind = z.infer<typeof ProviderKindSchema>;
