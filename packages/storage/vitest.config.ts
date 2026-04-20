import { fileURLToPath } from "node:url";
import { createSynthKitVitestConfig } from "../../vitest.shared.js";

export default createSynthKitVitestConfig(fileURLToPath(new URL("../..", import.meta.url)));
