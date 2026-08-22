import { describe, it, expect } from "bun:test";
import { cli } from "../src/lib/cli.js";
import { ApigeeConverter } from "../src/lib/converter.js";
import { version } from "../src/lib/version.js";

describe("AFT Bun CLI test suite", () => {
  const myCli = new cli();

  it("should parse CLI arguments correctly", () => {
    const rawArgs = [
      "bun",
      "apigee-templater.ts",
      "-n",
      "MyTestProxy",
      "-b",
      "/v1/mytest",
      "-u",
      "https://httpbin.org",
      "-o",
      "output.yaml",
      "-p",
      "PARAM1=val1,PARAM2=val2",
    ];

    const parsed = myCli.parseArgumentsIntoOptions(rawArgs);

    expect(parsed.name).toBe("MyTestProxy");
    expect(parsed.basePath).toBe("/v1/mytest");
    expect(parsed.targetUrl).toBe("https://httpbin.org");
    expect(parsed.output).toBe("output.yaml");
    expect(parsed.parameters).toBe("PARAM1=val1,PARAM2=val2");
  });

  it("should sanitize template/proxy name correctly", () => {
    expect(myCli.sanitizeName("my-proxy.yaml", "")).toBe("my-proxy");
    expect(myCli.sanitizeName("ORG:my-proxy", "")).toBe("my-proxy");
    expect(myCli.sanitizeName("secondary-name.json", "")).toBe("secondary-name");
  });

  it("should create template using ApigeeConverter", () => {
    const converter = new ApigeeConverter();
    const template = converter.templateCreate("SampleApi", "/v1/sample", "https://example.com");

    expect(template.name).toBe("SampleApi");
    expect(template.endpoints).toHaveLength(1);
    expect(template.endpoints[0]?.basePath).toBe("/v1/sample");
    expect(template.targets).toHaveLength(1);
    expect(template.targets[0]?.url).toBe("https://example.com");
  });

  it("should expose correct version matching version module", () => {
    expect(version).toBeDefined();
    expect(typeof version).toBe("string");
  });

  it("should generate shell completion scripts", () => {
    const { CompletionManager } = require("../src/lib/completion.js");
    const bashScript = CompletionManager.getBashScript();
    const zshScript = CompletionManager.getZshScript();
    const fishScript = CompletionManager.getFishScript();
    const psScript = CompletionManager.getPowerShellScript();

    expect(bashScript).toContain("_aft_completions");
    expect(bashScript).toContain("complete -o filenames -o default -o bashdefault -F _aft_completions aft");
    expect(zshScript).toContain("compdef _aft_completions aft");
    expect(zshScript).toContain("_files");
    expect(fishScript).toContain("complete -c aft");
    expect(psScript).toContain("Register-ArgumentCompleter");
    expect(psScript).toContain("Get-ChildItem");
  });

  it("should handle feature auto-completion for -a and --applyFeature", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.handleCompletion("-a", "");
      expect(logs.length).toBeGreaterThan(0);
      const output = logs.join("\n");
      expect(output).toContain("ai-completions");
    } finally {
      console.log = origLog;
    }
  });

  it("should handle format auto-completion for -f and --format", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.handleCompletion("-f", "p");
      expect(logs).toContain("proxy");
    } finally {
      console.log = origLog;
    }
  });

  it("should handle skill and cache command completions", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.handleCompletion("skill", "");
      const skillOutput = logs.join("\n");
      expect(skillOutput).toContain("install");
      expect(skillOutput).toContain("uninstall");

      logs.length = 0;
      await myCli.handleCompletion("cache", "");
      const cacheOutput = logs.join("\n");
      expect(cacheOutput).toContain("clear");
    } finally {
      console.log = origLog;
    }
  });

  it("should execute cache clear command without error", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      myCli.handleCacheCommand("clear");
      expect(logs.some((l) => l.includes("cleared successfully"))).toBe(true);
    } finally {
      console.log = origLog;
    }
  });
});

