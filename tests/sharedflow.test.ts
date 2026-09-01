import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { ApigeeConverter } from "../src/lib/converter.js";
import { ApigeeTemplaterService } from "../src/lib/service.js";
import { Feature, Step, Flow, FaultRule, Policy, Resource, ProxyEndpoint, Parameter } from "../src/lib/interfaces.js";
import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import * as xmljs from "xml-js";

describe("SharedFlow and Feature conversion", () => {
  const converter = new ApigeeConverter();
  const tempDir = "./tests/temp_sf_test/";

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("should export a Feature to a SharedFlow ZIP bundle and convert it back to a Feature", async () => {
    let feature = new Feature();
    feature.name = "cors-security-sf";
    feature.displayName = "CORS & Security SharedFlow";
    feature.description = "Reusable CORS and API key verification shared flow";
    feature.documentation = "Apply this shared flow across all proxies";
    feature.priority = 10;
    feature.categories = ["security", "cors"];
    let param = new Parameter();
    param.name = "API_KEY_HEADER";
    param.default = "x-api-key";
    feature.parameters = [param];

    // Flow with steps and conditions
    let flow = new Flow("PreFlow", "Request");
    let step1 = new Step();
    step1.name = "Verify-API-Key";
    step1.condition = "request.header.x-api-key != null";

    let step2 = new Step();
    step2.name = "CORS-Header-Check";
    flow.steps = [step1, step2];
    feature.defaultEndpoint = new ProxyEndpoint();
    feature.defaultEndpoint.name = "default";
    feature.defaultEndpoint.flows = [flow];

    // FaultRule
    let faultRule = new Flow("ApiKeyFault", "Request");
    faultRule.name = "ApiKeyFault";
    faultRule.condition = "fault.name = 'InvalidApiKey'";
    let faultStep = new Step();
    faultStep.name = "Assign-Error-Payload";
    faultRule.steps = [faultStep];
    feature.defaultEndpoint.faultRules = [faultRule];

    // Policy
    let policy = new Policy();
    policy.name = "Verify-API-Key";
    policy.type = "VerifyAPIKey";
    policy.content = {
      VerifyAPIKey: {
        _attributes: {
          name: "Verify-API-Key",
        },
        APIKey: {
          _attributes: {
            ref: "request.header.x-api-key",
          },
        },
      },
    };
    feature.policies = [policy];

    // Resource
    let resource = new Resource();
    resource.name = "cors-helper.js";
    resource.type = "jsc";
    resource.content = "var allowedOrigins = ['https://example.com'];";
    feature.resources = [resource];

    // 1. Convert Feature to SharedFlow Zip
    let zipPath = await converter.featureToSharedFlowZip(feature, true, {
      API_KEY_HEADER: "x-api-key-custom",
    });

    expect(fs.existsSync(zipPath)).toBe(true);

    // 2. Unzip and verify internal XML structure
    let zipEntries: string[] = [];
    await new Promise<void>((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);
        zipfile.readEntry();
        zipfile.on("entry", (entry) => {
          zipEntries.push(entry.fileName);
          zipfile.readEntry();
        });
        zipfile.on("close", () => resolve());
      });
    });

    expect(zipEntries).toContain("sharedflowbundle/sharedflowbundle.xml");
    expect(zipEntries).toContain("sharedflowbundle/sharedflows/default.xml");
    expect(zipEntries).toContain("sharedflowbundle/policies/Verify-API-Key.xml");
    expect(zipEntries).toContain("sharedflowbundle/resources/jsc/metadata.js");
    expect(zipEntries).toContain("sharedflowbundle/resources/jsc/cors-helper.js");

    // 3. Convert SharedFlow Zip back to Feature
    let importedFeature = await converter.apigeeSharedFlowZipToFeature("cors-security-sf", zipPath);

    expect(importedFeature).toBeDefined();
    expect(importedFeature.type).toBe("feature");
    expect(importedFeature.name).toBe("cors-security-sf");
    expect(importedFeature.displayName).toBe("CORS & Security SharedFlow");
    expect(importedFeature.description).toBe("Reusable CORS and API key verification shared flow");
    expect(importedFeature.documentation).toBe("Apply this shared flow across all proxies");
    expect(importedFeature.priority).toBe(10);
    expect(importedFeature.categories).toEqual(["security", "cors"]);

    // Verify steps restored
    expect(importedFeature.defaultEndpoint?.flows?.length).toBeGreaterThan(0);
    let restoredSteps = importedFeature.defaultEndpoint!.flows![0].steps;
    expect(restoredSteps.length).toBe(2);
    expect(restoredSteps[0].name).toBe("Verify-API-Key");
    expect(restoredSteps[0].condition).toBe("request.header.x-api-key != null");
    expect(restoredSteps[1].name).toBe("CORS-Header-Check");

    // Verify fault rules restored
    expect(importedFeature.defaultEndpoint?.faultRules?.length).toBe(1);
    expect(importedFeature.defaultEndpoint!.faultRules![0].name).toBe("ApiKeyFault");
    expect(importedFeature.defaultEndpoint!.faultRules![0].steps[0].name).toBe("Assign-Error-Payload");

    // Verify policies restored
    expect(importedFeature.policies.length).toBe(1);
    expect(importedFeature.policies[0].name).toBe("Verify-API-Key");
    expect(importedFeature.policies[0].type).toBe("VerifyAPIKey");

    // Verify resources restored
    expect(importedFeature.resources.length).toBe(1);
    expect(importedFeature.resources[0].name).toBe("cors-helper.js");
    expect(importedFeature.resources[0].content).toBe("var allowedOrigins = ['https://example.com'];");

    // Clean up
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  });

  test("should convert Feature to SharedFlow folder and back", async () => {
    let feature = new Feature();
    feature.name = "logging-sf";
    feature.description = "Centralized logging shared flow";
    feature.defaultEndpoint = new ProxyEndpoint();
    feature.defaultEndpoint.name = "default";

    let step = new Step();
    step.name = "MessageLogging-CloudWatch";
    feature.defaultEndpoint.flows = [new Flow("PreFlow", "Request")];
    feature.defaultEndpoint.flows[0].steps = [step];

    let destFolder = path.join(tempDir, "logging-sf-bundle");
    await converter.featureToSharedFlowFolder(feature, destFolder);

    expect(fs.existsSync(path.join(destFolder, "sharedflowbundle/sharedflowbundle.xml"))).toBe(true);
    expect(fs.existsSync(path.join(destFolder, "sharedflowbundle/sharedflows/default.xml"))).toBe(true);

    let importedFeature = converter.apigeeSharedFlowFolderToFeature("logging-sf", destFolder);
    expect(importedFeature.name).toBe("logging-sf");
    expect(importedFeature.defaultEndpoint?.flows?.[0].steps[0].name).toBe("MessageLogging-CloudWatch");
  });

  test("should support ApigeeTemplaterService shared flow REST operations", async () => {
    const service = new ApigeeTemplaterService();

    const originalFetch = globalThis.fetch;
    let requestedUrls: string[] = [];

    // Mock fetch
    globalThis.fetch = mock(async (input: any, init?: any) => {
      let url = typeof input === "string" ? input : input.url;
      requestedUrls.push(url);

      if (url.endsWith("/sharedflows")) {
        return new Response(JSON.stringify({ sharedFlows: [{ name: "sf-1" }, { name: "sf-2" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/sharedflows?name=sf-1&action=import")) {
        return new Response(JSON.stringify({ revision: "3" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/revisions/3/deployments")) {
        return new Response(JSON.stringify({ revision: "3", state: "PROGRESSING" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/sharedflows/sf-delete")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 404 });
    }) as any;

    try {
      // 1. List SharedFlows
      let list = await service.apigeeSharedFlowList("my-org", "", "Bearer token123");
      expect(list).toEqual(["sf-1", "sf-2"]);
      expect(requestedUrls[0]).toContain("/organizations/my-org/sharedflows");

      // 2. Export SharedFlow
      let dummyZipPath = path.join(tempDir, "dummy-sf.zip");
      fs.writeFileSync(dummyZipPath, "dummy-zip-data");
      let revision = await service.apigeeSharedFlowExport("sf-1", dummyZipPath, "my-org", "", "Bearer token123");
      expect(revision).toBe("3");

      // 3. Deploy SharedFlow Revision
      let deployRev = await service.apigeeSharedFlowRevisionDeploy(
        "sf-1",
        "3",
        "sa@my-org.iam.gserviceaccount.com",
        "prod",
        "my-org",
        "",
        "Bearer token123",
      );
      expect(deployRev).toBe("3");

      // 4. Delete SharedFlow
      let deleted = await service.apigeeSharedFlowDelete("sf-delete", "my-org", "", "Bearer token123");
      expect(deleted).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
