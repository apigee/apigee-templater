import { describe, it, expect } from "bun:test";
import { ApigeeConverter } from "../src/lib/converter.js";
import { ApigeeTemplaterService } from "../src/lib/service.js";
import { Deployment } from "../src/lib/interfaces.js";
import Ajv from "ajv";
import parseYaml from "yaml";
import fs from "fs";
import path from "path";
import { cli } from "../src/lib/cli.js";

describe("Deployment Consolidation and Emulator Service Deployment", () => {
  const converter = new ApigeeConverter();
  const service = new ApigeeTemplaterService();
  const quickstartDir = "/home/tyayers/projects/gcp-samples/apigee-antigravity-quickstart";
  const depPath = path.join(quickstartDir, "deployments/antigravity-deployment.yaml");

  it("should consolidate a deployment linking templates, features, products and users into one standalone deployment", async () => {
    expect(fs.existsSync(depPath)).toBe(true);

    const rawContent = fs.readFileSync(depPath, "utf8");
    const deployment: Deployment = parseYaml.parse(rawContent);

    expect(deployment.templates?.length).toBe(1);
    expect(deployment.products?.length).toBe(1);
    expect(deployment.users?.length).toBe(1);

    const consolidated = await service.consolidateDeployment(
      deployment,
      path.dirname(depPath),
      {},
      converter,
    );

    // Templates should be converted to proxies and removed from templates field
    expect(consolidated.type).toBe("deployment");
    expect(consolidated.name).toBe("antigravity-enterprise-deployment");
    expect((consolidated as any).templates).toBeUndefined();
    expect(consolidated.proxies?.length).toBe(1);

    const proxy = consolidated.proxies![0] as any;
    expect(proxy.name).toBe("antigravity-enterprise-gateway");
    expect(proxy.type).toBe("proxy");
    expect(proxy.endpoints?.length).toBeGreaterThan(0);
    expect(proxy.targets?.length).toBeGreaterThan(0);
    expect(proxy.policies?.length).toBeGreaterThanOrEqual(10);

    // Verify key policies from features were merged into proxy
    const policyNames = proxy.policies.map((p: any) => p.name);
    expect(policyNames).toContain("AM-AcknowledgeTelemetry");
    expect(policyNames).toContain("VA-VerifyKey");
    expect(policyNames).toContain("JS-CheckModel");
    expect(policyNames).toContain("SC-ModelJudge");
    expect(policyNames).toContain("JS-TransformPayload");

    // Products and users inlined
    expect(consolidated.products?.length).toBe(1);
    const prod = consolidated.products![0] as any;
    expect(prod.name).toBe("antigravity-gateway-product");
    expect(prod.type).toBe("product");

    expect(consolidated.users?.length).toBe(1);
    const user = consolidated.users![0] as any;
    expect(user.email).toBe("antigravity-developer@example.com");
    expect(user.type).toBe("user");
  });

  it("should validate the consolidated deployment YAML against the gateway JSON schema", async () => {
    const rawContent = fs.readFileSync(depPath, "utf8");
    const deployment: Deployment = parseYaml.parse(rawContent);

    const consolidated = await service.consolidateDeployment(
      deployment,
      path.dirname(depPath),
      {},
      converter,
    );

    const ajv = new Ajv({ strict: false });
    const schemaContent = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "schema/gateway.schema.1.0.json"), "utf8"),
    );
    const validate = ajv.compile(schemaContent);
    const valid = validate(consolidated);
    if (!valid) {
      console.error("Schema validation errors:", validate.errors);
    }
    expect(valid).toBe(true);
  });

  it("should apply parameter substitutions during deployment consolidation", async () => {
    const rawContent = fs.readFileSync(depPath, "utf8");
    const deployment: Deployment = parseYaml.parse(rawContent);

    const consolidated = await service.consolidateDeployment(
      deployment,
      path.dirname(depPath),
      { GoogleCloudProject: "my-test-genai-project" },
      converter,
    );

    const proxy = consolidated.proxies![0] as any;
    const targetOai = proxy.targets.find((t: any) => t.name === "googlecloud-oai");
    expect(targetOai).toBeDefined();
    expect(targetOai.url).toContain("my-test-genai-project");
  });

  it("should execute CLI consolidation writing a single self-contained deployment YAML", async () => {
    const outputPath = path.join(process.cwd(), "tests/tmp-cli-consolidated.yaml");
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    const cliInstance = new cli();
    cliInstance.animation.disable();

    await cliInstance.process([
      "bun",
      "apigee-templater.ts",
      "convert",
      depPath,
      "-f",
      "deployment",
      "-o",
      outputPath,
      "--no-animation",
    ]);

    expect(fs.existsSync(outputPath)).toBe(true);
    const outputYaml = fs.readFileSync(outputPath, "utf8");
    expect(outputYaml).toContain("# yaml-language-server: $schema=");
    expect(outputYaml).toContain("name: antigravity-enterprise-deployment");
    expect(outputYaml).toContain("proxies:");
    expect(outputYaml).toContain("antigravity-enterprise-gateway");
    expect(outputYaml).toContain("antigravity-gateway-product");
    expect(outputYaml).toContain("antigravity-developer@example.com");
    expect(outputYaml).not.toMatch(/^templates:\s*$/m);

    const parsed = parseYaml.parse(outputYaml);
    expect(parsed.type).toBe("deployment");
    expect(parsed.proxies?.length).toBe(1);

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  });

  it("should successfully deploy a consolidated deployment to the Apigee Emulator Service API", async () => {
    const emulatorUrl = "https://apigee-emulator-ghfontasua-ew.a.run.app";

    const rawContent = fs.readFileSync(depPath, "utf8");
    const deployment: Deployment = parseYaml.parse(rawContent);
    const consolidated = await service.consolidateDeployment(
      deployment,
      path.dirname(depPath),
      {},
      converter,
    );

    const yamlStr = parseYaml.stringify(consolidated);

    const result = await service.deployToEmulatorService(emulatorUrl, {
      yaml: yamlStr,
      environment: "test",
      target: "emulator",
    });

    expect(result.success).toBe(true);
    expect(result.runtimeType).toBe("emulator");
    expect(result.environment).toBe("test");
    expect(result.deployedProxies).toBeDefined();
    expect(result.deployedProxies!.length).toBeGreaterThan(0);
    expect(
      result.deployedProxies!.some((p: any) => p.name === "antigravity-enterprise-gateway"),
    ).toBe(true);
  });

  it("should deploy to Apigee Emulator Service API using CLI with -f emulator and URL output", async () => {
    const cliInstance = new cli();
    cliInstance.animation.disable();

    await cliInstance.process([
      "bun",
      "apigee-templater.ts",
      "convert",
      depPath,
      "-f",
      "emulator",
      "-o",
      "https://apigee-emulator-ghfontasua-ew.a.run.app",
      "--no-animation",
    ]);
  });

  it("should gracefully handle emulator deployment failure with invalid URL", async () => {
    const invalidUrl = "http://127.0.0.1:59999";
    const result = await service.deployToEmulatorService(invalidUrl, {
      yaml: "gateway: apigee\nname: test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
