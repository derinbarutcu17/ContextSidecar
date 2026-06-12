import crypto from "node:crypto";
import path from "node:path";

export const DEFAULT_CONTEXT_SIDECAR_DIR = ".context-sidecar";

export interface ResolveContextSidecarRootPathInput {
  rootPath?: string | undefined;
  envRootPath?: string | null | undefined;
  cwd?: string | undefined;
  defaultDir?: string | undefined;
}

export const resolveContextSidecarRootPath = (input: ResolveContextSidecarRootPathInput = {}) =>
  path.resolve(
    input.rootPath
      ?? input.envRootPath
      ?? path.join(input.cwd ?? process.cwd(), input.defaultDir ?? DEFAULT_CONTEXT_SIDECAR_DIR)
  );

export interface ResolveContextSidecarRootPathFromProcessEnvInput {
  env?: NodeJS.ProcessEnv | undefined;
  envKey?: string | undefined;
  cwd?: string | undefined;
  defaultDir?: string | undefined;
}

export const resolveContextSidecarRootPathFromProcessEnv = (input: ResolveContextSidecarRootPathFromProcessEnvInput = {}) =>
  resolveContextSidecarRootPath({
    envRootPath: input.env?.[input.envKey ?? "CONTEXT_SIDECAR_HOME"],
    cwd: input.cwd,
    defaultDir: input.defaultDir
  });

export interface ResolveServerListenOptionsInput {
  env?: NodeJS.ProcessEnv | undefined;
  defaultHost?: string | undefined;
  defaultPort?: number | undefined;
}

export const resolveServerListenOptions = (input: ResolveServerListenOptionsInput = {}) => ({
  host: input.env?.HOST ?? input.defaultHost ?? "127.0.0.1",
  port: Number(input.env?.PORT ?? input.defaultPort ?? 8787)
});

export const normalizeWhitespace = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const stableStringify = (value: unknown) =>
  JSON.stringify(value, Object.keys((value as Record<string, unknown>) ?? {}).sort(), 2);

export const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";

export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const sha256 = (value: string | Buffer) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const dedupeHash = (value: string) => sha256(normalizeWhitespace(value));

export const chunkHash = (value: string) => sha256(stableStringify({ text: normalizeWhitespace(value) }));

export const ensureArray = <T>(value: T | T[] | undefined | null): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

export const titleFromText = (text: string, fallback = "Untitled") => {
  const firstLine = normalizeWhitespace(text).split("\n")[0]?.trim();
  if (!firstLine) return fallback;
  return firstLine.slice(0, 80);
};

export const toSlug = slugify;

export const truncate = (text: string, max = 240) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

export const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
};

export const uniq = <T>(values: T[]) => [...new Set(values)];

export const isProbablyUrl = (input: string) => /^https?:\/\//i.test(input.trim());

export const toSafeFilename = (input: string) =>
  input
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128) || "artifact";
