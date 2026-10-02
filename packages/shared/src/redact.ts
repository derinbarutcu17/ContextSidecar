// Secret redaction for content that enters the context store.
// Applies at add/update/ingest chokepoints so secrets never persist
// in plaintext in the SQLite workspace.

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "anthropic_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "openai_key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/g },
  { name: "aws_access_key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "github_token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { name: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "stripe_key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g },
  { name: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "private_key_block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "generic_secret", pattern: /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|secret|password|passwd|client[_-]?secret)["']?\s*[:=]\s*["']?[^\s"',}]+/gi }
];

export const redactSecrets = (input: string): string => {
  let output = input;
  for (const { name, pattern } of SECRET_PATTERNS) {
    output = output.replace(pattern, `[REDACTED:${name}]`);
  }
  return output;
};

export const containsRedactedSecret = (input: string): boolean => /\[REDACTED:[a-z_]+\]/.test(input);
