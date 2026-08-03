// Run to update all repository/features that contains ai-functions.js with the latest version. Run either with `node repository/lib/sync-ai-functions.js` or `npm run sync-ai-functions` from the root directory.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const aiFunctionsPath = path.join(__dirname, "ai-functions.js");
const featuresDir = path.join(rootDir, "repository/features");

function syncAiFunctions() {
  const jsContent = fs.readFileSync(aiFunctionsPath, "utf-8");
  const indentedJs = jsContent
    .split("\n")
    .map((line) => (line.trim().length > 0 ? "      " + line : ""))
    .join("\n");

  const files = fs.readdirSync(featuresDir).filter((f) => f.endsWith(".yaml"));
  let updatedCount = 0;

  for (const file of files) {
    const filePath = path.join(featuresDir, file);
    let yamlContent = fs.readFileSync(filePath, "utf-8");

    if (!yamlContent.includes("name: ai-functions.js")) {
      continue;
    }

    const marker = "name: ai-functions.js";
    const markerIndex = yamlContent.indexOf(marker);
    if (markerIndex === -1) continue;

    const contentPipeIndex = yamlContent.indexOf("content: |", markerIndex);
    if (contentPipeIndex === -1) continue;

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
      fs.writeFileSync(filePath, newYamlContent, "utf-8");
      console.log(`Updated ai-functions.js in ${file}`);
      updatedCount++;
    } else {
      console.log(`No changes needed for ${file}`);
    }
  }

  console.log(`\nSync complete! Updated ${updatedCount} feature file(s).`);
}

syncAiFunctions();
