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
});
