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

export interface ResolveServerListenOptionsFromProcessEnvInput {
  env?: NodeJS.ProcessEnv | undefined;
  defaultHost?: string | undefined;
  defaultPort?: number | undefined;
}

export const resolveServerListenOptionsFromProcessEnv = (
  input: ResolveServerListenOptionsFromProcessEnvInput = {}
) =>
  resolveServerListenOptions({
    env: input.env,
    defaultHost: input.defaultHost,
    defaultPort: input.defaultPort
  });
