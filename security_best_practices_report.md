# Security Review Report

## Executive Summary

I reviewed the current HTTP and ingest paths for attack surface issues. I found two high-impact vulnerabilities in the ingestion pipeline:

1. URL ingestion is still vulnerable to DNS rebinding-style SSRF.
2. File-path ingestion exposes arbitrary local file reads through the HTTP API.

I also noted a deployment risk: the HTTP API has no auth gate, so if it is exposed beyond loopback, any network peer can reach the destructive routes.

## Findings

### 1. High: DNS rebinding SSRF in URL ingestion

**Impact:** A caller can supply a URL that passes the pre-fetch private-address check, then get `fetch()` to resolve the hostname again and reach an internal or private target.

**Evidence:**
- The guard only resolves the hostname once before the request: [`packages/ingest/src/index.ts:167-175`](./packages/ingest/src/index.ts#L167-L175)
- The private-address check happens before `fetch()`, but the actual fetch uses the original URL again: [`packages/ingest/src/index.ts:314-343`](./packages/ingest/src/index.ts#L314-L343)

**Why this is vulnerable:**
- `assertSafeHttpUrl()` rejects obvious private hosts and checks a DNS lookup result.
- The code does not pin the resolved IP for the subsequent request.
- A rebinding host can return a public IP during validation, then a private IP when `fetch()` resolves it later.

**Severity:** High

### 2. High: Arbitrary local file read through PDF and image ingestion endpoints

**Impact:** Any client that can reach the API can submit an arbitrary `filePath` and make the server read local files from disk, then parse or OCR them and store the extracted contents.

**Evidence:**
- The HTTP API accepts a raw `filePath` for PDF ingestion: [`apps/api/src/server.ts:209-217`](./apps/api/src/server.ts#L209-L217)
- The HTTP API accepts a raw `filePath` for image ingestion: [`apps/api/src/server.ts:219-227`](./apps/api/src/server.ts#L219-L227)
- Those endpoints are registered without any auth check: [`apps/api/src/server.ts:242-247`](./apps/api/src/server.ts#L242-L247)
- The ingest layer directly opens the supplied path with `fs.readFileSync(input.filePath)`: [`packages/ingest/src/index.ts:194-203`](./packages/ingest/src/index.ts#L194-L203) and [`packages/ingest/src/index.ts:254-262`](./packages/ingest/src/index.ts#L254-L262)

**Why this is vulnerable:**
- There is no sandboxing or path allowlist around `filePath`.
- The server reads the file contents directly from the host filesystem.
- The extracted content is then turned into source assets and chunks, which can leak the file contents back through API responses or later retrieval.

**Severity:** High

### 3. Medium: No authentication gate on the HTTP API

**Impact:** If the HTTP server is bound to a non-loopback interface or exposed via a reverse proxy, any reachable client can create, update, archive, pin, and ingest data in the workspace.

**Evidence:**
- The server listens on the host/port from environment or defaults: [`packages/shared/src/startup.ts:37-52`](./packages/shared/src/startup.ts#L37-L52) and [`apps/api/src/server.ts:346-349`](./apps/api/src/server.ts#L346-L349)
- Mutating routes such as `/context`, `/context/:id`, `/v1/projects/:projectId/ingest/*`, and synthesis routes have no auth middleware or authorization checks: [`apps/api/src/server.ts:97-118`](./apps/api/src/server.ts#L97-L118), [`apps/api/src/server.ts:242-247`](./apps/api/src/server.ts#L242-L247), [`apps/api/src/server.ts:249-340`](./apps/api/src/server.ts#L249-L340)

**Why this matters:**
- The default loopback binding keeps the risk local by default, but the code allows broader exposure through configuration.
- If that happens, the API becomes a full workspace control plane with no access control.

**Severity:** Medium

## Notes

- I did not find evidence of command injection or template injection in the reviewed paths.
- The HTTP API is clearly intended to be local-first, but the current request handling is not hardened enough for hostile clients.
