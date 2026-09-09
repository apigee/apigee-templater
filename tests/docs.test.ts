import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import packageJson from "../package.json";

describe("Documentation Generator", () => {
  const docsPath = path.resolve(import.meta.dir, "../docs/index.html");
  const scriptPath = path.resolve(import.meta.dir, "../scripts/build-docs.ts");

  it("should execute build-docs.ts cleanly without errors", async () => {
    const proc = Bun.spawn(["bun", scriptPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Documentation successfully generated");
    expect(stderr).toBe("");
  });

  it("should generate docs/index.html with current package version", () => {
    expect(fs.existsSync(docsPath)).toBe(true);
    const content = fs.readFileSync(docsPath, "utf-8");

    // Must display current version
    expect(content).toContain(`v${packageJson.version}`);
    expect(content).toContain(`Apigee Feature Templater (aft) v${packageJson.version}`);
    expect(content).toContain("<title>Aft Documentation</title>");
    expect(content).toContain("Aft Documentation");
    // Should use monochrome SVG logo and not pull in the external white logo
    expect(content).not.toContain("https://amalbagee.web.app/apigee/aft-logo.png");
    expect(content).toContain('<svg class="brand-logo"');
    expect(fs.existsSync(path.resolve(import.meta.dir, "../docs/aft-logo.svg"))).toBe(true);
  });

  it("should document all primary CLI commands", () => {
    const content = fs.readFileSync(docsPath, "utf-8");
    const requiredCommands = [
      "convert",
      "describe",
      "reset",
      "list",
      "completion",
      "skill",
      "cache",
    ];

    for (const cmd of requiredCommands) {
      expect(content).toContain(`aft ${cmd}`);
      expect(content).toContain(`id="cmd-${cmd}"`);
    }
  });

  it("should document all CLI options and flags from helpCommands", () => {
    const content = fs.readFileSync(docsPath, "utf-8");
    const flagsToCheck = [
      "--input",
      "--output",
      "--organization",
      "--org",
      "--project",
      "--environment",
      "--env",
      "--service-account",
      "--sa",
      "--format",
      "--applyFeature",
      "--removeFeature",
      "--list",
      "--basePath",
      "--targetUrl",
      "--parameters",
      "--delete",
      "--token",
      "--drz",
    ];

    for (const flag of flagsToCheck) {
      expect(content).toContain(flag);
    }
  });

  it("should include interactive search, filter, and copy buttons", () => {
    const content = fs.readFileSync(docsPath, "utf-8");

    expect(content).toContain('id="docSearch"');
    expect(content).toContain('class="filter-pills"');
    expect(content).toContain('class="copy-btn"');
    expect(content).toContain('id="sidebar"');
    expect(content).toContain('id="sidebarNav"');

    // Ensure file size is substantial and complete
    const stats = fs.statSync(docsPath);
    expect(stats.size).toBeGreaterThan(50 * 1024); // > 50KB
  });

  it("should render central repository link as clickable opening in new tab", () => {
    const content = fs.readFileSync(docsPath, "utf-8");
    expect(content).toContain(
      '<a href="https://github.com/gcp-samples/apigee-template-repository" target="_blank" rel="noopener noreferrer"'
    );
  });
});
