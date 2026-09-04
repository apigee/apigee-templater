import { describe, it, expect } from "bun:test";
import fs from "fs";
import * as YAML from "yaml";
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
    expect(parsed.command).toBe("convert");
  });

  it("should parse CLI arguments with convert command explicitly provided", () => {
    const rawArgs = [
      "bun",
      "apigee-templater.ts",
      "convert",
      "-i",
      "my-proxy.yaml",
      "-o",
      "my-proxy.zip",
    ];

    const parsed = myCli.parseArgumentsIntoOptions(rawArgs);

    expect(parsed.command).toBe("convert");
    expect(parsed.input).toBe("my-proxy.yaml");
    expect(parsed.output).toBe("my-proxy.zip");
  });

  it("should parse positional arguments with convert command", () => {
    const rawArgs = [
      "bun",
      "apigee-templater.ts",
      "convert",
      "input.yaml",
      "output.zip",
    ];

    const parsed = myCli.parseArgumentsIntoOptions(rawArgs);

    expect(parsed.command).toBe("convert");
    expect(parsed.input).toBe("input.yaml");
    expect(parsed.output).toBe("output.zip");
  });

  it("should display convert command as default in printHelp", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      myCli.printHelp();
      const output = logs.join("\n");
      expect(output).toContain("convert");
      expect(output).toContain("default command");
      expect(output).toContain("aft [convert] [options]");
    } finally {
      console.log = origLog;
    }
  });

  it("should parse -l, --list, and --listFeatures CLI arguments correctly", () => {
    const parsedShort = myCli.parseArgumentsIntoOptions(["bun", "apigee-templater.ts", "-l"]);
    expect(parsedShort.list).toBe(true);
    expect(parsedShort.listFeatures).toBe(true);

    const parsedLong = myCli.parseArgumentsIntoOptions(["bun", "apigee-templater.ts", "--list"]);
    expect(parsedLong.list).toBe(true);
    expect(parsedLong.listFeatures).toBe(true);

    const parsedLegacy = myCli.parseArgumentsIntoOptions(["bun", "apigee-templater.ts", "--listFeatures"]);
    expect(parsedLegacy.list).toBe(true);
    expect(parsedLegacy.listFeatures).toBe(true);

    const parsedConvert = myCli.parseArgumentsIntoOptions(["bun", "apigee-templater.ts", "convert", "-l"]);
    expect(parsedConvert.list).toBe(true);
    expect(parsedConvert.listFeatures).toBe(true);
  });

  it("should list both templates and features from repository in printFeatures", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.printFeatures();
      const output = logs.join("\n");
      expect(output).toContain("Available Apigee Templates:");
      expect(output).toContain("Total templates available:");
      expect(output).toContain("Available Apigee Features:");
      expect(output).toContain("Total features available:");
    } finally {
      console.log = origLog;
    }
  });

  it("should parse multiple features for --applyFeature and -a (comma-separated and repeated)", () => {
    const parsedComma = myCli.parseArgumentsIntoOptions([
      "bun",
      "apigee-templater.ts",
      "-a",
      "auth-apikey-validate,ai-post-analytics",
    ]);
    expect(parsedComma.applyFeature).toBe("auth-apikey-validate,ai-post-analytics");
    expect(parsedComma.applyFeatures).toEqual(["auth-apikey-validate", "ai-post-analytics"]);

    const parsedRepeated = myCli.parseArgumentsIntoOptions([
      "bun",
      "apigee-templater.ts",
      "-a",
      "auth-apikey-validate",
      "-a",
      "ai-post-analytics",
    ]);
    expect(parsedRepeated.applyFeature).toBe("auth-apikey-validate,ai-post-analytics");
    expect(parsedRepeated.applyFeatures).toEqual(["auth-apikey-validate", "ai-post-analytics"]);
  });

  it("should parse multiple features for --removeFeature and -r (comma-separated and repeated)", () => {
    const parsedComma = myCli.parseArgumentsIntoOptions([
      "bun",
      "apigee-templater.ts",
      "-r",
      "auth-apikey-validate,ai-post-analytics",
    ]);
    expect(parsedComma.removeFeature).toBe("auth-apikey-validate,ai-post-analytics");
    expect(parsedComma.removeFeatures).toEqual(["auth-apikey-validate", "ai-post-analytics"]);

    const parsedRepeated = myCli.parseArgumentsIntoOptions([
      "bun",
      "apigee-templater.ts",
      "-r",
      "auth-apikey-validate",
      "-r",
      "ai-post-analytics",
    ]);
    expect(parsedRepeated.removeFeature).toBe("auth-apikey-validate,ai-post-analytics");
    expect(parsedRepeated.removeFeatures).toEqual(["auth-apikey-validate", "ai-post-analytics"]);
  });

  it("should output concise structured catalog in JSON format for printFeatures('json')", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.printFeatures("json");
      const output = logs.join("\n");
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("templates");
      expect(parsed).toHaveProperty("features");
      expect(Array.isArray(parsed.templates)).toBe(true);
      expect(Array.isArray(parsed.features)).toBe(true);
      expect(parsed.templates.length).toBeGreaterThan(0);
      expect(parsed.features.length).toBeGreaterThan(0);

      const template = parsed.templates[0];
      expect(template).toHaveProperty("name");
      expect(template).not.toHaveProperty("policies");
      expect(template).not.toHaveProperty("endpoints");

      const feature = parsed.features[0];
      expect(feature).toHaveProperty("name");
      expect(feature).not.toHaveProperty("policies");
      expect(feature).not.toHaveProperty("endpoints");
    } finally {
      console.log = origLog;
    }
  });

  it("should output concise structured catalog in YAML format for printFeatures('yaml')", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.printFeatures("yaml");
      const output = logs.join("\n");
      const parsed = YAML.parse(output);
      expect(parsed).toHaveProperty("templates");
      expect(parsed).toHaveProperty("features");
      expect(Array.isArray(parsed.templates)).toBe(true);
      expect(Array.isArray(parsed.features)).toBe(true);
    } finally {
      console.log = origLog;
    }
  });

  it("should apply and remove multiple features sequentially via CLI process", async () => {
    const testApplyPath = "/tmp/test-apply-multi-suite.yaml";
    const testRemovePath = "/tmp/test-remove-multi-suite.yaml";
    const feat1 = "tests/data/feature-01-api-key-auth.yaml";
    const feat2 = "tests/data/feature-02-rate-limiting.yaml";

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "convert",
        "-n",
        "MultiSuite",
        "-b",
        "/v1/suite",
        "-u",
        "https://example.com",
        "-a",
        `${feat1},${feat2}`,
        "-f",
        "template",
        "-o",
        testApplyPath,
      ]);

      expect(fs.existsSync(testApplyPath)).toBe(true);
      const applied = YAML.parse(fs.readFileSync(testApplyPath, "utf8"));
      expect(applied.features).toBeDefined();
      expect(applied.features.length).toBe(2);

      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "convert",
        "-i",
        testApplyPath,
        "-r",
        `${feat1},${feat2}`,
        "-o",
        testRemovePath,
      ]);

      expect(fs.existsSync(testRemovePath)).toBe(true);
      const removed = YAML.parse(fs.readFileSync(testRemovePath, "utf8"));
      expect(removed.features || []).toHaveLength(0);
    } finally {
      if (fs.existsSync(testApplyPath)) fs.rmSync(testApplyPath);
      if (fs.existsSync(testRemovePath)) fs.rmSync(testRemovePath);
    }
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
      expect(logs[0].split("\n")).toContain("proxy");
      expect(logs[0].split("\n")).toContain("product");
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

  it("should parse --org and --project as alternative options to --organization", () => {
    const parsedOrg = myCli.parseArgumentsIntoOptions([
      "bun",
      "cli.ts",
      "-i",
      "test-proxy.yaml",
      "--org",
      "my-org-alias",
    ]);
    expect(parsedOrg.organization).toBe("my-org-alias");

    const parsedProject = myCli.parseArgumentsIntoOptions([
      "bun",
      "cli.ts",
      "-i",
      "test-proxy.yaml",
      "--project",
      "my-gcp-project",
    ]);
    expect(parsedProject.organization).toBe("my-gcp-project");

    const parsedPositionalWithOrg = myCli.parseArgumentsIntoOptions([
      "bun",
      "cli.ts",
      "test-proxy.yaml",
      "--org",
      "my-org-alias",
    ]);
    expect(parsedPositionalWithOrg.input).toBe("test-proxy.yaml");
    expect(parsedPositionalWithOrg.organization).toBe("my-org-alias");

    const parsedPositionalWithProject = myCli.parseArgumentsIntoOptions([
      "bun",
      "cli.ts",
      "test-proxy.yaml",
      "--project",
      "my-gcp-project",
    ]);
    expect(parsedPositionalWithProject.input).toBe("test-proxy.yaml");
    expect(parsedPositionalWithProject.organization).toBe("my-gcp-project");
  });

  it("should handle flag auto-completion for --org, --project, --env, --serv", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.handleCompletion("", "--org");
      const orgOutput = logs.join("\n");
      expect(orgOutput).toContain("--organization");
      expect(orgOutput).toContain("--org");

      logs.length = 0;
      await myCli.handleCompletion("", "--proj");
      expect(logs.join("\n")).toContain("--project");

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

  it("should format Apigee API errors in red bold italics with URL and response text", async () => {
    const service = myCli.apigeeService;
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    const origFetch = global.fetch;
    try {
      // Mock 403 Forbidden with details
      global.fetch = async (url: any, opts: any) => {
        return new Response(JSON.stringify({
          error: {
            code: 403,
            message: "The caller does not have permission to access the organization.",
            status: "PERMISSION_DENIED"
          }
        }), {
          status: 403,
          statusText: "Forbidden",
          headers: { "Content-Type": "application/json" }
        });
      };

      const result = await service.apigeeProxiesList("test-org-403", "", "Bearer mock-token");
      expect(result).toBeUndefined();

      const combinedLogs = logs.join("\n");
      expect(combinedLogs).toContain("Got response 403");
      expect(combinedLogs).toContain("https://apigee.googleapis.com/v1/organizations/test-org-403/apis");
      expect(combinedLogs).toContain("PERMISSION_DENIED");
      expect(combinedLogs).toContain("The caller does not have permission");
    } finally {
      global.fetch = origFetch;
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

  it("should export product using CLI flags --organization and --environment", async () => {
    let exportedProduct: any;
    let exportedOrg = "";

    const originalProductExport = myCli.apigeeService.apigeeProductExport;
    myCli.apigeeService.apigeeProductExport = async (
      prod: any,
      org: string,
      drz: string,
      token: string
    ) => {
      exportedProduct = prod;
      exportedOrg = org;
      return true;
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "-i",
        "tests/data/product-02-gemini-ai.yaml",
        "--organization",
        "aigateway-lab8",
        "--environment",
        "dev",
        "--token",
        "test-token",
      ]);

      expect(exportedOrg).toBe("aigateway-lab8");
      expect(exportedProduct).toBeDefined();
      expect(exportedProduct.name).toBe("gemini-ai-developer-product");
      expect(exportedProduct.environments).toContain("dev");
    } finally {
      myCli.apigeeService.apigeeProductExport = originalProductExport;
    }
  });

  it("should export user using CLI flag --organization", async () => {
    let exportedUser: any;
    let exportedOrg = "";

    const originalUserExport = myCli.apigeeService.apigeeUserExport;
    myCli.apigeeService.apigeeUserExport = async (
      usr: any,
      org: string,
      drz: string,
      token: string
    ) => {
      exportedUser = usr;
      exportedOrg = org;
      return true;
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "-i",
        "tests/data/user-01-developer.yaml",
        "--organization",
        "aigateway-lab8",
        "--token",
        "test-token",
      ]);

      expect(exportedOrg).toBe("aigateway-lab8");
      expect(exportedUser).toBeDefined();
      expect(exportedUser.email).toBe("john.doe@example.com");
    } finally {
      myCli.apigeeService.apigeeUserExport = originalUserExport;
    }
  });

  it("should deploy proxy, products, and users when deploying a template referencing them", async () => {
    let exportedProxyName = "";
    let deployedRevision = "";
    let deployedEnv = "";
    let exportedProducts: any[] = [];
    let exportedUsers: any[] = [];

    const origProxyExport = myCli.apigeeService.apigeeProxyExport;
    const origDeploy = myCli.apigeeService.apigeeProxyRevisionDeploy;
    const origProductExport = myCli.apigeeService.apigeeProductExport;
    const origUserExport = myCli.apigeeService.apigeeUserExport;

    myCli.apigeeService.apigeeProxyExport = async (name, path, org, drz, token) => {
      exportedProxyName = name;
      return "1";
    };
    myCli.apigeeService.apigeeProxyRevisionDeploy = async (name, rev, sa, env, org, drz, token) => {
      deployedRevision = rev;
      deployedEnv = env;
      return true;
    };
    myCli.apigeeService.apigeeProductExport = async (prod, org, drz, token) => {
      exportedProducts.push(prod);
      return true;
    };
    myCli.apigeeService.apigeeUserExport = async (usr, org, drz, token) => {
      exportedUsers.push(usr);
      return true;
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "-i",
        "tests/data/template-01-basic-api.yaml",
        "--organization",
        "aigateway-lab8",
        "--environment",
        "dev",
        "--token",
        "test-token",
      ]);

      expect(exportedProxyName).toBe("template-01-basic-api");
      expect(deployedRevision).toBe("1");
      expect(deployedEnv).toBe("dev");
      expect(exportedProducts.length).toBe(1);
      expect(exportedProducts[0].name).toBe("standard-api-product");
      expect(exportedProducts[0].environments).toContain("dev");
      expect(exportedProducts[0].proxies).toContain("template-01-basic-api");
      expect(exportedUsers.length).toBe(1);
      expect(exportedUsers[0].email).toBe("john.doe@example.com");
    } finally {
      myCli.apigeeService.apigeeProxyExport = origProxyExport;
      myCli.apigeeService.apigeeProxyRevisionDeploy = origDeploy;
      myCli.apigeeService.apigeeProductExport = origProductExport;
      myCli.apigeeService.apigeeUserExport = origUserExport;
    }
  });

  it("should delete template resources in correct order (user -> product -> proxy)", async () => {
    const deletedOrder: string[] = [];
    const origUserDelete = myCli.apigeeService.apigeeUserDelete;
    const origProductDelete = myCli.apigeeService.apigeeProductDelete;
    const origProxyDelete = myCli.apigeeService.apigeeProxyDelete;

    myCli.apigeeService.apigeeUserDelete = async (userKey, org, drz, token) => {
      deletedOrder.push(`user:${userKey}`);
      return true;
    };
    myCli.apigeeService.apigeeProductDelete = async (prodName, org, drz, token) => {
      deletedOrder.push(`product:${prodName}`);
      return true;
    };
    myCli.apigeeService.apigeeProxyDelete = async (proxyName, org, drz, token) => {
      deletedOrder.push(`proxy:${proxyName}`);
      return true;
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "-i",
        "tests/data/template-01-basic-api.yaml",
        "--delete",
        "--organization",
        "aigateway-lab8",
        "--token",
        "test-token",
      ]);

      expect(deletedOrder).toEqual([
        "user:john.doe@example.com",
        "product:standard-api-product",
        "proxy:template-01-basic-api",
      ]);
    } finally {
      myCli.apigeeService.apigeeUserDelete = origUserDelete;
      myCli.apigeeService.apigeeProductDelete = origProductDelete;
      myCli.apigeeService.apigeeProxyDelete = origProxyDelete;
    }
  });

  it("should format --config output by default and support -f json / yaml", async () => {
    const origConfigGet = myCli.apigeeService.apigeeConfigGet;
    myCli.apigeeService.apigeeConfigGet = async (org, drz, token) => {
      return {
        org: {
          name: "aigateway-lab8",
          displayName: "AI Gateway Lab",
          analyticsRegion: "us-central1",
          billingType: "PAYG",
          state: "ACTIVE",
          expiresAt: "1767225600000",
        },
        environments: ["dev", "prod"],
        environmentGroups: [
          {
            name: "default-group",
            hostnames: ["api.example.com"],
            attachments: [{ environment: "dev" }],
          },
        ],
      };
    };

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.join(" "));
    };

    try {
      // Default formatted output
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "--config",
        "aigateway-lab8",
        "--token",
        "test-token",
      ]);

      const allOutput = logs.join("\n");
      expect(allOutput).toContain("CONFIG");
      expect(allOutput).toContain("Organization aigateway-lab8");
      expect(allOutput).toContain("Analytics Region:");
      expect(allOutput).toContain("us-central1");
      expect(allOutput).toContain("Billing Type:");
      expect(allOutput).toContain("PAYG");
      expect(allOutput).toContain("default-group");
      expect(allOutput).toContain("api.example.com");

      // JSON format
      logs.length = 0;
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "--config",
        "aigateway-lab8",
        "-f",
        "json",
        "--token",
        "test-token",
      ]);
      const jsonParsed = JSON.parse(logs.join("\n"));
      expect(jsonParsed.org.name).toBe("aigateway-lab8");
      expect(jsonParsed.environments).toContain("dev");
    } finally {
      console.log = origLog;
      myCli.apigeeService.apigeeConfigGet = origConfigGet;
    }
  });

  it("should export a single product from Apigee to YAML using --organization and -f product", async () => {
    const fs = require("fs");
    const YAML = require("yaml");
    const outYamlPath = "./test-export-product.yaml";

    const origProductGet = myCli.apigeeService.apigeeProductGet;
    myCli.apigeeService.apigeeProductGet = async (name: string, org: string, drz: string, token: string) => {
      return {
        name: "product-remote",
        displayName: "Remote Product",
        environments: ["dev", "prod"],
        proxies: ["proxy-1"],
        quota: "1000",
        quotaInterval: "1",
        quotaTimeUnit: "month",
      };
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "product-remote",
        "--organization",
        "test-org",
        "-f",
        "product",
        "-o",
        outYamlPath,
        "--token",
        "test-token",
      ]);

      expect(fs.existsSync(outYamlPath)).toBe(true);
      const content = YAML.parse(fs.readFileSync(outYamlPath, "utf8"));
      expect(content.name).toBe("product-remote");
      expect(content.type).toBe("product");
      expect(content.environments).toContain("dev");
    } finally {
      myCli.apigeeService.apigeeProductGet = origProductGet;
      if (fs.existsSync(outYamlPath)) {
        fs.rmSync(outYamlPath);
      }
    }
  });

  it("should export a single user from Apigee to YAML using --organization and -f user", async () => {
    const fs = require("fs");
    const YAML = require("yaml");
    const outYamlPath = "./test-export-user.yaml";

    const origUserGet = myCli.apigeeService.apigeeUserGet;
    myCli.apigeeService.apigeeUserGet = async (email: string, org: string, drz: string, token: string) => {
      return {
        name: "test-dev",
        type: "user",
        email: "test-dev@example.com",
        firstName: "Test",
        lastName: "Dev",
        userName: "test-dev",
        apps: [
          {
            name: "test-app",
            credentials: [{ consumerKey: "key-123", consumerSecret: "sec-456" }],
          },
        ],
      };
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "test-dev@example.com",
        "--organization",
        "test-org",
        "-f",
        "user",
        "-o",
        outYamlPath,
        "--token",
        "test-token",
      ]);

      expect(fs.existsSync(outYamlPath)).toBe(true);
      const content = YAML.parse(fs.readFileSync(outYamlPath, "utf8"));
      expect(content.email).toBe("test-dev@example.com");
      expect(content.type).toBe("user");
      expect(content.apps.length).toBe(1);
    } finally {
      myCli.apigeeService.apigeeUserGet = origUserGet;
      if (fs.existsSync(outYamlPath)) {
        fs.rmSync(outYamlPath);
      }
    }
  });

  it("should export all products from an Apigee org to a directory", async () => {
    const fs = require("fs");
    const YAML = require("yaml");
    const outDir = "./test-export-products-dir";

    const origProductsList = myCli.apigeeService.apigeeProductsList;
    const origProductGet = myCli.apigeeService.apigeeProductGet;

    myCli.apigeeService.apigeeProductsList = async (org: string, drz: string, token: string) => {
      return {
        apiProduct: [
          { name: "prod-1", displayName: "Product One" },
          { name: "prod-2", displayName: "Product Two" },
        ],
      };
    };

    myCli.apigeeService.apigeeProductGet = async (name: string, org: string, drz: string, token: string) => {
      return {
        name: name,
        displayName: `Display ${name}`,
        environments: ["dev"],
        proxies: [],
      };
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "--organization",
        "test-org",
        "-f",
        "product",
        "-o",
        outDir,
        "--token",
        "test-token",
      ]);

      expect(fs.existsSync(outDir)).toBe(true);
      expect(fs.existsSync(`${outDir}/prod-1.yaml`)).toBe(true);
      expect(fs.existsSync(`${outDir}/prod-2.yaml`)).toBe(true);
      const p1 = YAML.parse(fs.readFileSync(`${outDir}/prod-1.yaml`, "utf8"));
      expect(p1.name).toBe("prod-1");
      expect(p1.type).toBe("product");
    } finally {
      myCli.apigeeService.apigeeProductsList = origProductsList;
      myCli.apigeeService.apigeeProductGet = origProductGet;
      if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true });
      }
    }
  });

  it("should export all users from an Apigee org to a directory", async () => {
    const fs = require("fs");
    const YAML = require("yaml");
    const outDir = "./test-export-users-dir";

    const origUsersList = myCli.apigeeService.apigeeUsersList;
    const origUserGet = myCli.apigeeService.apigeeUserGet;

    myCli.apigeeService.apigeeUsersList = async (org: string, drz: string, token: string) => {
      return {
        developer: [
          { email: "user1@example.com", userName: "user1" },
          { email: "user2@example.com", userName: "user2" },
        ],
      };
    };

    myCli.apigeeService.apigeeUserGet = async (email: string, org: string, drz: string, token: string) => {
      return {
        name: email.split("@")[0],
        type: "user",
        email: email,
        apps: [],
      };
    };

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "--organization",
        "test-org",
        "-f",
        "user",
        "-o",
        outDir,
        "--token",
        "test-token",
      ]);

      expect(fs.existsSync(outDir)).toBe(true);
      expect(fs.existsSync(`${outDir}/user1.yaml`)).toBe(true);
      expect(fs.existsSync(`${outDir}/user2.yaml`)).toBe(true);
      const u1 = YAML.parse(fs.readFileSync(`${outDir}/user1.yaml`, "utf8"));
      expect(u1.email).toBe("user1@example.com");
      expect(u1.type).toBe("user");
    } finally {
      myCli.apigeeService.apigeeUsersList = origUsersList;
      myCli.apigeeService.apigeeUserGet = origUserGet;
      if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true });
      }
    }
  });

  it("should parse describe command and positional input argument correctly", () => {
    const opts1 = myCli.parseArgumentsIntoOptions([
      "bun",
      "apigee-templater.ts",
      "describe",
      "tests/data/proxy-01-weather-api.yaml",
    ]);
    expect(opts1.command).toBe("describe");
    expect(opts1.input).toBe("tests/data/proxy-01-weather-api.yaml");

    const opts2 = myCli.parseArgumentsIntoOptions([
      "bun",
      "apigee-templater.ts",
      "describe",
      "-i",
      "tests/data/feature-01-api-key-auth.yaml",
    ]);
    expect(opts2.command).toBe("describe");
    expect(opts2.input).toBe("tests/data/feature-01-api-key-auth.yaml");
  });

  it("should describe a proxy YAML without welcome banner or output path", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "describe",
        "tests/data/proxy-01-weather-api.yaml",
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("OVERVIEW");
      expect(combined).toContain("Proxy weather-api-v1");
      expect(combined).toContain("Endpoints:");
      expect(combined).toContain("/v1/weather");
      expect(combined).not.toContain("Output written to:");
      expect(combined).not.toContain("Welcome to Apigee Feature Templater");
    } finally {
      console.log = origLog;
    }
  });

  it("should describe a feature YAML without welcome banner or output path", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "describe",
        "tests/data/feature-01-api-key-auth.yaml",
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("OVERVIEW");
      expect(combined).toContain("Feature feature-api-key-auth");
      expect(combined).toContain("Parameters:");
      expect(combined).not.toContain("Output written to:");
      expect(combined).not.toContain("Welcome to Apigee Feature Templater");
    } finally {
      console.log = origLog;
    }
  });

  it("should format parameters without printing undefined when description is not set", () => {
    const featureWithNoDescParam: any = {
      name: "feature-test",
      type: "feature",
      parameters: [
        {
          name: "PARAM_WITH_DESC",
          description: "A helpful description",
          default: "val1",
        },
        {
          name: "PARAM_WITHOUT_DESC",
          default: "val2",
        },
      ],
    };

    const lines = myCli.converter.featureToStringArray(featureWithNoDescParam);
    expect(lines).toContain("Parameters:");
    expect(lines).toContain("- PARAM_WITH_DESC - A helpful description - Default: val1");
    expect(lines).toContain("- PARAM_WITHOUT_DESC - Default: val2");
    expect(lines.some((l) => l.includes("undefined"))).toBe(false);
  });

  it("should describe a template YAML without welcome banner or output path", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "describe",
        "tests/data/template-01-basic-api.yaml",
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("OVERVIEW");
      expect(combined).toContain("Template template-basic-weather-api");
      expect(combined).toContain("Features:");
      expect(combined).not.toContain("Output written to:");
      expect(combined).not.toContain("Welcome to Apigee Feature Templater");
    } finally {
      console.log = origLog;
    }
  });

  it("should describe a product YAML without welcome banner or output path", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "describe",
        "tests/data/product-01-standard-api.yaml",
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("OVERVIEW");
      expect(combined).toContain("Product standard-api-product");
      expect(combined).toContain("Approval Type:");
      expect(combined).not.toContain("Output written to:");
      expect(combined).not.toContain("Welcome to Apigee Feature Templater");
    } finally {
      console.log = origLog;
    }
  });

  it("should describe a user YAML without welcome banner or output path", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "describe",
        "tests/data/user-01-developer.yaml",
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("OVERVIEW");
      expect(combined).toContain("User dev-john-doe");
      expect(combined).toContain("Email:");
      expect(combined).toContain("john.doe@example.com");
      expect(combined).not.toContain("Output written to:");
      expect(combined).not.toContain("Welcome to Apigee Feature Templater");
    } finally {
      console.log = origLog;
    }
  });

  it("should output error if describe is invoked without input", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "describe",
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("Please specify an input to describe");
      expect(combined).not.toContain("Welcome to Apigee Feature Templater");
    } finally {
      console.log = origLog;
    }
  });

  it("should route single parameter (positional filename) to describe command without overwriting", async () => {
    const opts = myCli.parseArgumentsIntoOptions([
      "bun",
      "apigee-templater.ts",
      "tests/data/proxy-01-weather-api.yaml",
    ]);

    expect(opts.command).toBe("describe");
    expect(opts.input).toBe("tests/data/proxy-01-weather-api.yaml");
    expect(opts.output).toBeFalsy();

    const optsFlag = myCli.parseArgumentsIntoOptions([
      "bun",
      "apigee-templater.ts",
      "-i",
      "tests/data/proxy-01-weather-api.yaml",
    ]);

    expect(optsFlag.command).toBe("describe");
    expect(optsFlag.input).toBe("tests/data/proxy-01-weather-api.yaml");
    expect(optsFlag.output).toBeFalsy();
  });

  it("should execute describe when given only a single filename argument and not overwrite file", async () => {
    const testFile = "./tests/data/test-single-arg-check.yaml";
    const initialContent = "name: test-single-arg\ntype: proxy\nschemaVersion: 1.0.0\nendpoints:\n  - name: default\n    basePath: /v1/test\n";
    fs.writeFileSync(testFile, initialContent);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        testFile,
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("OVERVIEW");
      expect(combined).toContain("Proxy test-single-arg");
      expect(combined).not.toContain("Output written to:");
      expect(combined).not.toContain("Welcome to Apigee Feature Templater");

      // Verify the file was NOT overwritten with an empty template
      const currentContent = fs.readFileSync(testFile, "utf-8");
      expect(currentContent).toBe(initialContent);
    } finally {
      console.log = origLog;
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });

  it("should create an empty template if single argument file does not exist and is not in repository", async () => {
    const nonExistentFile = "./tests/data/test-brand-new-proxy.yaml";
    if (fs.existsSync(nonExistentFile)) {
      fs.unlinkSync(nonExistentFile);
    }

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        nonExistentFile,
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("Welcome to Apigee Feature Templater");
      expect(combined).toContain("OVERVIEW");
      expect(combined).toContain("Output written to: " + nonExistentFile);

      expect(fs.existsSync(nonExistentFile)).toBe(true);
      const content = fs.readFileSync(nonExistentFile, "utf-8");
      expect(content).toContain("name: test-brand-new-proxy");
      expect(content).toContain("endpoints:");
    } finally {
      console.log = origLog;
      if (fs.existsSync(nonExistentFile)) {
        fs.unlinkSync(nonExistentFile);
      }
    }
  });

  it("should describe repository resource without creating a new file when passed as single argument", async () => {
    const localTarget = "./mock-repo-template.yaml";
    if (fs.existsSync(localTarget)) {
      fs.unlinkSync(localTarget);
    }

    const origRepoGet = myCli.apigeeService.repositoryGet;
    myCli.apigeeService.repositoryGet = async (name: string) => {
      if (name === "mock-repo-template") {
        return {
          type: "template",
          data: {
            name: "mock-repo-template",
            type: "template",
            endpoints: [{ name: "default", basePath: "/v1/mock" }],
          } as any,
        };
      }
      return undefined;
    };

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "mock-repo-template",
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("OVERVIEW");
      expect(combined).toContain("Template mock-repo-template");
      expect(combined).not.toContain("Output written to:");
      expect(combined).not.toContain("Welcome to Apigee Feature Templater");

      // Verify no local file was created
      expect(fs.existsSync(localTarget)).toBe(false);
    } finally {
      console.log = origLog;
      myCli.apigeeService.repositoryGet = origRepoGet;
      if (fs.existsSync(localTarget)) {
        fs.unlinkSync(localTarget);
      }
    }
  });

  it("should properly describe feature without explicit name in YAML, populating policies, target flows, and description", async () => {
    const origRepoGet = myCli.apigeeService.repositoryGet;
    myCli.apigeeService.repositoryGet = async (name: string) => {
      if (name === "ai-target-googlecloud") {
        return {
          type: "feature",
          data: {
            type: "feature",
            description: "Proxy for Google Cloud Model Garden models.",
            parameters: [
              {
                name: "GoogleCloudProject",
                default: "{organization.name}",
              },
            ],
            endpoints: [
              {
                name: "default",
              },
            ],
            targets: [
              {
                name: "googlecloud",
                url: "https://aiplatform.googleapis.com",
                flows: [
                  {
                    name: "PreFlow",
                    mode: "Request",
                    steps: [
                      {
                        name: "AM-SetGoogleToken",
                        condition: "request.header.Authorization == null",
                      },
                    ],
                  },
                ],
              },
            ],
            policies: [
              {
                name: "AM-SetGoogleToken",
                type: "AssignMessage",
              },
            ],
          } as any,
        };
      }
      return origRepoGet.call(myCli.apigeeService, name);
    };

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "describe",
        "ai-target-googlecloud",
      ]);

      const combined = logs.join("\n");
      expect(combined).toContain("OVERVIEW");
      expect(combined).toContain("Feature ai-target-googlecloud");
      expect(combined).toContain("Description:");
      expect(combined).toContain("Proxy for Google Cloud Model Garden models.");
      expect(combined).toContain("Parameters:");
      expect(combined).toContain("GoogleCloudProject");
      expect(combined).toContain("Targets:");
      expect(combined).toContain("googlecloud");
      expect(combined).toContain("Target flows:");
      expect(combined).toContain("PreFlow - Request");
      expect(combined).toContain("AM-SetGoogleToken");
      expect(combined).toContain("Policies:");
      expect(combined).toContain("AssignMessage");
    } finally {
      console.log = origLog;
      myCli.apigeeService.repositoryGet = origRepoGet;
    }
  });

  it("should extract target flows and defaultEndpoint basePath in featureToStringArray", () => {
    const feature: any = {
      name: "test-feature",
      type: "feature",
      defaultEndpoint: {
        name: "default",
        basePath: "/v1/test",
        flows: [
          {
            name: "DefaultFlow",
            mode: "Request",
            steps: [{ name: "FC-Check" }],
          },
        ],
      },
      targets: [
        {
          name: "target-1",
          url: "https://example.com/1",
          flows: [
            {
              name: "TargetFlow",
              mode: "Response",
              steps: [{ name: "AM-FormatResponse" }],
            },
          ],
        },
        {
          name: "target-2",
          url: "https://example.com/2",
          flows: [
            {
              name: "TargetFlow",
              mode: "Response",
              steps: [{ name: "AM-FormatResponse" }],
            },
          ],
        },
      ],
      policies: [{ name: "AM-FormatResponse", type: "AssignMessage" }],
    };

    const lines = myCli.converter.featureToStringArray(feature);
    expect(lines).toContain("Endpoints:");
    expect(lines).toContain("- /v1/test");
    expect(lines).toContain("Endpoint flows:");
    expect(lines).toContain("- DefaultFlow - Request");
    expect(lines).toContain("  - FC-Check");
    expect(lines).toContain("Target flows:");
    expect(lines).toContain("- TargetFlow - Response");
    expect(lines).toContain("  - AM-FormatResponse");
    // Verify deduplication so TargetFlow is not duplicated
    const targetFlowOccurrences = lines.filter((l) => l === "- TargetFlow - Response");
    expect(targetFlowOccurrences.length).toBe(1);
  });
});



