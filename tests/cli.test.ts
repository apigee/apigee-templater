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

  it("should parse --organization, --environment and --service-account CLI arguments correctly", () => {
    const rawArgs = [
      "bun",
      "apigee-templater.ts",
      "-i",
      "test-proxy.yaml",
      "--organization",
      "my-apigee-org",
      "--environment",
      "eval",
      "--service-account",
      "sa@my-apigee-org.iam.gserviceaccount.com",
    ];

    const parsed = myCli.parseArgumentsIntoOptions(rawArgs);

    expect(parsed.input).toBe("test-proxy.yaml");
    expect(parsed.organization).toBe("my-apigee-org");
    expect(parsed.environment).toBe("eval");
    expect(parsed.serviceAccount).toBe("sa@my-apigee-org.iam.gserviceaccount.com");
  });

  it("should handle flag auto-completion for --org, --env, --serv", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.handleCompletion("", "--org");
      expect(logs.join("\n")).toContain("--organization");

      logs.length = 0;
      await myCli.handleCompletion("", "--env");
      expect(logs.join("\n")).toContain("--environment");

      logs.length = 0;
      await myCli.handleCompletion("", "--serv");
      expect(logs.join("\n")).toContain("--service-account");
    } finally {
      console.log = origLog;
    }
  });

  it("should sanitize name from input when primary is empty", () => {
    expect(myCli.sanitizeName("", "my-sample-proxy.yaml")).toBe("my-sample-proxy");
  });

  it("should export and deploy proxy using new CLI parameters", async () => {
    const fs = require("fs");
    const testYamlPath = "./test-export-proxy.yaml";
    fs.writeFileSync(
      testYamlPath,
      `name: test-export-proxy
type: proxy
endpoints:
  - name: default
    basePath: /v1/test
    flows: []
    routes:
      - name: default
        target: default
targets:
  - name: default
    url: https://httpbin.org
    flows: []
policies: []
resources: []
`
    );

    let exportedProxyName = "";
    let exportedOrg = "";
    let deployedProxyName = "";
    let deployedRevision = "";
    let deployedSA = "";
    let deployedEnv = "";
    let deployedOrg = "";

    const originalExport = myCli.apigeeService.apigeeProxyExport;
    const originalDeploy = myCli.apigeeService.apigeeProxyRevisionDeploy;

    myCli.apigeeService.apigeeProxyExport = async (
      proxyName: string,
      path: string,
      org: string,
      drz: string,
      token: string
    ) => {
      exportedProxyName = proxyName;
      exportedOrg = org;
      return "1";
    };

    myCli.apigeeService.apigeeProxyRevisionDeploy = async (
      proxyName: string,
      rev: string,
      sa: string,
      env: string,
      org: string,
      drz: string,
      token: string
    ) => {
      deployedProxyName = proxyName;
      deployedRevision = rev;
      deployedSA = sa;
      deployedEnv = env;
      deployedOrg = org;
      return "1";
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "-i",
        testYamlPath,
        "--organization",
        "test-org",
        "--environment",
        "test-env",
        "--service-account",
        "test-sa@test-org.iam.gserviceaccount.com",
        "--token",
        "test-token",
      ]);

      expect(exportedProxyName).toBe("test-export-proxy");
      expect(exportedOrg).toBe("test-org");
      expect(deployedProxyName).toBe("test-export-proxy");
      expect(deployedRevision).toBe("1");
      expect(deployedSA).toBe("test-sa@test-org.iam.gserviceaccount.com");
      expect(deployedEnv).toBe("test-env");
      expect(deployedOrg).toBe("test-org");
    } finally {
      myCli.apigeeService.apigeeProxyExport = originalExport;
      myCli.apigeeService.apigeeProxyRevisionDeploy = originalDeploy;
      if (fs.existsSync(testYamlPath)) {
        fs.rmSync(testYamlPath);
      }
    }
  });

  it("should still support colon syntax for exporting and deploying", async () => {
    const fs = require("fs");
    const testYamlPath = "./test-colon-proxy.yaml";
    fs.writeFileSync(
      testYamlPath,
      `name: test-colon-proxy
type: proxy
endpoints:
  - name: default
    basePath: /v1/test
    flows: []
    routes:
      - name: default
        target: default
targets:
  - name: default
    url: https://httpbin.org
    flows: []
policies: []
resources: []
`
    );

    let exportedProxyName = "";
    let exportedOrg = "";
    let deployedRevision = "";
    let deployedSA = "";
    let deployedEnv = "";

    const originalExport = myCli.apigeeService.apigeeProxyExport;
    const originalDeploy = myCli.apigeeService.apigeeProxyRevisionDeploy;

    myCli.apigeeService.apigeeProxyExport = async (
      proxyName: string,
      path: string,
      org: string,
      drz: string,
      token: string
    ) => {
      exportedProxyName = proxyName;
      exportedOrg = org;
      return "2";
    };

    myCli.apigeeService.apigeeProxyRevisionDeploy = async (
      proxyName: string,
      rev: string,
      sa: string,
      env: string,
      org: string,
      drz: string,
      token: string
    ) => {
      deployedRevision = rev;
      deployedSA = sa;
      deployedEnv = env;
      return "2";
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "-i",
        testYamlPath,
        "-o",
        "colon-org:custom-proxy-name:colon-env:colon-sa@test.iam.gserviceaccount.com",
        "--token",
        "test-token",
      ]);

      expect(exportedProxyName).toBe("custom-proxy-name");
      expect(exportedOrg).toBe("colon-org");
      expect(deployedRevision).toBe("2");
      expect(deployedEnv).toBe("colon-env");
      expect(deployedSA).toBe("colon-sa@test.iam.gserviceaccount.com");
    } finally {
      myCli.apigeeService.apigeeProxyExport = originalExport;
      myCli.apigeeService.apigeeProxyRevisionDeploy = originalDeploy;
      if (fs.existsSync(testYamlPath)) {
        fs.rmSync(testYamlPath);
      }
    }
  });
});

