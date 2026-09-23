import { describe, it, expect } from "bun:test";
import { ApigeeConverter } from "../src/lib/converter.js";
import { ApigeeTemplaterService } from "../src/lib/service.js";
import { Deployment, Deployments, Template, Feature, Proxy, Product, User, Kvm, KVM } from "../src/lib/interfaces.js";
import Ajv from "ajv";
import parseYaml from "yaml";
import fs from "fs";
import path from "path";
import { cli } from "../src/lib/cli.js";

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
    expect(Array.isArray(deployment.kvms)).toBe(true);
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

  it("should create a default Kvm instance and validate KVM alias", () => {
    const kvm = new Kvm();
    expect(kvm.name).toBe("");
    expect(kvm.type).toBe("environment");
    expect(kvm.values).toEqual({});
    expect(kvm.proxy).toBeUndefined();

    const kvmAlias = new KVM();
    expect(kvmAlias instanceof Kvm).toBe(true);
  });

  it("should validate Deployment with environment and proxy kvms against schema", () => {
    const ajv = new Ajv({ strict: false });
    const schemaContent = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "schema/gateway.schema.1.0.json"), "utf8"),
    );
    const validate = ajv.compile(schemaContent);

    const deploymentWithKvms = {
      name: "kvm-deployment",
      type: "deployment",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      kvms: [
        {
          name: "env-config",
          type: "environment",
          values: {
            API_KEY: "secret-key",
            HOST: "https://api.example.com",
          },
        },
        {
          name: "proxy-config",
          type: "proxy",
          proxy: "my-proxy",
          values: {
            TIMEOUT: "3000",
          },
        },
      ],
    };

    const valid = validate(deploymentWithKvms);
    if (!valid) {
      console.error("Validation errors for deployment with KVMs:", validate.errors);
    }
    expect(valid).toBe(true);
  });

  it("should fail validation if proxy KVM lacks proxy property", () => {
    const ajv = new Ajv({ strict: false });
    const schemaContent = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "schema/gateway.schema.1.0.json"), "utf8"),
    );
    const validate = ajv.compile(schemaContent);

    const invalidProxyKvm = {
      name: "invalid-proxy-deployment",
      type: "deployment",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      kvms: [
        {
          name: "missing-proxy-property",
          type: "proxy",
          values: {
            KEY: "val",
          },
        },
      ],
    };

    const valid = validate(invalidProxyKvm);
    expect(valid).toBe(false);
  });

  it("should fail validation if KVM has invalid type or missing required fields", () => {
    const ajv = new Ajv({ strict: false });
    const schemaContent = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "schema/gateway.schema.1.0.json"), "utf8"),
    );
    const validate = ajv.compile(schemaContent);

    const invalidTypeKvm = {
      name: "invalid-type-deployment",
      type: "deployment",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      kvms: [
        {
          name: "bad-type",
          type: "organization",
          values: { KEY: "val" },
        },
      ],
    };
    expect(validate(invalidTypeKvm)).toBe(false);

    const missingValuesKvm = {
      name: "missing-values-deployment",
      type: "deployment",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      kvms: [
        {
          name: "no-values",
          type: "environment",
        },
      ],
    };
    expect(validate(missingValuesKvm)).toBe(false);

    const missingNameKvm = {
      name: "missing-name-deployment",
      type: "deployment",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      kvms: [
        {
          type: "environment",
          values: { KEY: "val" },
        },
      ],
    };
    expect(validate(missingNameKvm)).toBe(false);
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
      kvms: [
        { name: "env-kvm", type: "environment", values: { k: "v" } },
        { name: "proxy-kvm", type: "proxy", proxy: "proxy-1", values: { p: "v" } },
      ],
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
    expect(lines).toContain("KVMs: env-kvm, proxy-kvm");
    expect(lines).toContain("Parameters: ENV_NAME");

    const str = converter.deploymentToString(deployment);
    expect(str).toContain("Name: test-deployment");
    expect(str).toContain("KVMs: env-kvm, proxy-kvm");
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
      kvms: [
        {
          name: "kvm-$ENV",
          type: "proxy",
          proxy: "proxy-$ENV",
          values: {
            "KEY_$ENV": "VAL_$ENV",
          },
        },
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
    expect(deployment.kvms![0].name).toBe("kvm-staging");
    expect(deployment.kvms![0].proxy).toBe("proxy-staging");
    expect(deployment.kvms![0].values).toEqual({ KEY_staging: "VAL_staging" });
  });

  it("should reset deployment returning a fresh clone", () => {
    const deployment: Deployment = {
      name: "original-deployment",
      type: "deployment",
      templates: ["template-1"],
      kvms: [{ name: "kvm-1", type: "environment", values: { a: "b" } }],
    };

    const reset = converter.deploymentReset(deployment);
    expect(reset).toEqual(deployment);
    expect(reset).not.toBe(deployment); // Must be a clone
    expect(reset.kvms).not.toBe(deployment.kvms);
  });

  it("should convert product to Apigee emulator product format", () => {
    const product: Product = {
      name: "test-product",
      displayName: "Test Product Display",
      description: "Test Product Description",
      quota: 100,
      quotaInterval: "1",
      quotaTimeUnit: "minute",
      attributes: [{ name: "access", value: "public" }],
    };

    const emProduct = converter.productToApigeeEmulatorProduct(
      product,
      ["test-proxy"],
      ["eval"],
    );

    expect(emProduct.name).toBe("test-product");
    expect(emProduct.displayName).toBe("Test Product Display");
    expect(emProduct.approvalType).toBe("auto");
    expect(emProduct.environments).toEqual(["eval"]);
    expect(emProduct.proxies).toEqual(["test-proxy"]);
    expect(emProduct.apiResources).toEqual(["/", "/*", "/**"]);
    expect(emProduct.quota).toBe("100");
  });

  it("should convert user to Apigee emulator apps format with credentials", () => {
    const user: User = {
      name: "dev-user",
      email: "dev@example.com",
      userName: "devuser",
      apps: [
        {
          name: "dev-app",
          displayName: "Developer App",
          products: ["test-product"],
          credentials: [
            {
              consumerKey: "test-key-123",
              consumerSecret: "test-secret-456",
            },
          ],
        },
      ],
    };

    const emApps = converter.userToApigeeEmulatorApps(user);
    expect(emApps.length).toBe(1);
    expect(emApps[0].name).toBe("dev-app");
    expect(emApps[0].developerEmail).toBe("dev@example.com");
    expect(emApps[0].expiryType).toBe("never");
    expect(emApps[0].credentials.length).toBe(1);
    expect(emApps[0].credentials[0].consumerKey).toBe("test-key-123");
    expect(emApps[0].credentials[0].consumerSecret).toBe("test-secret-456");
    expect(emApps[0].credentials[0].status).toBe("approved");
    expect(emApps[0].credentials[0].apiProducts).toEqual([
      { apiproduct: "test-product", status: "approved" },
    ]);
  });

  it("should convert deployment to ZIP bundle and emulator JSON files with -f zip and -o <dir>", async () => {
    const myCli = new cli();
    const outDir = path.join(process.cwd(), "tests/tmp-deployment-export-zip");
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });

    await myCli.process([
      "bun",
      "apigee-templater.ts",
      "tests/data/deployment-01.yaml",
      "-f",
      "zip",
      "-o",
      outDir,
      "--no-anim",
    ]);

    expect(fs.existsSync(outDir)).toBe(true);

    // 1. Template converted to proxy zip
    const proxyZip = path.join(outDir, "REST-AI-Completions.zip");
    expect(fs.existsSync(proxyZip)).toBe(true);
    expect(fs.statSync(proxyZip).size).toBeGreaterThan(0);

    // 2. Emulator Products
    const productsJson = path.join(outDir, "products.json");
    const apiproductsJson = path.join(outDir, "apiproducts.json");
    const individualProductJson = path.join(outDir, "ai-starter-package.json");

    expect(fs.existsSync(productsJson)).toBe(true);
    expect(fs.existsSync(apiproductsJson)).toBe(true);
    expect(fs.existsSync(individualProductJson)).toBe(true);

    const products = JSON.parse(fs.readFileSync(productsJson, "utf8"));
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].name).toBe("ai-starter-package");
    expect(products[0].proxies).toContain("REST-AI-Completions");
    expect(products[0].apiResources).toBeDefined();

    // 3. Emulator Developers / Users
    const developersJson = path.join(outDir, "developers.json");
    const usersJson = path.join(outDir, "users.json");
    const individualUserJson = path.join(outDir, "test@example.com.json");

    expect(fs.existsSync(developersJson)).toBe(true);
    expect(fs.existsSync(usersJson)).toBe(true);
    expect(fs.existsSync(individualUserJson)).toBe(true);

    const developers = JSON.parse(fs.readFileSync(developersJson, "utf8"));
    expect(Array.isArray(developers)).toBe(true);
    expect(developers.length).toBeGreaterThan(0);
    expect(developers[0].email).toBe("test@example.com");

    // 4. Emulator Apps
    const developerappsJson = path.join(outDir, "developerapps.json");
    const appsJson = path.join(outDir, "apps.json");
    const individualAppJson = path.join(outDir, "Starter App.json");

    expect(fs.existsSync(developerappsJson)).toBe(true);
    expect(fs.existsSync(appsJson)).toBe(true);
    expect(fs.existsSync(individualAppJson)).toBe(true);

    const apps = JSON.parse(fs.readFileSync(developerappsJson, "utf8"));
    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThan(0);
    expect(apps[0].name).toBe("Starter App");
    expect(apps[0].developerEmail).toBe("test@example.com");
    expect(apps[0].credentials.length).toBeGreaterThan(0);
    expect(apps[0].credentials[0].consumerKey).toBe("starter-app-key-123");

    // Cleanup
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("should convert deployment to JSON proxy files and emulator JSON files with -f json and -o <dir>", async () => {
    const myCli = new cli();
    const outDir = path.join(process.cwd(), "tests/tmp-deployment-export-json");
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });

    await myCli.process([
      "bun",
      "apigee-templater.ts",
      "tests/data/deployment-01.yaml",
      "-f",
      "json",
      "-o",
      outDir,
      "--no-anim",
    ]);

    expect(fs.existsSync(outDir)).toBe(true);

    // 1. Template converted to proxy json
    const proxyJson = path.join(outDir, "REST-AI-Completions.json");
    expect(fs.existsSync(proxyJson)).toBe(true);
    const parsedProxy = JSON.parse(fs.readFileSync(proxyJson, "utf8"));
    expect(parsedProxy.name).toBe("REST-AI-Completions");
    expect(parsedProxy.endpoints.length).toBeGreaterThan(0);

    // 2. Emulator files
    expect(fs.existsSync(path.join(outDir, "products.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "developers.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "developerapps.json"))).toBe(true);

    // Cleanup
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("should convert deployment to local directory when -o is omitted with -f zip", async () => {
    const myCli = new cli();
    const expectedFiles = [
      "REST-AI-Completions.zip",
      "products.json",
      "apiproducts.json",
      "ai-starter-package.json",
      "developers.json",
      "users.json",
      "test@example.com.json",
      "developerapps.json",
      "apps.json",
      "Starter App.json",
      "Premium App.json",
    ];

    // Cleanup any existing before run
    for (const file of expectedFiles) {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    }

    await myCli.process([
      "bun",
      "apigee-templater.ts",
      "tests/data/deployment-01.yaml",
      "-f",
      "zip",
      "--no-anim",
    ]);

    for (const file of expectedFiles) {
      expect(fs.existsSync(file), `Expected ${file} to exist`).toBe(true);
      fs.rmSync(file, { force: true });
    }
  });

  it("should convert deployment with kvms and export maps.json", async () => {
    const myCli = new cli();
    const outDir = path.join(process.cwd(), "tests/tmp-deployment-kvms-export");
    const deployYamlPath = path.join(process.cwd(), "tests/tmp-deployment-kvms.yaml");

    const yamlContent = `
name: deployment-with-kvms
type: deployment
gateway: apigee
schemaVersion: 1.0.0
environments:
  - test
kvms:
  - name: test-env-kvm
    type: environment
    values:
      API_KEY: my-secret-key
  - name: test-proxy-kvm
    type: proxy
    proxy: my-proxy
    values:
      ROUTING: direct
`;

    fs.writeFileSync(deployYamlPath, yamlContent, "utf8");
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });

    await myCli.process([
      "bun",
      "apigee-templater.ts",
      deployYamlPath,
      "-f",
      "json",
      "-o",
      outDir,
      "--no-anim",
    ]);

    expect(fs.existsSync(outDir)).toBe(true);
    const mapsJsonPath = path.join(outDir, "maps.json");
    expect(fs.existsSync(mapsJsonPath)).toBe(true);

    const maps = JSON.parse(fs.readFileSync(mapsJsonPath, "utf8"));
    expect(maps.length).toBe(2);
    expect(maps[0]).toEqual({
      name: "test-env-kvm",
      scope: "environment",
      entries: { API_KEY: "my-secret-key" },
      environment: "test",
    });
    expect(maps[1]).toEqual({
      name: "test-proxy-kvm",
      scope: "proxy",
      proxy: "my-proxy",
      entries: { ROUTING: "direct" },
      environment: "test",
    });

    // Cleanup
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(deployYamlPath, { force: true });
  });
});
