import { describe, it, expect } from "bun:test";
import { ApigeeConverter } from "../src/lib/converter.js";
import { ApigeeTemplaterService } from "../src/lib/service.js";
import { Deployment, Deployments, Template, Feature, Proxy, Product, User } from "../src/lib/interfaces.js";
import Ajv from "ajv";
import parseYaml from "yaml";
import fs from "fs";
import path from "path";

describe("Deployment data type, resolution, and operations", () => {
  const converter = new ApigeeConverter();
  const service = new ApigeeTemplaterService();

  it("should create a default Deployment instance with expected fields", () => {
    const deployment = new Deployment();
    expect(deployment.type).toBe("deployment");
    expect(deployment.gateway).toBe("apigee");
    expect(deployment.schemaVersion).toBe("1.0.0");
    expect(Array.isArray(deployment.templates)).toBe(true);
    expect(Array.isArray(deployment.proxies)).toBe(true);
    expect(Array.isArray(deployment.features)).toBe(true);
    expect(Array.isArray(deployment.products)).toBe(true);
    expect(Array.isArray(deployment.users)).toBe(true);
  });

  it("should validate deployment-01.yaml against gateway JSON schema", () => {
    const ajv = new Ajv({ strict: false });
    const schemaContent = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "schema/gateway.schema.1.0.json"), "utf8"),
    );
    const validate = ajv.compile(schemaContent);

    const deploymentYaml = fs.readFileSync(path.join(process.cwd(), "tests/data/deployment-01.yaml"), "utf8");
    const deploymentData = parseYaml.parse(deploymentYaml);

    const valid = validate(deploymentData);
    if (!valid) {
      console.error("Validation errors:", validate.errors);
    }
    expect(valid).toBe(true);
  });

  it("should validate an inline Deployment object with full inline assets and references against JSON schema", () => {
    const ajv = new Ajv({ strict: false });
    const schemaContent = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "schema/gateway.schema.1.0.json"), "utf8"),
    );
    const validate = ajv.compile(schemaContent);

    const inlineDeployment = {
      name: "full-deployment",
      displayName: "Full Deployment",
      type: "deployment",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      description: "Deployment with both inline assets and string references",
      environments: ["dev", "prod"],
      templates: [
        "REST-AI-Completions.yaml",
        {
          name: "inline-template",
          type: "template",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          endpoints: [
            {
              name: "default",
              basePath: "/v1/inline",
            },
          ],
          targets: [
            {
              name: "default",
              url: "https://httpbin.org",
            },
          ],
        },
      ],
      proxies: [
        {
          name: "inline-proxy",
          type: "proxy",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          endpoints: [
            {
              name: "default",
              basePath: "/v1/proxy",
            },
          ],
        },
      ],
      features: [
        "cors",
        {
          name: "inline-feature",
          type: "feature",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          policies: [
            {
              name: "AM-Custom",
              type: "AssignMessage",
            },
          ],
        },
      ],
      products: [
        "sample-product",
        {
          name: "inline-product",
          type: "product",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          environments: ["dev"],
          proxies: ["inline-proxy"],
        },
      ],
      users: [
        "dev@example.com",
        {
          name: "inline-user",
          type: "user",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          email: "inline-dev@example.com",
        },
      ],
    };

    const valid = validate(inlineDeployment);
    if (!valid) {
      console.error("Validation errors for inline deployment:", validate.errors);
    }
    expect(valid).toBe(true);
  });

  it("should load deployment and resolve both inline assets and file references dynamically", async () => {
    const deploymentFile = path.join(process.cwd(), "tests/data/deployment-01.yaml");
    const deployment = await service.deploymentGet(deploymentFile);
    expect(deployment).toBeDefined();
    expect(deployment!.name).toBe("deployment-01");
    expect(deployment!.type).toBe("deployment");

    const resolved = await service.deploymentResolveAssets(deployment!, path.dirname(deploymentFile));
    expect(resolved).toBeDefined();
    expect(resolved.templates.length).toBeGreaterThan(0);
    expect(resolved.templates[0].name).toBe("REST-AI-Completions");

    // Verify converting template without features to proxy does not throw
    const tProxy = await service.templateObjectToProxy(
      resolved.templates[0],
      converter,
      {},
      path.dirname(deploymentFile),
    );
    expect(tProxy).toBeDefined();
    expect(tProxy!.name).toBe("REST-AI-Completions");
    expect(tProxy!.endpoints.length).toBeGreaterThan(0);
  });

  it("should convert template object without features property to proxy cleanly", async () => {
    const rawTemplate = {
      name: "minimal-template",
      type: "template",
      endpoints: [
        {
          name: "default",
          basePath: "/v1/minimal",
          routes: [{ name: "default", target: "default" }],
        },
      ],
      targets: [
        {
          name: "default",
          url: "https://example.com",
        },
      ],
    } as any;

    const proxy = await service.templateObjectToProxy(rawTemplate, converter);
    expect(proxy).toBeDefined();
    expect(proxy!.name).toBe("minimal-template");
    expect(proxy!.endpoints[0].basePath).toBe("/v1/minimal");
  });

  it("should safely add and remove features when template.features is initially undefined", () => {
    const rawTemplate = {
      name: "no-features-tmpl",
      type: "template",
      parameters: [],
      endpoints: [],
    } as any;

    const mockFeature: Feature = {
      name: "test-feature",
      type: "feature",
      parameters: [{ name: "PARAM_1", default: "default-val" }],
      endpoints: [{ name: "feat-ep", basePath: "/feat" }],
    };

    const updated = converter.templateApplyFeature(rawTemplate, [mockFeature], "test-feature", mockFeature);
    expect(updated.features).toBeDefined();
    expect(updated.features).toContain("test-feature");

    const removed = converter.templateRemoveFeature(updated, [mockFeature], "test-feature", mockFeature);
    expect(removed.features).not.toContain("test-feature");
  });

  it("should resolve mixed inline objects and string references with deploymentResolveAssets", async () => {
    const mixedDeployment: Deployment = {
      name: "mixed-deployment",
      type: "deployment",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      templates: [
        "REST-AI-Completions.yaml",
        {
          name: "direct-template",
          type: "template",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          endpoints: [
            {
              name: "default",
              basePath: "/v1/direct",
              target: { name: "default", url: "https://example.com" },
            },
          ],
        },
      ],
      proxies: [
        {
          name: "direct-proxy",
          type: "proxy",
          gateway: "apigee",
          schemaVersion: "1.0.0",
        },
      ],
      features: [
        {
          name: "direct-feature",
          type: "feature",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          policies: [],
        },
      ],
      products: [
        {
          name: "direct-product",
          type: "product",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          approvalType: "auto",
        },
      ],
      users: [
        {
          name: "direct-user",
          type: "user",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          email: "direct@example.com",
        },
      ],
    };

    const resolved = await service.deploymentResolveAssets(mixedDeployment, process.cwd());
    expect(resolved.templates.length).toBe(2);
    expect(resolved.templates[0].name).toBe("REST-AI-Completions");
    expect(resolved.templates[1].name).toBe("direct-template");

    expect(resolved.proxies.length).toBe(1);
    expect(resolved.proxies[0].name).toBe("direct-proxy");

    expect(resolved.features.length).toBe(1);
    expect(resolved.features[0].name).toBe("direct-feature");

    expect(resolved.products.length).toBe(1);
    expect(resolved.products[0].name).toBe("direct-product");

    expect(resolved.users.length).toBe(1);
    expect(resolved.users[0].name).toBe("direct-user");
  });

  it("should format Deployment to string array and string", () => {
    const deployment: Deployment = {
      name: "test-deployment",
      displayName: "Test Deployment Display",
      description: "A test deployment description",
      environments: ["dev", "prod"],
      templates: ["template-1", { name: "template-2" } as Template],
      proxies: ["proxy-1"],
      features: ["feature-1"],
      products: ["product-1"],
      users: ["user-1"],
      parameters: [{ name: "ENV_NAME", value: "dev" }],
    };

    const lines = converter.deploymentToStringArray(deployment);
    expect(lines).toContain("Name: test-deployment");
    expect(lines).toContain("Display Name: Test Deployment Display");
    expect(lines).toContain("Description: A test deployment description");
    expect(lines).toContain("Environments: dev, prod");
    expect(lines).toContain("Templates: template-1, template-2");
    expect(lines).toContain("Proxies: proxy-1");
    expect(lines).toContain("Features: feature-1");
    expect(lines).toContain("Products: product-1");
    expect(lines).toContain("Users: user-1");
    expect(lines).toContain("Parameters: ENV_NAME");

    const str = converter.deploymentToString(deployment);
    expect(str).toContain("Name: test-deployment");
  });

  it("should update parameters across deployment and inline assets", () => {
    const deployment: Deployment = {
      name: "deploy-$ENV",
      displayName: "Deploy for $ENV",
      environments: ["$ENV"],
      templates: [
        "template-$ENV",
        {
          name: "tmpl-$ENV",
          endpoints: [{ name: "ep", basePath: "/$ENV", target: { name: "t", url: "https://$ENV.example.com" } }],
        } as Template,
      ],
      proxies: [
        "proxy-$ENV",
        {
          name: "prx-$ENV",
          endpoints: [{ name: "ep", basePath: "/$ENV" }],
        } as Proxy,
      ],
      products: [
        "prod-$ENV",
        {
          name: "prod-obj-$ENV",
          environments: ["$ENV"],
        } as Product,
      ],
      users: [
        "user-$ENV@example.com",
        {
          name: "user-$ENV",
          email: "user-$ENV@test.com",
        } as User,
      ],
    };

    converter.deploymentUpdateParameters(deployment, { ENV: "staging" });
    expect(deployment.name).toBe("deploy-staging");
    expect(deployment.displayName).toBe("Deploy for staging");
    expect(deployment.environments).toEqual(["staging"]);
    expect(deployment.templates![0]).toBe("template-staging");
    expect((deployment.templates![1] as Template).name).toBe("tmpl-staging");
    expect(deployment.proxies![0]).toBe("proxy-staging");
    expect((deployment.proxies![1] as Proxy).name).toBe("prx-staging");
    expect(deployment.products![0]).toBe("prod-staging");
    expect((deployment.products![1] as Product).name).toBe("prod-obj-staging");
    expect(deployment.users![0]).toBe("user-staging@example.com");
    expect((deployment.users![1] as User).name).toBe("user-staging");
  });

  it("should reset deployment returning a fresh clone", () => {
    const deployment: Deployment = {
      name: "original-deployment",
      type: "deployment",
      templates: ["template-1"],
    };

    const reset = converter.deploymentReset(deployment);
    expect(reset).toEqual(deployment);
    expect(reset).not.toBe(deployment); // Must be a clone
  });
});
