import { describe, it, expect } from "bun:test";
import { ApigeeConverter } from "../src/lib/converter.js";
import { ApigeeTemplaterService } from "../src/lib/service.js";
import { Product, Products, Template } from "../src/lib/interfaces.js";
import Ajv from "ajv";
import parseYaml from "yaml";
import fs from "fs";
import path from "path";

describe("Product data type and operations", () => {
  const converter = new ApigeeConverter();
  const service = new ApigeeTemplaterService();

  it("should create a default Product with expected fields", () => {
    const product = new Product();
    expect(product.type).toBe("product");
    expect(product.gateway).toBe("apigee");
    expect(product.schemaVersion).toBe("1.0.0");
    expect(product.approvalType).toBe("auto");
    expect(Array.isArray(product.environments)).toBe(true);
    expect(Array.isArray(product.proxies)).toBe(true);
  });

  it("should create a Product using converter.productCreate", () => {
    const prod = converter.productCreate(
      "my-test-product",
      "Test Product Description",
      ["my-proxy-1", "my-proxy-2"],
      ["eval", "prod"],
    );
    expect(prod.name).toBe("my-test-product");
    expect(prod.displayName).toBe("my-test-product");
    expect(prod.description).toBe("Test Product Description");
    expect(prod.proxies).toEqual(["my-proxy-1", "my-proxy-2"]);
    expect(prod.environments).toEqual(["eval", "prod"]);
  });

  it("should convert concise Product to Apigee X API format and back", () => {
    const prod: Product = {
      name: "gemini-api-product",
      displayName: "Gemini API Product",
      type: "product",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      description: "Access to Gemini endpoints",
      approvalType: "auto",
      environments: ["test", "prod"],
      proxies: ["gemini-proxy-v1"],
      apiResources: ["/v1/**"],
      scopes: ["read", "write"],
      quota: "1000",
      quotaInterval: "1",
      quotaTimeUnit: "month",
      attributes: [
        { name: "access", value: "public" },
        { name: "custom_flag", value: "true" },
      ],
      operations: [
        {
          apiSource: "gemini-proxy-v1",
          operations: [
            { name: "/models", methods: ["GET"] },
            {
              name: "/chat",
              methods: ["POST"],
              quota: { limit: "100", interval: "1", timeUnit: "minute" },
            },
          ],
        },
      ],
      llmOperations: [
        {
          apiSource: "gemini-proxy-v1",
          operations: [
            {
              name: "/chat/completions",
              methods: ["POST"],
              model: "gemini-1.5-pro",
              quota: { limit: "50", interval: "1", timeUnit: "day" },
            },
          ],
        },
      ],
      payloadOperations: [
        {
          apiSource: "gemini-proxy-v1",
          operations: [{ name: "/upload", methods: ["POST"] }],
        },
      ],
    };

    const apigeeProduct = converter.productToApigeeProduct(prod);

    // Validate Apigee X API payload shape
    expect(apigeeProduct.name).toBe("gemini-api-product");
    expect(apigeeProduct.displayName).toBe("Gemini API Product");
    expect(apigeeProduct.approvalType).toBe("auto");
    expect(apigeeProduct.environments).toEqual(["test", "prod"]);
    expect(apigeeProduct.proxies).toBeUndefined();
    expect(apigeeProduct.quota).toBe("1000");
    expect(apigeeProduct.quotaInterval).toBe("1");
    expect(apigeeProduct.quotaTimeUnit).toBe("month");
    expect(apigeeProduct.attributes).toEqual([
      { name: "access", value: "public" },
      { name: "custom_flag", value: "true" },
    ]);

    // Check operationGroup
    expect(apigeeProduct.operationGroup).toBeDefined();
    expect(apigeeProduct.operationGroup.operationConfigs.length).toBe(1);
    expect(apigeeProduct.operationGroup.operationConfigs[0].apiSource).toBe("gemini-proxy-v1");
    expect(apigeeProduct.operationGroup.operationConfigs[0].operations.length).toBe(2);
    expect(apigeeProduct.operationGroup.operationConfigs[0].operations[0].resource).toBe("/models");

    // Check llmOperationGroup
    expect(apigeeProduct.llmOperationGroup).toBeDefined();
    expect(apigeeProduct.llmOperationGroup.operationConfigs.length).toBe(1);
    expect(apigeeProduct.llmOperationGroup.operationConfigs[0].llmOperations[0].model).toBe("gemini-1.5-pro");

    // Check payloadOperationGroup
    expect(apigeeProduct.payloadOperationGroup).toBeDefined();
    expect(apigeeProduct.payloadOperationGroup.operationConfigs.length).toBe(1);
    expect(apigeeProduct.payloadOperationGroup.operationConfigs[0].operations[0].operation).toBe("/upload");

    // Convert back from Apigee X API format
    const convertedBack = converter.apigeeProductToProduct(apigeeProduct);
    expect(convertedBack.name).toBe("gemini-api-product");
    expect(convertedBack.displayName).toBe("Gemini API Product");
    expect(convertedBack.environments).toEqual(["test", "prod"]);
    expect(convertedBack.proxies).toEqual(["gemini-proxy-v1"]);
    expect(convertedBack.operations?.length).toBe(1);
    expect(convertedBack.operations?.[0].operations?.length).toBe(2);
    expect(convertedBack.llmOperations?.length).toBe(1);
    expect(convertedBack.llmOperations?.[0].operations?.[0].model).toBe("gemini-1.5-pro");
    expect(convertedBack.payloadOperations?.length).toBe(1);
  });

  it("should place operation quotas at operationConfigs level and strip invalid inner properties", () => {
    const aiStarterProduct: any = {
      name: "ai-starter-product",
      type: "product",
      displayName: "AI Starter",
      description: "Starter tier for MCP & LLM Model access.",
      approvalType: "auto",
      environments: ["dev"],
      proxies: ["MCP-CustomerService"],
      quota: "50000",
      quotaInterval: "1",
      quotaTimeUnit: "month",
      llmOperations: [
        {
          apiSource: "REST-AI-Completions",
          operations: [
            {
              name: "/v1/chat/completions",
              model: "gemini-3.5-pro",
              methods: ["POST"],
              quota: {
                limit: "10000",
                interval: "1",
                timeUnit: "minute",
              },
            },
          ],
        },
      ],
      payloadOperations: [
        {
          apiSource: "MCP-CustomerService",
          operations: [
            {
              name: "/customers/mcp",
              methods: ["POST"],
            },
          ],
        },
      ],
    };

    const apigeeProduct = converter.productToApigeeProduct(aiStarterProduct);

    // Verify LLM Operation Group shape
    const llmConfig = apigeeProduct.llmOperationGroup.operationConfigs[0];
    expect(llmConfig.apiSource).toBe("REST-AI-Completions");
    expect(llmConfig.llmTokenQuota).toEqual({
      limit: "10000",
      interval: "1",
      timeUnit: "minute",
    });
    expect(llmConfig.quota).toBeUndefined();
    expect(llmConfig.llmOperations.length).toBe(1);
    expect(llmConfig.llmOperations[0].resource).toBe("/v1/chat/completions");
    expect(llmConfig.llmOperations[0].methods).toEqual(["POST"]);
    expect(llmConfig.llmOperations[0].model).toBe("gemini-3.5-pro");
    // MUST NOT have quota or methods inside the wrong places
    expect(llmConfig.llmOperations[0].quota).toBeUndefined();

    // Verify Payload Operation Group shape
    const payloadConfig = apigeeProduct.payloadOperationGroup.operationConfigs[0];
    expect(payloadConfig.apiSource).toBe("MCP-CustomerService");
    expect(payloadConfig.protocol).toBeUndefined();
    expect(payloadConfig.operations.length).toBe(1);
    expect(payloadConfig.operations[0].operation).toBe("/customers/mcp");
    expect(payloadConfig.operations[0].methods).toBeUndefined();
    expect(payloadConfig.operations[0].resource).toBeUndefined();
  });

  it("should update parameters in a Product", () => {
    const prod = new Product();
    prod.name = "%PRODUCT_NAME%";
    prod.displayName = "%DISPLAY_NAME%";
    prod.description = "Product for %PROJECT_ID%";
    prod.environments = ["%ENV%"];
    prod.proxies = ["%PROXY_NAME%"];
    prod.attributes = [{ name: "env", value: "%ENV%" }];

    converter.productUpdateParameters(prod, {
      PRODUCT_NAME: "weather-product",
      DISPLAY_NAME: "Weather Product",
      PROJECT_ID: "my-gcp-project",
      ENV: "prod",
      PROXY_NAME: "weather-v1",
    });

    expect(prod.name).toBe("weather-product");
    expect(prod.displayName).toBe("Weather Product");
    expect(prod.description).toBe("Product for my-gcp-project");
    expect(prod.environments).toEqual(["prod"]);
    expect(prod.proxies).toEqual(["weather-v1"]);
    expect(prod.attributes?.[0].value).toBe("prod");
  });

  it("should produce readable string representations", () => {
    const prod = converter.productCreate("test-prod", "Test summary", ["proxy-a"], ["eval"]);
    prod.quota = "500";
    prod.quotaInterval = "1";
    prod.quotaTimeUnit = "day";

    const lines = converter.productToStringArray(prod);
    expect(lines.some((l) => l.includes("test-prod"))).toBe(true);
    expect(lines.some((l) => l.includes("proxy-a"))).toBe(true);
    expect(lines.some((l) => l.includes("500"))).toBe(true);

    const str = converter.productToString(prod);
    expect(str).toContain("test-prod");
  });

  it("should import, list, get, and delete local products in ApigeeTemplaterService", async () => {
    const tempDir = path.join(process.cwd(), "data", "products");
    const testProd = converter.productCreate("unit-test-product", "Unit test description", ["unit-proxy"], ["dev"]);

    // Import
    service.productImport(testProd);
    expect(fs.existsSync(path.join(tempDir, "unit-test-product.json"))).toBe(true);

    // List
    const list = await service.productsList();
    expect(list.some((p) => p.name === "unit-test-product")).toBe(true);

    // Get
    const fetched = await service.productGet("unit-test-product");
    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe("unit-test-product");

    // Delete
    const deleted = service.productDelete("unit-test-product");
    expect(deleted).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "unit-test-product.json"))).toBe(false);
  });

  it("should support products array in Template", () => {
    const template: Template = {
      name: "sample-template",
      type: "template",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      description: "Template with products",
      endpoints: [{ name: "default", basePath: "/v1/test" }],
      targets: [{ name: "default", url: "https://mocktarget.apigee.net" }],
      products: [
        "product-ref-1.yaml",
        {
          name: "inline-product",
          displayName: "Inline Product",
          type: "product",
          gateway: "apigee",
          schemaVersion: "1.0.0",
          approvalType: "auto",
          environments: ["eval"],
          proxies: ["sample-template"],
        },
      ],
    };

    expect(template.products?.length).toBe(2);
    expect(template.products?.[0]).toBe("product-ref-1.yaml");
    expect((template.products?.[1] as Product).name).toBe("inline-product");
  });

  it("should validate Product and Template with products against schema 1.0", () => {
    const schema1Path = path.join(__dirname, "../schema/gateway.schema.1.0.json");
    const schema1Json = JSON.parse(fs.readFileSync(schema1Path, "utf-8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema1Json);

    const productYaml = `
gateway: apigee
schemaVersion: 1.0.0
name: test-product
displayName: Test Product
type: product
description: Valid product yaml
approvalType: auto
environments:
  - test
  - prod
proxies:
  - test-proxy
quota: "100"
quotaInterval: "1"
quotaTimeUnit: minute
attributes:
  - name: access
    value: public
operations:
  - apiSource: test-proxy
    operations:
      - name: /items
        methods:
          - GET
          - POST
`;
    const parsedProduct = parseYaml.parse(productYaml);
    const isValidProduct = validate(parsedProduct);
    if (!isValidProduct) {
      console.error("Product validation errors:", validate.errors);
    }
    expect(isValidProduct).toBe(true);

    const templateWithProductsYaml = `
gateway: apigee
schemaVersion: 1.0.0
name: test-template
type: template
description: Template with product references
endpoints:
  - name: default
    basePath: /v1/test
targets:
  - name: default
    url: https://mocktarget.apigee.net
products:
  - test-product.yaml
  - other-product.yaml
`;
    const parsedTemplate = parseYaml.parse(templateWithProductsYaml);
    const isValidTemplate = validate(parsedTemplate);
    if (!isValidTemplate) {
      console.error("Template validation errors:", validate.errors);
    }
    expect(isValidTemplate).toBe(true);
  });
});
