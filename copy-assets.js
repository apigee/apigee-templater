import { cpSync } from "node:fs";

try {
  // Recursively copy your asset folder to the build/output folder
  cpSync("repository", "dist", { recursive: true });
  console.log("✅ Assets successfully copied to dist");
} catch (err) {
  console.error("❌ Failed to copy assets:", err);
  process.exit(1);
}
