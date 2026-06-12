import { ProviderConfigSchema } from "./schema.js";

export interface ResolveProviderConfigFromEnvInput {
  kind?: string | undefined;
  seed?: string | undefined;
  openaiApiKey?: string | undefined;
  openaiBaseUrl?: string | undefined;
  openaiModel?: string | undefined;
  openaiEmbeddingModel?: string | undefined;
  openaiOcrModel?: string | undefined;
  openaiTranscriptionModel?: string | undefined;
  anthropicApiKey?: string | undefined;
  anthropicBaseUrl?: string | undefined;
  anthropicModel?: string | undefined;
  anthropicOcrModel?: string | undefined;
  ollamaBaseUrl?: string | undefined;
  ollamaModel?: string | undefined;
  ollamaEmbeddingModel?: string | undefined;
}

export const resolveProviderConfigFromEnv = (input: ResolveProviderConfigFromEnvInput = {}) => {
  const kind = input.kind ?? "mock";
  if (kind === "mock") {
    return ProviderConfigSchema.parse({ kind: "mock", seed: input.seed ?? "mock" });
  }
  if (kind === "openai") {
    return ProviderConfigSchema.parse({
      kind: "openai",
      apiKey: input.openaiApiKey,
      baseUrl: input.openaiBaseUrl,
      model: input.openaiModel,
      embeddingModel: input.openaiEmbeddingModel,
      ocrModel: input.openaiOcrModel,
      transcriptionModel: input.openaiTranscriptionModel
    });
  }
  if (kind === "anthropic") {
    return ProviderConfigSchema.parse({
      kind: "anthropic",
      apiKey: input.anthropicApiKey,
      baseUrl: input.anthropicBaseUrl,
      model: input.anthropicModel,
      ocrModel: input.anthropicOcrModel
    });
  }
  return ProviderConfigSchema.parse({
    kind: "ollama",
    baseUrl: input.ollamaBaseUrl,
    model: input.ollamaModel,
    embeddingModel: input.ollamaEmbeddingModel
  });
};

export interface ResolveProviderConfigFromProcessEnvInput {
  env?: NodeJS.ProcessEnv | undefined;
  prefix?: string | undefined;
}

export const resolveProviderConfigFromProcessEnv = (input: ResolveProviderConfigFromProcessEnvInput = {}) => {
  const env = input.env ?? process.env;
  const prefix = input.prefix ?? "SYNTHKIT";
  const withPrefix = (name: string) => env[`${prefix}_${name}`];
  return resolveProviderConfigFromEnv({
    kind: withPrefix("PROVIDER_KIND"),
    seed: withPrefix("PROVIDER_SEED"),
    openaiApiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: env.OPENAI_BASE_URL,
    openaiModel: env.OPENAI_MODEL,
    openaiEmbeddingModel: env.OPENAI_EMBEDDING_MODEL,
    openaiOcrModel: env.OPENAI_OCR_MODEL,
    openaiTranscriptionModel: env.OPENAI_TRANSCRIPTION_MODEL,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicBaseUrl: env.ANTHROPIC_BASE_URL,
    anthropicModel: env.ANTHROPIC_MODEL,
    anthropicOcrModel: env.ANTHROPIC_OCR_MODEL,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    ollamaModel: env.OLLAMA_MODEL,
    ollamaEmbeddingModel: env.OLLAMA_EMBEDDING_MODEL
  });
};
