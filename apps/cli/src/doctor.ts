import fs from "node:fs";
import path from "node:path";
import { createContextSidecarService, type ContextSidecarService } from "@context-sidecar/core";
import { ContextItemV1Schema, type ContextItemType, type ContextStatus } from "@context-sidecar/domain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NamespaceHealth {
  namespace: string;
  itemCount: number;
  pinnedCount: number;
  activeCount: number;
  archivedCount: number;
  expiredCount: number;
  latestUpdated: string;
}

export interface SchemaValidationResult {
  totalValidated: number;
  errors: number;
  sampleErrors: string[];
}

export interface DoctorReport {
  ok: boolean;
  rootPath: string;
  node: string;
  platform: string;
  timestamp: string;
  storage: {
    exists: boolean;
    fileSizeBytes: number | null;
    integrityStatus: "ok" | "error" | "unknown";
    integrityDetail: string | null;
  };
  database: {
    tableRowCounts: Record<string, number>;
    itemCountByType: Record<string, number>;
    itemCountByStatus: Record<string, number>;
    expiredItems: number;
  };
  namespaces: NamespaceHealth[];
  schemaValidation: SchemaValidationResult;
  healthScore: number;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// ANSI helpers (used when rendering to terminal)
// ---------------------------------------------------------------------------

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const RESET = "\x1b[0m";

const CHECK = "\u2713";
const CROSS = "\u2717";
const WARN = "\u26A0";

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function getFileSizeBytes(filePath: string): number | null {
  try {
    const stat = fs.statSync(filePath);
    return stat.size;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function runIntegrityCheck(service: ContextSidecarService): { status: "ok" | "error" | "unknown"; detail: string | null } {
  try {
    const rows = service.storage.db
      .prepare("PRAGMA integrity_check")
      .all() as Array<Record<string, string>>;
    const values = rows.map((r) => Object.values(r)[0] ?? "");
    const allOk = values.every((v) => v === "ok");
    if (allOk) return { status: "ok", detail: "Database integrity check passed." };
    const errorLines = values.filter((v) => v !== "ok");
    return {
      status: "error",
      detail: `Integrity errors found:\n${errorLines.map((l) => `    ${l}`).join("\n")}`,
    };
  } catch (err) {
    return { status: "error", detail: String(err) };
  }
}

function countTableRows(service: ContextSidecarService): Record<string, number> {
  const tables = [
    "projects",
    "sources",
    "source_assets",
    "chunks",
    "syntheses",
    "draft_sections",
    "citations",
    "contradictions",
    "theme_clusters",
    "revisions",
    "export_artifacts",
    "context_items",
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const row = service.storage.db
        .prepare(`SELECT COUNT(*) AS cnt FROM ${table}`)
        .get() as { cnt: number };
      counts[table] = Number(row.cnt ?? 0);
    } catch {
      counts[table] = -1; // table might not exist
    }
  }
  return counts;
}

function getItemCountsByType(
  service: ContextSidecarService
): Record<string, number> {
  const rows = service.storage.db
    .prepare(
      `SELECT item_type, COUNT(*) AS cnt FROM context_items GROUP BY item_type ORDER BY cnt DESC`
    )
    .all() as Array<{ item_type: string; cnt: number }>;
  const map: Record<string, number> = {};
  for (const r of rows) map[r.item_type] = Number(r.cnt ?? 0);
  return map;
}

function getItemCountsByStatus(
  service: ContextSidecarService
): Record<string, number> {
  const rows = service.storage.db
    .prepare(
      `SELECT effective_status, COUNT(*) AS cnt FROM (
        SELECT CASE WHEN expires_at IS NOT NULL AND expires_at <= datetime('now') THEN 'expired' ELSE status END AS effective_status
        FROM context_items
      ) GROUP BY effective_status ORDER BY cnt DESC`
    )
    .all() as Array<{ effective_status: string; cnt: number }>;
  const map: Record<string, number> = {};
  for (const r of rows) map[r.effective_status] = Number(r.cnt ?? 0);
  return map;
}

function countExpiredItems(service: ContextSidecarService): number {
  const row = service.storage.db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM context_items WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`
    )
    .get() as { cnt: number };
  return Number(row.cnt ?? 0);
}

function validateContextItems(
  service: ContextSidecarService
): SchemaValidationResult {
  const rows = service.storage.db
    .prepare(`SELECT data FROM context_items ORDER BY id ASC LIMIT 500`)
    .all() as Array<{ data: string }>;

  let errors = 0;
  const sampleErrors: string[] = [];

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.data) as Record<string, unknown>;
      ContextItemV1Schema.parse(parsed);
    } catch (err) {
      errors++;
      if (sampleErrors.length < 5) {
        const msg = err instanceof Error ? err.message : String(err);
        sampleErrors.push(msg.slice(0, 120));
      }
    }
  }

  return { totalValidated: rows.length, errors, sampleErrors };
}

function listNamespaces(service: ContextSidecarService): NamespaceHealth[] {
  try {
    const rows = service.storage.db
      .prepare(
        `WITH ns AS (
          SELECT
            namespace,
            CASE WHEN expires_at IS NOT NULL AND expires_at <= datetime('now') THEN 'expired' ELSE status END AS effective_status,
            updated_at
          FROM context_items
        )
        SELECT
          namespace,
          COUNT(*) AS item_count,
          SUM(CASE WHEN effective_status = 'pinned' THEN 1 ELSE 0 END) AS pinned_count,
          SUM(CASE WHEN effective_status = 'active' THEN 1 ELSE 0 END) AS active_count,
          SUM(CASE WHEN effective_status = 'archived' THEN 1 ELSE 0 END) AS archived_count,
          SUM(CASE WHEN effective_status = 'expired' THEN 1 ELSE 0 END) AS expired_count,
          MAX(updated_at) AS latest_updated
        FROM ns
        GROUP BY namespace
        ORDER BY latest_updated DESC, namespace ASC`
      )
      .all() as Array<{
      namespace: string;
      item_count: number;
      pinned_count: number;
      active_count: number;
      archived_count: number;
      expired_count: number;
      latest_updated: string;
    }>;

    return rows.map((r) => ({
      namespace: r.namespace,
      itemCount: Number(r.item_count ?? 0),
      pinnedCount: Number(r.pinned_count ?? 0),
      activeCount: Number(r.active_count ?? 0),
      archivedCount: Number(r.archived_count ?? 0),
      expiredCount: Number(r.expired_count ?? 0),
      latestUpdated: r.latest_updated,
    }));
  } catch {
    return [];
  }
}

function computeHealthScore(report: DoctorReport): number {
  let score = 100;

  // storage existence
  if (!report.storage.exists) score -= 20;
  // integrity
  if (report.storage.integrityStatus === "error") score -= 25;
  if (report.storage.integrityStatus === "unknown") score -= 5;
  // schema validation
  if (report.schemaValidation.totalValidated > 0) {
    const errorRatio = report.schemaValidation.errors / report.schemaValidation.totalValidated;
    score -= Math.round(errorRatio * 30);
  }
  // expired items
  if (report.database.expiredItems > 0) score -= Math.min(15, report.database.expiredItems * 2);
  // empty workspace
  const totalItems = Object.values(report.database.tableRowCounts).reduce(
    (sum, n) => sum + (n > 0 ? n : 0),
    0
  );
  if (totalItems === 0) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function generateRecommendations(report: DoctorReport): string[] {
  const recs: string[] = [];

  if (!report.storage.exists) {
    recs.push("No database found. Run `pnpm exec context-sidecar context bootstrap repo` to seed the workspace.");
  } else {
    if (report.storage.integrityStatus === "error") {
      recs.push("Database integrity check FAILED. Restore from backup or re-create the workspace.");
    }
    if (report.schemaValidation.errors > 0) {
      recs.push(
        `${report.schemaValidation.errors} context item(s) failed schema validation. Consider re-importing them.`
      );
    }
    if (report.database.expiredItems > 0) {
      recs.push(
        `${report.database.expiredItems} expired item(s) found. Run cleanup to remove stale context.`
      );
    }
    const totalItems = Object.values(report.database.tableRowCounts).reduce(
      (sum, n) => sum + (n > 0 ? n : 0),
      0
    );
    if (totalItems === 0) {
      recs.push("Workspace is empty. Use `pnpm exec context-sidecar context add ...` or `context bootstrap repo` to add items.");
    }
    if (report.namespaces.length > 0 && report.namespaces.every((ns) => ns.itemCount < 3)) {
      recs.push("Namespaces are sparsely populated. Consider importing more documents.");
    }
  }

  if (report.namespaces.length === 0 && report.storage.exists) {
    recs.push("No namespaces found. Add context items to create a namespace.");
  }

  if (report.healthScore === 100) {
    recs.push("Everything looks healthy. No action needed.");
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Main diagnostic entry point
// ---------------------------------------------------------------------------

export function runDoctorDiagnostics(rootPath: string): DoctorReport {
  const dbPath = path.join(rootPath, "context-sidecar.sqlite");
  const storageExists = fs.existsSync(dbPath);

  let service: ContextSidecarService | null = null;
  let integrityResult: { status: "ok" | "error" | "unknown"; detail: string | null } = {
    status: "unknown",
    detail: null,
  };
  let tableRowCounts: Record<string, number> = {};
  let itemCountByType: Record<string, number> = {};
  let itemCountByStatus: Record<string, number> = {};
  let expiredItems = 0;
  let schemaValidation: SchemaValidationResult = { totalValidated: 0, errors: 0, sampleErrors: [] };
  let namespaceHealth: NamespaceHealth[] = [];
  let fileSizeBytes: number | null = null;

  if (storageExists) {
    try {
      service = createContextSidecarService(rootPath);
      fileSizeBytes = getFileSizeBytes(dbPath);
      integrityResult = runIntegrityCheck(service);
      tableRowCounts = countTableRows(service);
      itemCountByType = getItemCountsByType(service);
      itemCountByStatus = getItemCountsByStatus(service);
      expiredItems = countExpiredItems(service);
      schemaValidation = validateContextItems(service);
      namespaceHealth = listNamespaces(service);
    } catch (err) {
      integrityResult = {
        status: "error",
        detail: `Error opening or checking database: ${String(err)}`,
      };
    } finally {
      service?.storage.close();
    }
  }

  const now = new Date().toISOString();

  const report: DoctorReport = {
    ok: integrityResult.status === "ok",
    rootPath,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    timestamp: now,
    storage: {
      exists: storageExists,
      fileSizeBytes,
      integrityStatus: integrityResult.status,
      integrityDetail: integrityResult.detail,
    },
    database: {
      tableRowCounts,
      itemCountByType,
      itemCountByStatus,
      expiredItems,
    },
    namespaces: namespaceHealth,
    schemaValidation,
    healthScore: 100, // placeholder
    recommendations: [],
  };

  report.healthScore = computeHealthScore(report);
  report.recommendations = generateRecommendations(report);

  return report;
}

// ---------------------------------------------------------------------------
// ANSI terminal renderer
// ---------------------------------------------------------------------------

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];

  // header
  lines.push(`${BOLD}${CYAN}═══ ContextSidecar Doctor ═══${RESET}`);
  lines.push(`${GRAY}root: ${report.rootPath}${RESET}`);
  lines.push(`${GRAY}node: ${report.node} · ${report.platform}${RESET}`);
  lines.push(`${GRAY}run:  ${report.timestamp}${RESET}`);
  lines.push("");

  // health score bar
  const score = report.healthScore;
  const scoreColor = score >= 80 ? GREEN : score >= 50 ? YELLOW : RED;
  lines.push(`${BOLD}Health Score: ${scoreColor}${score}/100${RESET}`);
  lines.push(scoreBar(score));
  lines.push("");

  // storage
  lines.push(`${BOLD}Storage${RESET}`);
  if (report.storage.exists) {
    lines.push(`  ${GREEN}${CHECK}${RESET} Database: ${report.storage.fileSizeBytes !== null ? formatBytes(report.storage.fileSizeBytes) : "N/A"}`);
    if (report.storage.integrityStatus === "ok") {
      lines.push(`  ${GREEN}${CHECK}${RESET} Integrity: OK`);
    } else if (report.storage.integrityStatus === "error") {
      lines.push(`  ${RED}${CROSS}${RESET} Integrity: FAILED`);
      if (report.storage.integrityDetail) {
        for (const line of report.storage.integrityDetail.split("\n")) {
          lines.push(`    ${GRAY}${line}${RESET}`);
        }
      }
    } else {
      lines.push(`  ${YELLOW}${WARN}${RESET} Integrity: unknown`);
    }
  } else {
    lines.push(`  ${YELLOW}${WARN}${RESET} No database at ${path.join(report.rootPath, "context-sidecar.sqlite")}`);
  }
  lines.push("");

  // database tables
  lines.push(`${BOLD}Database Tables${RESET}`);
  const tableNames = Object.keys(report.database.tableRowCounts);
  if (tableNames.length > 0) {
    const maxNameLen = Math.max(...tableNames.map((n) => n.length));
    for (const name of tableNames) {
      const count = report.database.tableRowCounts[name] ?? 0;
      const countStr = count < 0 ? `${GRAY}missing${RESET}` : String(count);
      lines.push(`  ${name.padEnd(maxNameLen + 2)}${countStr}`);
    }
  } else {
    lines.push(`  ${GRAY}(no tables scanned)${RESET}`);
  }
  lines.push("");

  // context items breakdown
  if (Object.keys(report.database.itemCountByType).length > 0) {
    lines.push(`${BOLD}Context Items — Type${RESET}`);
    for (const [type, count] of Object.entries(report.database.itemCountByType)) {
      lines.push(`  ${type.padEnd(22)}${count}`);
    }
    lines.push("");
  }

  if (Object.keys(report.database.itemCountByStatus).length > 0) {
    lines.push(`${BOLD}Context Items — Status${RESET}`);
    for (const [status, count] of Object.entries(report.database.itemCountByStatus)) {
      const statusColor =
        status === "pinned"
          ? GREEN
          : status === "active"
            ? CYAN
            : status === "expired"
              ? RED
              : GRAY;
      lines.push(`  ${statusColor}${status.padEnd(12)}${count}${RESET}`);
    }
    lines.push("");
  }

  // schema validation
  lines.push(`${BOLD}Schema Validation${RESET}`);
  if (report.schemaValidation.totalValidated > 0) {
    if (report.schemaValidation.errors === 0) {
      lines.push(`  ${GREEN}${CHECK}${RESET} All ${report.schemaValidation.totalValidated} items valid`);
    } else {
      lines.push(
        `  ${RED}${CROSS}${RESET} ${report.schemaValidation.errors}/${report.schemaValidation.totalValidated} items with errors`
      );
      for (const sample of report.schemaValidation.sampleErrors) {
        lines.push(`    ${RED}${sample}${RESET}`);
      }
    }
  } else {
    lines.push(`  ${GRAY}(no items to validate)${RESET}`);
  }
  lines.push("");

  // namespaces
  if (report.namespaces.length > 0) {
    lines.push(`${BOLD}Namespaces${RESET}`);
    for (const ns of report.namespaces) {
      const nsColor = ns.expiredCount > 0 ? YELLOW : GREEN;
      lines.push(
        `  ${nsColor}${ns.namespace}${RESET}  ` +
          `${ns.itemCount} items ` +
          `(pinned: ${ns.pinnedCount}, active: ${ns.activeCount}, ` +
          `archived: ${ns.archivedCount}, expired: ${ns.expiredCount})`
      );
    }
    lines.push("");
  }

  // expired items
  if (report.database.expiredItems > 0) {
    lines.push(`  ${YELLOW}${WARN}${RESET} ${report.database.expiredItems} expired item(s) found — may bloat context packs`);
    lines.push("");
  }

  // recommendations
  if (report.recommendations.length > 0) {
    lines.push(`${BOLD}Recommendations${RESET}`);
    for (const rec of report.recommendations) {
      lines.push(`  ${CYAN}→${RESET} ${rec}`);
    }
    lines.push("");
  }

  // footer
  const ok = report.ok && report.healthScore >= 80;
  const footerColor = ok ? GREEN : report.healthScore >= 50 ? YELLOW : RED;
  const footerIcon = ok ? CHECK : WARN;
  lines.push(
    `${footerColor}${BOLD}${footerIcon} Doctor ${ok ? "passed" : "found issues"} (score: ${report.healthScore}/100)${RESET}`
  );

  return lines.join("\n");
}

function scoreBar(score: number): string {
  const barWidth = 20;
  const filled = Math.round((score / 100) * barWidth);
  const empty = barWidth - filled;
  const color = score >= 80 ? GREEN : score >= 50 ? YELLOW : RED;
  const fullBlock = "\u2588";
  const lightBlock = "\u2591";
  return `  ${color}${fullBlock.repeat(filled)}${GRAY}${lightBlock.repeat(empty)}${RESET}`;
}
