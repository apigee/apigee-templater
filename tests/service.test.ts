import { describe, it, expect } from "bun:test";
import { ApigeeTemplaterService } from "../src/lib/service.js";
import fs from "fs";
import path from "path";

describe("ApigeeTemplaterService templatesList and featuresList", () => {
  it("should fetch template list from default AFT_TEMPLATES_REPOSITORY and write to cache", async () => {
    const service = new ApigeeTemplaterService();
    service.clearCache();

    const templates = await service.templatesList();

    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some((t) => t.name === "REST-AI-Completions")).toBe(true);
    expect(service.templateListCache).toContain("REST-AI-Completions");

    // Check cache file exists
    const cacheDir = service.getCacheDir();
    const cacheFile = path.join(cacheDir, "templates.json");
    expect(fs.existsSync(cacheFile)).toBe(true);
  });

  it("should fetch feature list from default AFT_FEATURES_REPOSITORY and write to cache", async () => {
    const service = new ApigeeTemplaterService();
    service.clearCache();

    const features = await service.featuresList();

    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBeGreaterThan(0);
    expect(features.some((f) => f.name === "ai-completions")).toBe(true);
    expect(service.featureListCache).toContain("ai-completions");

    // Check cache file exists
    const cacheDir = service.getCacheDir();
    const cacheFile = path.join(cacheDir, "features.json");
    expect(fs.existsSync(cacheFile)).toBe(true);
  });

  it("should clear the local cache correctly", () => {
    const service = new ApigeeTemplaterService();
    const result = service.clearCache();

    expect(result.errors.length).toBe(0);
    const cacheDir = service.getCacheDir();
    if (fs.existsSync(cacheDir)) {
      expect(fs.readdirSync(cacheDir).length).toBe(0);
    }
  });
});
