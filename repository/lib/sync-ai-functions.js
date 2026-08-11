// Run to update configured repository/features with the latest ai-functions.js version.
// Run either with `node repository/lib/sync-ai-functions.js` or `npm run sync-ai-functions` from the root directory.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const aiFunctionsPath = path.join(__dirname, "ai-functions.js");
const featuresDir = path.join(rootDir, "repository/features");

// Array of target YAML files to sync. Only files explicitly configured in this array will be updated.
const TARGET_FILES = [
  "ai-base-pre.yaml",
  "ai-base-post.yaml"
];

function syncAiFunctions() {
  const jsContent = fs.readFileSync(aiFunctionsPath, "utf-8");
  const indentedJs = jsContent
    .split("\n")
    .map((line) => (line.trim().length > 0 ? "      " + line : ""))
    .join("\n");

  let updatedCount = 0;

  for (const entry of TARGET_FILES) {
    const filePath = path.isAbsolute(entry)
      ? entry
      : entry.includes("/")
      ? path.resolve(rootDir, entry)
      : path.join(featuresDir, entry);

    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: Configured target file not found: ${entry}`);
      continue;
    }

    let yamlContent = fs.readFileSync(filePath, "utf-8");
    let fileModified = false;

    // 1. Sync ai-functions.js resource content if present
    if (yamlContent.includes("name: ai-functions.js")) {
      const marker = "name: ai-functions.js";
      const markerIndex = yamlContent.indexOf(marker);
      if (markerIndex !== -1) {
        const contentPipeIndex = yamlContent.indexOf("content: |", markerIndex);
        if (contentPipeIndex !== -1) {
          const startOfJs = yamlContent.indexOf("\n", contentPipeIndex) + 1;
          const lines = yamlContent.slice(startOfJs).split("\n");
          let endLineIndex = lines.length;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.length > 0 && !line.startsWith("      ")) {
              endLineIndex = i;
              break;
            }
          }

          const endOfJs = startOfJs + lines.slice(0, endLineIndex).join("\n").length;
          const newYamlContent =
            yamlContent.slice(0, startOfJs) +
            indentedJs +
            "\n" +
            yamlContent.slice(endOfJs).replace(/^\n+/, "");

          if (newYamlContent !== yamlContent) {
            yamlContent = newYamlContent;
            fileModified = true;
          }
        }
      }
    }

    // 2. Remove index: "1" from KVM-LoadConfig get metadata for JSON/string parameters
    const cleanedKvm = yamlContent.replace(/\s*index:\s*"1"\s*\n(\s*key:\s*\n\s*parameter:\s*(PriceList|FailoverModel|GroupsLookup))/g, '\n$1');
    if (cleanedKvm !== yamlContent) {
      yamlContent = cleanedKvm;
      fileModified = true;
    }

    if (fileModified) {
      fs.writeFileSync(filePath, yamlContent, "utf-8");
      console.log(`Updated feature file: ${path.basename(filePath)}`);
      updatedCount++;
    } else {
      console.log(`No changes needed for ${path.basename(filePath)}`);
    }
  }

  console.log(`\nSync complete! Updated ${updatedCount} configured feature file(s).`);
}

syncAiFunctions();
