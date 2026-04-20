#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const distEntry = path.join(here, "..", "dist", "index.js");
const sourceEntry = path.join(here, "..", "src", "index.ts");
const args = process.argv.slice(2);

const result = existsSync(distEntry)
  ? spawnSync(process.execPath, [distEntry, ...args], { stdio: "inherit" })
  : spawnSync(process.execPath, ["--conditions=source", "--import", "tsx", sourceEntry, ...args], { stdio: "inherit" });

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
