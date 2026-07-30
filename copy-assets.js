import { cpSync, existsSync } from "node:fs";

try {
  // Recursively copy your asset folder to the build/output folder, excluding tests
  cpSync("repository", "dist", {
    recursive: true,
    filter: (src) => !src.includes("repository/lib/tests")
  });

  if (existsSync("skills")) {
    cpSync("skills", "dist/skills", { recursive: true });
  }

  if (existsSync("schema")) {
    cpSync("schema", "dist/schema", { recursive: true });
  }

  console.log("✅ Assets successfully copied to dist");
} catch (err) {
  console.error("❌ Failed to copy assets:", err);
  process.exit(1);
}
